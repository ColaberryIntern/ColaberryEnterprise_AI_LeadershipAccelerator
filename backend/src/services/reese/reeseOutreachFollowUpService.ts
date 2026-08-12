import crypto from 'crypto';
import { Op } from 'sequelize';
import ReeseOutreach from '../../models/ReeseOutreach';
import RoomMessage from '../../models/RoomMessage';
import CommunityRoom from '../../models/CommunityRoom';
import { updateTicketStatus, addTicketComment } from '../ticketService';
import { recordEvidenceArtifact } from '../evidence/evidenceService';
import { evaluateInactivitySignal, evaluateBehaviorAnomalySignal } from './reeseSignalService';
import { generateOutreachMessage } from './reeseOutreachMessageService';
import { initiateDm } from './reeseInitiateDmService';
import { getReeseAdminUserId, getReeseEnrollmentId } from './reeseIdentitySeed';
import { countAutonomousSendsToday, DAILY_SEND_CAP, FOLLOW_UP_DAYS } from './reeseAutonomousOutreachService';

// Reese Phase 2 (Autonomous Outreach) — the follow-up + closure loop. Mirrors
// M5's outcomeMeasurementService.ts structurally (a `status`/due-timestamp
// column swept by a daily cron), not by sharing its table — ReeseOutreach is
// its own model because its lifecycle (goal-met / signal-cleared / escalated,
// with a real send on the "not yet resolved" branch) is genuinely different
// from OutcomeMeasurement's single scheduled-then-observed shape.

const MAX_ATTEMPTS = 3;

export interface FollowUpDecision {
  outreachId: string;
  enrollmentId: string;
  branch: 'signal_cleared' | 'goal_met' | 'follow_up_sent' | 'escalated' | 'daily_cap_deferred';
}

export interface FollowUpResult {
  dryRun: boolean;
  processed: number;
  signalCleared: number;
  goalMet: number;
  followUpSent: number;
  escalated: number;
  dailyCapDeferred: number;
  decisions: FollowUpDecision[];
}

async function evaluateCurrentSignal(row: ReeseOutreach): Promise<Record<string, any> | null> {
  if (row.signal_type === 'inactivity') {
    return evaluateInactivitySignal(row.enrollment_id);
  }
  return evaluateBehaviorAnomalySignal(row.enrollment_id);
}

/**
 * A "reply" must come from the STUDENT'S real DM thread WITH REESE
 * specifically — not any message the student sent anywhere in the platform.
 * ReeseOutreach doesn't store a room id, so this re-derives the same
 * deterministic DM slug dmService.ts's openDm() uses
 * (`dm-<sorted-a>-<sorted-b>`) to find that exact room, then scopes the
 * message query to it. Returns null (never throws) if Reese's identity or the
 * room can't be resolved — a missing room means no evidence of a reply, not a
 * false positive.
 */
async function findStudentReplySince(enrollmentId: string, since: Date) {
  const reeseEnrollmentId = await getReeseEnrollmentId();
  if (!reeseEnrollmentId) return null;

  const [a, b] = [reeseEnrollmentId, enrollmentId].sort();
  const slug = `dm-${a}-${b}`;
  const room = await CommunityRoom.findOne({ where: { slug } });
  if (!room) return null;

  return RoomMessage.findOne({
    where: {
      room_id: room.id,
      enrollment_id: enrollmentId,
      created_at: { [Op.gt]: since },
      deleted_at: null,
    },
    order: [['created_at', 'DESC']],
  });
}

async function closeWithEvidence(
  row: ReeseOutreach,
  status: 'signal_cleared' | 'goal_met',
  artifactType: 'receipt' | 'log',
  evidenceMetadata: Record<string, any>,
  storageRef?: string,
): Promise<void> {
  const reeseAdminUserId = await getReeseAdminUserId();
  const actorId = reeseAdminUserId || 'Reese';

  const eventId = crypto.randomUUID();
  await recordEvidenceArtifact({
    ticketId: row.ticket_id,
    artifactType,
    storageRef: storageRef ?? null,
    sourceEventId: storageRef ? undefined : eventId,
    title: status === 'signal_cleared' ? 'Signal re-evaluated: cleared' : 'Student replied — goal met',
    metadata: evidenceMetadata,
  });

  await updateTicketStatus(row.ticket_id, 'done', 'ai_staff', actorId);
  await row.update({ status, next_follow_up_due_at: null } as any);
}

async function escalate(row: ReeseOutreach): Promise<void> {
  const reeseAdminUserId = await getReeseAdminUserId();
  const actorId = reeseAdminUserId || 'Reese';
  await addTicketComment(
    row.ticket_id,
    `[Reese] Reached the ${MAX_ATTEMPTS}-attempt autonomous follow-up cap for this student without a resolved ` +
      `signal or a reply. Flagging for human review rather than messaging again or auto-closing.`,
    'ai_staff',
    actorId,
  );
  await row.update({ status: 'escalated', next_follow_up_due_at: null } as any);
}

async function sendFollowUp(row: ReeseOutreach, currentSnapshot: Record<string, any>): Promise<void> {
  const message = await generateOutreachMessage({
    enrollmentId: row.enrollment_id,
    signalType: row.signal_type,
    signalSnapshot: currentSnapshot,
    goal: row.goal,
    isFollowUp: true,
    attemptNumber: row.attempt_count + 1,
  });
  await initiateDm(row.enrollment_id, message);
  await row.update({
    attempt_count: row.attempt_count + 1,
    last_contacted_at: new Date(),
    next_follow_up_due_at: new Date(Date.now() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000),
    signal_snapshot: currentSnapshot,
  } as any);
}

/**
 * Sweeps every `status='active'` ReeseOutreach row whose `next_follow_up_due_at`
 * has arrived and resolves it via the decision tree: signal-cleared (real
 * evidence, close) > student-replied (real evidence, close) > under attempt
 * cap (send one more unique follow-up, reschedule) > at cap (escalate to
 * human review, never send a 4th message, never auto-close).
 *
 * `dryRun: true` computes every branch decision without any real write/send —
 * same contract as reeseAutonomousOutreachService.ts's sweep.
 */
export async function processDueReeseOutreachFollowUps(dryRun = false): Promise<FollowUpResult> {
  const due = await ReeseOutreach.findAll({
    where: { status: 'active', next_follow_up_due_at: { [Op.lte]: new Date() } },
  });

  const decisions: FollowUpDecision[] = [];

  for (const row of due) {
    const currentSignal = await evaluateCurrentSignal(row);

    if (!currentSignal) {
      if (!dryRun) {
        await closeWithEvidence(row, 'signal_cleared', 'receipt', {
          previous_snapshot: row.signal_snapshot,
          resolved_at: new Date().toISOString(),
        });
      }
      decisions.push({ outreachId: row.id, enrollmentId: row.enrollment_id, branch: 'signal_cleared' });
      continue;
    }

    const reply = await findStudentReplySince(row.enrollment_id, row.last_contacted_at);
    if (reply) {
      if (!dryRun) {
        await closeWithEvidence(
          row,
          'goal_met',
          'log',
          { reply_message_id: reply.id, reply_at: reply.created_at },
          reply.id,
        );
      }
      decisions.push({ outreachId: row.id, enrollmentId: row.enrollment_id, branch: 'goal_met' });
      continue;
    }

    if (row.attempt_count >= MAX_ATTEMPTS) {
      if (!dryRun) await escalate(row);
      decisions.push({ outreachId: row.id, enrollmentId: row.enrollment_id, branch: 'escalated' });
      continue;
    }

    // Checked in BOTH real and dry-run mode (unlike the writes below) so a
    // dry-run report is honest about what the daily cap would actually do —
    // otherwise every under-cap-attempt row would be reported as
    // "would send" even when the real cap would have deferred it.
    const sentToday = await countAutonomousSendsToday();
    if (sentToday >= DAILY_SEND_CAP) {
      if (!dryRun) {
        // Reschedule the check for later the same day rather than consuming
        // an attempt or escalating — the daily cap is a pacing limit, not a
        // reason to give up on this student.
        await row.update({ next_follow_up_due_at: new Date(Date.now() + 60 * 60 * 1000) } as any);
      }
      decisions.push({ outreachId: row.id, enrollmentId: row.enrollment_id, branch: 'daily_cap_deferred' });
      continue;
    }

    if (!dryRun) {
      await sendFollowUp(row, currentSignal);
    }
    decisions.push({ outreachId: row.id, enrollmentId: row.enrollment_id, branch: 'follow_up_sent' });
  }

  return {
    dryRun,
    processed: decisions.length,
    signalCleared: decisions.filter((d) => d.branch === 'signal_cleared').length,
    goalMet: decisions.filter((d) => d.branch === 'goal_met').length,
    followUpSent: decisions.filter((d) => d.branch === 'follow_up_sent').length,
    escalated: decisions.filter((d) => d.branch === 'escalated').length,
    dailyCapDeferred: decisions.filter((d) => d.branch === 'daily_cap_deferred').length,
    decisions,
  };
}
