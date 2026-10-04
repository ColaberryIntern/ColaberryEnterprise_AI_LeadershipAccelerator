import crypto from 'crypto';
import { Op } from 'sequelize';
import Ticket from '../../models/Ticket';
import RoomMessage from '../../models/RoomMessage';
import ReeseTicketFollowUp from '../../models/ReeseTicketFollowUp';
import { addTicketComment } from '../ticketService';
import { getReeseAdminUserId, getReeseEnrollmentId } from './reeseIdentitySeed';
import { generateTicketFollowUpMessage } from './reeseTicketFollowUpMessageService';
import { initiateDm } from './reeseInitiateDmService';
import { RISK_TIER } from './reeseAutonomousOutreachService';
import { authorizeTicketDispatch } from '../workLedger/agentActionAuthorizationBridge';
import { emitReeseLedgerEvent } from './reeseWorkLedgerEvents';

// Reese ticket follow-up (2026-10-02) — closes the real gap this session's own
// discovery confirmed: reeseOutreachFollowUpService.ts only ever covers
// ReeseOutreach rows (tickets Reese herself opened via autonomous outreach);
// `student_support` tickets (every reactive DM conversation) have NO follow-up
// mechanism at all. A `student_support` ticket's own `due_date` is set once at
// creation and never updated, so it is NOT used as the eligibility signal here —
// eligibility is computed fresh from the real conversation (who spoke last, how
// long ago), matching what Ali confirmed he actually wants checked on.
//
// Own, separate daily cap from reeseAutonomousOutreachService.ts's DAILY_SEND_CAP
// (disclosed assumption, execution-contract.md) — a disjoint ticket population;
// sharing one ceiling would let this backlog-clearing sweep compete with the
// pre-existing outreach cadence. RISK_TIER IS shared/imported directly: every
// message a student receives from Reese should carry the same risk
// classification, regardless of which mechanism sent it.
export const QUIET_THRESHOLD_DAYS = 3;
const MAX_ATTEMPTS = 3;
export const DAILY_SEND_CAP = 10;

export interface TicketFollowUpDecision {
  ticketId: string;
  branch: 'sent' | 'escalated' | 'already_escalated' | 'not_eligible' | 'too_recent' | 'daily_cap_deferred' | 'held_for_approval';
}

export interface TicketFollowUpResult {
  dryRun: boolean;
  evaluated: number;
  sent: number;
  escalated: number;
  dailyCapDeferred: number;
  /** A send/escalation genuinely held by the ABAC gate — counted separately,
   * never folded into `sent`/`escalated` (same honesty discipline
   * reeseOutreachFollowUpService.ts's FollowUpResult already established). */
  heldForApproval: number;
  decisions: TicketFollowUpDecision[];
}

async function countTicketFollowUpsSentToday(): Promise<number> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  return ReeseTicketFollowUp.count({ where: { last_followup_at: { [Op.gte]: startOfDayUtc } } });
}

/** Real-enforcement scoping, same gate-before-action pattern every other
 * Reese send/escalation already uses. Returns whether the follow-up actually
 * sent, so the caller never records 'sent' for a held action. */
async function sendTicketFollowUp(
  ticket: InstanceType<typeof Ticket>,
  row: InstanceType<typeof ReeseTicketFollowUp>,
  quietDays: number,
): Promise<{ sent: boolean }> {
  const message = await generateTicketFollowUpMessage({
    roomId: row.room_id,
    studentEnrollmentId: row.student_enrollment_id,
    ticketTitle: ticket.title,
    quietDays,
    attemptNumber: row.attempt_count + 1,
  });

  const eventId = crypto.randomUUID();
  const authResult = await authorizeTicketDispatch({
    eventId,
    ticketId: ticket.id,
    agentName: 'Reese',
    action: 'reese_ticket_followup',
    riskTier: RISK_TIER,
    preparedAction: { studentEnrollmentId: row.student_enrollment_id, content: message },
  });

  if (!authResult.allowed) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'info', service: 'reeseTicketFollowUpService',
      event: 'follow_up_held_for_approval', outcome: 'partial', correlation_id: eventId,
      context: { ticket_id: ticket.id, student_enrollment_id: row.student_enrollment_id, reason: authResult.reason },
    }));
    return { sent: false };
  }

  const dm = await initiateDm(row.student_enrollment_id, message);
  await row.update({ attempt_count: row.attempt_count + 1, last_followup_at: new Date() } as any);

  const reeseAdminUserId = await getReeseAdminUserId();
  await addTicketComment(ticket.id, `[Reese] Checked in after ${quietDays} quiet day(s): "${message}"`, 'ai_staff', reeseAdminUserId || 'Reese');
  // Approval-correlation fix (2026-10-02) — thread the same eventId/decisionId
  // the authorization check above already generated, instead of a fresh,
  // disconnected traceId (a bug introduced when this file was first written
  // earlier today, copying the then-unrecognized broken precedent).
  await emitReeseLedgerEvent({
    ticketId: ticket.id,
    eventId,
    authorizationDecisionId: authResult.decisionId,
    traceId: crypto.randomUUID(),
    actorType: 'ai_staff',
    actorId: reeseAdminUserId || 'Reese',
    intent: 'reese.ticket_follow_up',
    domain: 'student_support',
    actionClass: 'dm_message',
    targetType: 'ticket',
    targetId: ticket.id,
    riskTier: RISK_TIER,
    idempotencyKey: `reese-ticket-follow-up-send:${dm.messageId}`,
    result: 'success',
    sourceRecordType: 'room_message',
    sourceRecordId: dm.messageId,
  });

  return { sent: true };
}

async function escalateTicketFollowUp(
  ticket: InstanceType<typeof Ticket>,
  row: InstanceType<typeof ReeseTicketFollowUp>,
): Promise<{ escalated: boolean }> {
  const reeseAdminUserId = await getReeseAdminUserId();
  const actorId = reeseAdminUserId || 'Reese';

  const eventId = crypto.randomUUID();
  const authResult = await authorizeTicketDispatch({
    eventId,
    ticketId: ticket.id,
    agentName: 'Reese',
    action: 'reese_ticket_followup_escalated',
    riskTier: RISK_TIER,
    preparedAction: { ticketId: ticket.id, followUpId: row.id },
  });

  if (!authResult.allowed) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'info', service: 'reeseTicketFollowUpService',
      event: 'escalation_held_for_approval', outcome: 'partial', correlation_id: eventId,
      context: { ticket_id: ticket.id, follow_up_id: row.id, reason: authResult.reason },
    }));
    return { escalated: false };
  }

  await addTicketComment(
    ticket.id,
    `[Reese] Reached the ${MAX_ATTEMPTS}-attempt follow-up cap on this quiet conversation without a reply. ` +
      `Flagging for human review rather than checking in again.`,
    'ai_staff',
    actorId,
  );
  await row.update({ status: 'escalated' } as any);
  // Approval-correlation fix (2026-10-02) — thread the same eventId/decisionId
  // the authorization check above already generated, instead of a fresh,
  // disconnected traceId.
  await emitReeseLedgerEvent({
    ticketId: ticket.id,
    eventId,
    authorizationDecisionId: authResult.decisionId,
    traceId: crypto.randomUUID(),
    actorType: 'ai_staff',
    actorId,
    intent: 'reese.ticket_follow_up_escalated',
    domain: 'student_support',
    actionClass: 'escalation',
    targetType: 'ticket',
    targetId: ticket.id,
    riskTier: RISK_TIER,
    idempotencyKey: `reese-ticket-follow-up-escalate:${ticket.id}`,
    result: 'success',
    sourceRecordType: 'reese_ticket_follow_up',
    sourceRecordId: row.id,
  });

  return { escalated: true };
}

/**
 * Sweeps Reese's own open `student_support` tickets and resolves each via the
 * decision tree: not eligible (student spoke last, or no messages yet) > too
 * recent (quiet, but under QUIET_THRESHOLD_DAYS) > already escalated (never
 * resumes on its own) > at attempt cap (escalate to human review) > under
 * daily cap (send one real check-in) > at daily cap (defer to next sweep).
 *
 * `dryRun: true` computes every branch decision with zero real writes/sends —
 * same contract as reeseOutreachFollowUpService.ts's own sweep. The daily cap
 * is checked in BOTH modes so a dry-run report is honest about what the real
 * cap would do.
 */
export async function processDueReeseTicketFollowUps(dryRun = false): Promise<TicketFollowUpResult> {
  const reeseAdminUserId = await getReeseAdminUserId();
  const reeseEnrollmentId = await getReeseEnrollmentId();
  const decisions: TicketFollowUpDecision[] = [];

  if (!reeseAdminUserId || !reeseEnrollmentId) {
    return { dryRun, evaluated: 0, sent: 0, escalated: 0, dailyCapDeferred: 0, heldForApproval: 0, decisions };
  }

  const tickets = await Ticket.findAll({
    where: {
      type: 'student_support',
      assigned_to_type: 'ai_staff',
      assigned_to_id: reeseAdminUserId,
      status: { [Op.notIn]: ['done', 'cancelled'] },
    },
  });

  for (const ticket of tickets) {
    const roomId = (ticket as any).entity_type === 'community_room' ? (ticket as any).entity_id : null;
    if (!roomId) {
      decisions.push({ ticketId: ticket.id, branch: 'not_eligible' });
      continue;
    }

    const latest = await RoomMessage.findOne({
      where: { room_id: roomId, deleted_at: null },
      order: [['created_at', 'DESC']],
    });

    if (!latest || latest.enrollment_id !== reeseEnrollmentId) {
      // No message yet, or the student spoke last — Reese either has nothing
      // to follow up on, or already owes a reply (handled by the existing
      // reactive path, never this sweep).
      decisions.push({ ticketId: ticket.id, branch: 'not_eligible' });
      continue;
    }

    const quietDays = (Date.now() - new Date(latest.created_at).getTime()) / (24 * 60 * 60 * 1000);
    if (quietDays < QUIET_THRESHOLD_DAYS) {
      decisions.push({ ticketId: ticket.id, branch: 'too_recent' });
      continue;
    }

    const existingRow = await ReeseTicketFollowUp.findOne({ where: { ticket_id: ticket.id } });
    if (existingRow?.status === 'escalated') {
      decisions.push({ ticketId: ticket.id, branch: 'already_escalated' });
      continue;
    }

    const attemptCount = existingRow?.attempt_count ?? 0;
    if (attemptCount >= MAX_ATTEMPTS) {
      // existingRow is always real here: a brand-new ticket always starts at
      // attempt_count 0 (the `?? 0` default below MAX_ATTEMPTS), so this
      // branch is only reachable once a row already exists with a real count.
      const escalateResult = dryRun ? { escalated: true } : await escalateTicketFollowUp(ticket, existingRow!);
      decisions.push({ ticketId: ticket.id, branch: escalateResult.escalated ? 'escalated' : 'held_for_approval' });
      continue;
    }

    // Checked in BOTH real and dry-run mode so a dry-run report is honest
    // about what the real cap would do.
    const sentToday = await countTicketFollowUpsSentToday();
    if (sentToday >= DAILY_SEND_CAP) {
      decisions.push({ ticketId: ticket.id, branch: 'daily_cap_deferred' });
      continue;
    }

    if (dryRun) {
      decisions.push({ ticketId: ticket.id, branch: 'sent' });
      continue;
    }

    const row = existingRow
      ?? (await ReeseTicketFollowUp.findOrCreate({
        where: { ticket_id: ticket.id },
        defaults: { ticket_id: ticket.id, room_id: roomId, student_enrollment_id: latest.enrollment_id },
      }))[0];

    const sendResult = await sendTicketFollowUp(ticket, row, Math.floor(quietDays));
    decisions.push({ ticketId: ticket.id, branch: sendResult.sent ? 'sent' : 'held_for_approval' });
  }

  return {
    dryRun,
    evaluated: decisions.length,
    sent: decisions.filter((d) => d.branch === 'sent').length,
    escalated: decisions.filter((d) => d.branch === 'escalated').length,
    dailyCapDeferred: decisions.filter((d) => d.branch === 'daily_cap_deferred').length,
    heldForApproval: decisions.filter((d) => d.branch === 'held_for_approval').length,
    decisions,
  };
}
