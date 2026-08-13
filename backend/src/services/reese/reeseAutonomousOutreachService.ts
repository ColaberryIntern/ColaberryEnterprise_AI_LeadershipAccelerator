import crypto from 'crypto';
import { Op } from 'sequelize';
import ReeseOutreach from '../../models/ReeseOutreach';
import type { ReeseOutreachSignalType } from '../../models/ReeseOutreach';
import { createTicket } from '../ticketService';
import { authorizeTicketDispatch } from '../workLedger/agentActionAuthorizationBridge';
import { getReeseAdminUserId } from './reeseIdentitySeed';
import { isEligibleForAutonomousOutreach } from './reeseEligibilityService';
import {
  getPilotCohortStudentEnrollmentIds,
  evaluateInactivitySignal,
  evaluateBehaviorAnomalySignal,
} from './reeseSignalService';
import { generateOutreachMessage } from './reeseOutreachMessageService';
import { initiateDm } from './reeseInitiateDmService';
import { resolveStudentDisplayName } from './resolveStudentDisplayName';

// Reese Phase 2 (Autonomous Outreach) — the decision + orchestration sweep.
// Named, non-negotiable constants (see execution-contract.md — logged there as
// assumptions, not buried only in code):
export const CADENCE_DAYS = 7;
export const FOLLOW_UP_DAYS = 7;
export const DAILY_SEND_CAP = 12; // combined ceiling — shared with reeseOutreachFollowUpService.ts
export const RISK_TIER = 'R3';

const GOALS: Record<ReeseOutreachSignalType, string> = {
  inactivity: 'Confirm the student is unblocked and re-engaged with the curriculum within 7 days.',
  behavior_anomaly: 'Confirm the student is not stuck on the flagged lesson and has a clear next step within 7 days.',
};

export interface SweepDecision {
  enrollmentId: string;
  signalType?: ReeseOutreachSignalType;
  action: 'sent' | 'skipped';
  reason: string;
}

export interface SweepResult {
  dryRun: boolean;
  evaluated: number;
  sent: number;
  skipped: number;
  decisions: SweepDecision[];
}

/**
 * Combined daily-send ceiling shared with reeseOutreachFollowUpService.ts:
 * counts ReeseOutreach rows whose `last_contacted_at` falls on today's UTC
 * date, regardless of whether that contact was a new thread (this file) or a
 * follow-up (reeseOutreachFollowUpService.ts) — both set `last_contacted_at`
 * on every real send, so this one query is a true ceiling on TOTAL autonomous
 * sends, not just new-thread sends.
 */
export async function countAutonomousSendsToday(): Promise<number> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  return ReeseOutreach.count({ where: { last_contacted_at: { [Op.gte]: startOfDayUtc } } });
}

async function hasOpenOutreachForSignal(enrollmentId: string, signalType: ReeseOutreachSignalType): Promise<boolean> {
  const existing = await ReeseOutreach.findOne({
    where: { enrollment_id: enrollmentId, signal_type: signalType, status: 'active' },
  });
  return Boolean(existing);
}

/** Cadence check is per-student, across ALL signal types/tickets — not
 * per-signal. This is what keeps a student from getting two different
 * messages in the same week even if two different signals fire for them. */
async function wasContactedWithinCadence(enrollmentId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - CADENCE_DAYS * 24 * 60 * 60 * 1000);
  const recent = await ReeseOutreach.findOne({
    where: { enrollment_id: enrollmentId, last_contacted_at: { [Op.gte]: cutoff } },
  });
  return Boolean(recent);
}

async function sendNewOutreach(
  enrollmentId: string,
  signalType: ReeseOutreachSignalType,
  signalSnapshot: Record<string, any>,
  dryRun: boolean,
): Promise<SweepDecision> {
  const goal = GOALS[signalType];

  if (dryRun) {
    return { enrollmentId, signalType, action: 'sent', reason: 'dry_run_would_send' };
  }

  const reeseAdminUserId = await getReeseAdminUserId();
  if (!reeseAdminUserId) {
    return { enrollmentId, signalType, action: 'skipped', reason: 'reese_identity_not_seeded' };
  }

  const message = await generateOutreachMessage({
    enrollmentId,
    signalType,
    signalSnapshot,
    goal,
    isFollowUp: false,
    attemptNumber: 1,
  });

  // Composite entity_id (not just the bare enrollment id) — see
  // execution-contract.md's plan-audit cycle-2 finding: createTicket()'s own
  // dedup is keyed on (entity_type, entity_id, type) with no signal_type
  // awareness, so a bare enrollment id would let a second, DIFFERENT signal
  // silently collide onto the first signal's still-open ticket. entity_id is
  // STRING(255) (Ticket.ts), not a strict UUID column, so this is safe.
  //
  // title/description use the student's real name, never the raw enrollmentId
  // (Ali's live feedback: "reporting the id of the user is not helpful") —
  // entity_id/metadata below still carry the UUID for systems that need it.
  const studentName = await resolveStudentDisplayName(enrollmentId);
  const ticket = await createTicket({
    title: `Reese autonomous outreach — ${signalType} (${studentName})`,
    description:
      `Reese is proactively reaching out to ${studentName}. ` +
      `Signal: ${signalType}. Goal: ${goal}`,
    type: 'reese_autonomous_outreach',
    status: 'in_progress',
    created_by_type: 'ai_staff',
    created_by_id: reeseAdminUserId,
    assigned_to_type: 'ai_staff',
    assigned_to_id: reeseAdminUserId,
    entity_type: 'reese_outreach_signal',
    entity_id: `${enrollmentId}:${signalType}`,
    metadata: { signal_type: signalType, signal_snapshot: signalSnapshot, goal, reason: signalType },
  });

  // risk_tier isn't part of CreateTicketData's typed contract (a Milestone-1
  // shipped interface this run deliberately does not modify) — same pattern
  // as other ProofDesk-specific fields, set via a direct follow-up update.
  // No `any` needed: risk_tier is a real declared attribute on the Ticket
  // instance createTicket() returns, just not part of its narrower create-time
  // input type.
  await ticket.update({ risk_tier: RISK_TIER });

  await initiateDm(enrollmentId, message);

  // Governance (Milestone 4, shadow-mode only) — this call's verdict NEVER
  // gates the send: the message has already been sent by the time this runs,
  // matching ticketAgentDispatcher.ts's own established "evaluate but never
  // block" contract for this exact chokepoint.
  const eventId = crypto.randomUUID();
  await authorizeTicketDispatch({
    eventId,
    ticketId: ticket.id,
    agentName: 'Reese',
    action: 'reese_autonomous_outreach',
    riskTier: RISK_TIER,
  });

  await ReeseOutreach.create({
    enrollment_id: enrollmentId,
    ticket_id: ticket.id,
    signal_type: signalType,
    signal_snapshot: signalSnapshot,
    goal,
    status: 'active',
    attempt_count: 1,
    last_contacted_at: new Date(),
    next_follow_up_due_at: new Date(Date.now() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000),
    risk_tier: RISK_TIER,
  });

  return { enrollmentId, signalType, action: 'sent', reason: `${signalType}_signal_fired` };
}

/**
 * The scheduled sweep. Evaluates every active pilot-cohort student against
 * both real signals; sends at most one new autonomous outreach per eligible,
 * non-duplicate, non-cadence-capped signal, up to the shared daily cap.
 *
 * `dryRun: true` runs the ENTIRE eligibility/signal/decision pipeline and
 * returns the exact decisions that would be made, but skips every real write
 * (`initiateDm()`, `createTicket()`, `authorizeTicketDispatch()`,
 * `ReeseOutreach.create()`) — this is the mechanism T009's honest production
 * verification uses.
 */
export async function runReeseAutonomousOutreachSweep(dryRun = false): Promise<SweepResult> {
  const decisions: SweepDecision[] = [];
  // Real count in BOTH modes (not just real sends) so a dry-run report is
  // honest about what the daily cap would actually do — otherwise every
  // eligible candidate beyond the real remaining slots would be reported as
  // "would send" even though the real cap would have skipped them. Mirrors
  // reeseOutreachFollowUpService.ts's identical fix for the same reason.
  let sentCount = await countAutonomousSendsToday();

  const enrollmentIds = await getPilotCohortStudentEnrollmentIds();

  for (const enrollmentId of enrollmentIds) {
    // Re-checked here even though getPilotCohortStudentEnrollmentIds() already
    // filters by cohort/status — this is the "no bypass path" guarantee: every
    // real call to initiateDm() is preceded by its own, independent gate check,
    // not just an upstream list filter that could drift out of sync.
    const eligibility = await isEligibleForAutonomousOutreach(enrollmentId);
    if (!eligibility.eligible) {
      decisions.push({ enrollmentId, action: 'skipped', reason: eligibility.reason });
      continue;
    }

    const inactivity = await evaluateInactivitySignal(enrollmentId);
    const anomaly = await evaluateBehaviorAnomalySignal(enrollmentId);

    const signals: Array<{ type: ReeseOutreachSignalType; snapshot: Record<string, any> }> = [];
    if (inactivity) signals.push({ type: 'inactivity', snapshot: inactivity });
    if (anomaly) signals.push({ type: 'behavior_anomaly', snapshot: anomaly });

    if (signals.length === 0) {
      decisions.push({ enrollmentId, action: 'skipped', reason: 'no_signal' });
      continue;
    }

    for (const signal of signals) {
      if (await hasOpenOutreachForSignal(enrollmentId, signal.type)) {
        decisions.push({ enrollmentId, signalType: signal.type, action: 'skipped', reason: 'duplicate_open_outreach' });
        continue;
      }
      // Checked fresh per signal, inside the loop: if a first signal for this
      // student was just sent this same sweep, this will now see it and skip
      // any second signal for the same student — the cadence cap doubling as
      // an at-most-one-message-per-student-per-run guarantee, with no extra
      // special-case code needed.
      if (await wasContactedWithinCadence(enrollmentId)) {
        decisions.push({ enrollmentId, signalType: signal.type, action: 'skipped', reason: 'cadence_cap_active' });
        continue;
      }
      if (sentCount >= DAILY_SEND_CAP) {
        decisions.push({ enrollmentId, signalType: signal.type, action: 'skipped', reason: 'daily_cap_reached' });
        continue;
      }

      const decision = await sendNewOutreach(enrollmentId, signal.type, signal.snapshot, dryRun);
      decisions.push(decision);
      // Incremented in BOTH modes: a dry-run "would send" still consumes a
      // simulated slot so later candidates in the SAME dry-run pass are
      // correctly reported as capped once the real remaining slots run out.
      if (decision.action === 'sent') sentCount += 1;
    }
  }

  return {
    dryRun,
    evaluated: enrollmentIds.length,
    sent: decisions.filter((d) => d.action === 'sent').length,
    skipped: decisions.filter((d) => d.action === 'skipped').length,
    decisions,
  };
}
