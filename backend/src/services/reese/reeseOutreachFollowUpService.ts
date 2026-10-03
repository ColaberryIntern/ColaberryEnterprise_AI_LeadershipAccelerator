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
import { countAutonomousSendsToday, DAILY_SEND_CAP, FOLLOW_UP_DAYS, RISK_TIER } from './reeseAutonomousOutreachService';
import { createClosureChecklistInstance } from './closureChecklist';
import { emitReeseLedgerEvent } from './reeseWorkLedgerEvents';
import { authorizeTicketDispatch } from '../workLedger/agentActionAuthorizationBridge';

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
  branch: 'signal_cleared' | 'goal_met' | 'follow_up_sent' | 'escalated' | 'daily_cap_deferred' | 'held_for_approval';
}

export interface FollowUpResult {
  dryRun: boolean;
  processed: number;
  signalCleared: number;
  goalMet: number;
  followUpSent: number;
  escalated: number;
  dailyCapDeferred: number;
  /** Real-enforcement scoping, Phase 3 (R209/R210, 2026-10-01) — a
   * send/escalation genuinely held by the ABAC gate (only possible when
   * `abac_mode_override`/`abac_enforcement` is 'enforce' and the policy
   * denies). Counted separately, never folded into `followUpSent`/
   * `escalated` — a held action was NOT sent/escalated, and reporting it as
   * if it were would be dishonest, the exact class of bug this phase's own
   * mission exists to close. */
  heldForApproval: number;
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

  // Phase 2 (2026-09-18) — R13's own finding: closure never wrote to the
  // real Work Ledger. Fail-open, after the real closure.
  await emitReeseLedgerEvent({
    ticketId: row.ticket_id,
    traceId: eventId,
    actorType: 'ai_staff',
    actorId,
    intent: status === 'signal_cleared' ? 'reese.outreach_signal_cleared' : 'reese.outreach_goal_met',
    domain: 'student_support',
    actionClass: 'ticket_close',
    targetType: 'ticket',
    targetId: row.ticket_id,
    riskTier: RISK_TIER,
    idempotencyKey: `reese-outreach-close:${row.ticket_id}:${status}`,
    result: 'success',
    sourceRecordType: 'reese_outreach',
    sourceRecordId: row.id,
  });

  // Reese Agentic AI Employee mission, Capability 6 — a real, persisted
  // Closure checklist per resolution, linked to this outreach's real
  // ticket. Observational only (same posture as outreachChecklist.ts):
  // computed AFTER the real closure already happened, never gating it.
  // Fail-open: a checklist bookkeeping failure must never surface as a
  // closure defect.
  try {
    await createClosureChecklistInstance(row.ticket_id, row.goal, row.created_at, new Date());
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'reeseOutreachFollowUpService', event: 'closure_checklist_instance_failed',
      ticket_id: row.ticket_id, error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
  }
}

/** Real-enforcement scoping, Phase 3 (R210, 2026-10-01) — gated the same
 * way `sendNewOutreach()` already is, evaluated BEFORE the real mutation
 * (per `agentActionAuthorizationBridge.ts`'s own documented "gate ahead of
 * the action" design intent). Returns whether escalation actually happened,
 * so the caller never records 'escalated' for a held action — a
 * genuinely new branch, not a silent no-op, since this is the SAFETY path
 * (flag a human when autonomous attempts are exhausted); a caller that
 * can't tell "escalated" from "silently did nothing" would be worse than
 * before this gate existed. */
async function escalate(row: ReeseOutreach): Promise<{ escalated: boolean }> {
  const reeseAdminUserId = await getReeseAdminUserId();
  const actorId = reeseAdminUserId || 'Reese';

  const eventId = crypto.randomUUID();
  const authResult = await authorizeTicketDispatch({
    eventId,
    ticketId: row.ticket_id,
    agentName: 'Reese',
    action: 'reese_outreach_escalated',
    riskTier: RISK_TIER,
    preparedAction: { ticketId: row.ticket_id, outreachId: row.id },
  });

  if (!authResult.allowed) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'info', service: 'reeseOutreachFollowUpService',
      event: 'escalation_held_for_approval', outcome: 'partial', correlation_id: eventId,
      context: { ticket_id: row.ticket_id, outreach_id: row.id, reason: authResult.reason },
    }));
    return { escalated: false };
  }

  await addTicketComment(
    row.ticket_id,
    `[Reese] Reached the ${MAX_ATTEMPTS}-attempt autonomous follow-up cap for this student without a resolved ` +
      `signal or a reply. Flagging for human review rather than messaging again or auto-closing.`,
    'ai_staff',
    actorId,
  );
  await row.update({ status: 'escalated', next_follow_up_due_at: null } as any);

  // Phase 2 (2026-09-18) — escalation never wrote to the real Work Ledger.
  // Approval-correlation fix (2026-10-02) — thread the same eventId/decisionId
  // the authorization check above already generated, instead of a fresh,
  // disconnected traceId.
  await emitReeseLedgerEvent({
    ticketId: row.ticket_id,
    eventId,
    authorizationDecisionId: authResult.decisionId,
    traceId: crypto.randomUUID(),
    actorType: 'ai_staff',
    actorId,
    intent: 'reese.outreach_escalated',
    domain: 'student_support',
    actionClass: 'escalation',
    targetType: 'ticket',
    targetId: row.ticket_id,
    riskTier: RISK_TIER,
    idempotencyKey: `reese-outreach-escalate:${row.ticket_id}`,
    result: 'success',
    sourceRecordType: 'reese_outreach',
    sourceRecordId: row.id,
  });

  return { escalated: true };
}

/** Real-enforcement scoping, Phase 3 (R209, 2026-10-01) — gated the same
 * way `sendNewOutreach()` already is. A held action returns here, BEFORE
 * `initiateDm()` and every downstream write below it — deliberately, so a
 * held follow-up is never recorded as a real contact (same reasoning
 * `reeseAutonomousOutreachService.ts`'s own comment documents for its
 * `ReeseOutreach.create()` call: a stamped `last_contacted_at` for a send
 * that never happened would incorrectly suppress a legitimate future
 * attempt). Returns whether the follow-up actually sent, so the caller
 * never records 'follow_up_sent' for a held action. */
async function sendFollowUp(row: ReeseOutreach, currentSnapshot: Record<string, any>): Promise<{ sent: boolean }> {
  const message = await generateOutreachMessage({
    enrollmentId: row.enrollment_id,
    signalType: row.signal_type,
    signalSnapshot: currentSnapshot,
    goal: row.goal,
    isFollowUp: true,
    attemptNumber: row.attempt_count + 1,
  });

  const eventId = crypto.randomUUID();
  const authResult = await authorizeTicketDispatch({
    eventId,
    ticketId: row.ticket_id,
    agentName: 'Reese',
    action: 'reese_outreach_followup',
    riskTier: RISK_TIER,
    preparedAction: { studentEnrollmentId: row.enrollment_id, content: message },
  });

  if (!authResult.allowed) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'info', service: 'reeseOutreachFollowUpService',
      event: 'follow_up_held_for_approval', outcome: 'partial', correlation_id: eventId,
      context: { ticket_id: row.ticket_id, enrollment_id: row.enrollment_id, reason: authResult.reason },
    }));
    return { sent: false };
  }

  const dm = await initiateDm(row.enrollment_id, message);
  await row.update({
    attempt_count: row.attempt_count + 1,
    last_contacted_at: new Date(),
    next_follow_up_due_at: new Date(Date.now() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000),
    signal_snapshot: currentSnapshot,
  } as any);

  // Phase 2 (2026-09-18) — follow-up sends never wrote to the real Work Ledger.
  // Approval-correlation fix (2026-10-02) — thread the same eventId/decisionId
  // the authorization check above already generated, instead of a fresh,
  // disconnected traceId.
  const reeseAdminUserId = await getReeseAdminUserId();
  await emitReeseLedgerEvent({
    ticketId: row.ticket_id,
    eventId,
    authorizationDecisionId: authResult.decisionId,
    traceId: crypto.randomUUID(),
    actorType: 'ai_staff',
    actorId: reeseAdminUserId || 'Reese',
    intent: 'reese.outreach_follow_up',
    domain: 'student_support',
    actionClass: 'dm_message',
    targetType: 'ticket',
    targetId: row.ticket_id,
    riskTier: RISK_TIER,
    idempotencyKey: `reese-outreach-follow-up-send:${dm.messageId}`,
    result: 'success',
    sourceRecordType: 'room_message',
    sourceRecordId: dm.messageId,
  });

  return { sent: true };
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
      // dryRun never calls the real gate (dryRun also never ran it before
      // this phase) — in dry-run mode this branch is reported exactly as it
      // always has been, since nothing real is actually at risk of being
      // misreported when nothing real happens either way.
      const escalateResult = dryRun ? { escalated: true } : await escalate(row);
      decisions.push({
        outreachId: row.id,
        enrollmentId: row.enrollment_id,
        branch: escalateResult.escalated ? 'escalated' : 'held_for_approval',
      });
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

    const sendResult = dryRun ? { sent: true } : await sendFollowUp(row, currentSignal);
    decisions.push({
      outreachId: row.id,
      enrollmentId: row.enrollment_id,
      branch: sendResult.sent ? 'follow_up_sent' : 'held_for_approval',
    });
  }

  return {
    dryRun,
    processed: decisions.length,
    signalCleared: decisions.filter((d) => d.branch === 'signal_cleared').length,
    goalMet: decisions.filter((d) => d.branch === 'goal_met').length,
    followUpSent: decisions.filter((d) => d.branch === 'follow_up_sent').length,
    escalated: decisions.filter((d) => d.branch === 'escalated').length,
    dailyCapDeferred: decisions.filter((d) => d.branch === 'daily_cap_deferred').length,
    heldForApproval: decisions.filter((d) => d.branch === 'held_for_approval').length,
    decisions,
  };
}
