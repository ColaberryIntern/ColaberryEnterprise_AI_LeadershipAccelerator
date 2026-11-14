import { Op, fn, col, where as sqlWhere } from 'sequelize';
import ApprovalRequest from '../../models/ApprovalRequest';
import ReeseOutreach from '../../models/ReeseOutreach';
import AiAgent from '../../models/AiAgent';

/**
 * The last line of defence for Reese's autonomous outreach: checked at the moment of the SEND, not the moment of the
 * decision, and trusting nothing upstream.
 *
 * Why it exists. Held outreach is approved by `system:auto_approve_timeout` with no person in the loop, and Ali wants
 * it that way (14 Nov 2026: "I don't want to approve responses"), but he does not want Reese to run away again.
 * Between 7 Oct and 12 Nov 2026 the sweep's own cadence and cap were blind to replayed sends, and 851 DMs reached 52
 * students, one of them 37 times. PR #3980 fixed the sweep. This module makes sure that if the sweep (or anything
 * else that holds outreach) ever goes wrong again, the damage is at most one message, not five weeks of them.
 *
 * Three rules, all enforced in approvalRequestReplayService immediately before initiateDm():
 *   1. OFF MEANS OFF. If ReeseAutonomousOutreachSweep is disabled, no held outreach is sent, including holds created
 *      before it was switched off. (On 13 Nov the switch stopped new holds but not the ones already queued.)
 *   2. NO REPEATS. If this student already received autonomous outreach in the last 6 days (see the window constant
 *      for why 6), by replay or by direct send, the message is blocked and Reese is switched off.
 *   3. DAILY CEILING. If 12 autonomous outreach messages have already gone out today (UTC), the message is blocked
 *      and Reese is switched off.
 *
 * Rules 2 and 3 should never fire: the sweep already enforces both. When one does, something upstream is broken, so
 * the tripwire turns the sweep off (the same `ai_agents.enabled` flag an operator uses), emails the admins, and stays
 * off until a person turns it back on. It never turns itself back on.
 *
 * Failure modes. A database error while checking propagates: the caller treats a thrown check as "do not send"
 * (fail closed). A failure to send the alert email is logged and never undoes the switch-off.
 */

export const REESE_SWEEP_AGENT = 'ReeseAutonomousOutreachSweep';
/**
 * Six, not the sweep's seven, on purpose. The sweep measures its 7 days from when the hold was CREATED (15:00 UTC);
 * this measures from when the previous message was SENT (the replay, about 19:15 UTC). A student legitimately
 * re-held on day 7 has a previous send roughly 6 days 20 hours ago, which a 7-day window here would count as a
 * breach and switch Reese off for nothing. A 6-day window catches every real repeat (the incident was daily) and
 * never fires on the sweep's own correct weekly cadence.
 */
export const TRIPWIRE_STUDENT_WINDOW_DAYS = 6;
/** Same number as the sweep's own cap. Kept equal on purpose: the tripwire is a backstop, not a second policy. */
export const TRIPWIRE_DAILY_CEILING = 12;

const ACTION = 'reese_autonomous_outreach';
const DAY_MS = 24 * 60 * 60 * 1000;

export type TripwireBlockReason = 'sweep_disabled' | 'student_already_messaged' | 'daily_ceiling_reached';
export type TripwireVerdict =
  | { allowed: true }
  | { allowed: false; reason: TripwireBlockReason; tripped: boolean; detail: Record<string, unknown> };

function startOfUtcDay(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Is the sweep switched on right now? A missing registry row counts as off. */
export async function isReeseOutreachEnabled(): Promise<boolean> {
  const agent = await AiAgent.findOne({ where: { agent_name: REESE_SWEEP_AGENT }, attributes: ['id', 'enabled'] });
  return agent?.enabled === true;
}

/** Autonomous outreach this student already received in the window, other than the row being sent now. */
async function priorOutreachToStudent(approvalId: string, enrollmentId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - TRIPWIRE_STUDENT_WINDOW_DAYS * DAY_MS);
  const replayed = await ApprovalRequest.count({
    where: {
      action: ACTION,
      id: { [Op.ne]: approvalId },
      replayed_at: { [Op.gte]: since },
      [Op.and]: [sqlWhere(fn('jsonb_extract_path_text', col('prepared_action'), 'studentEnrollmentId'), enrollmentId)],
    } as any,
  });
  const direct = await ReeseOutreach.count({
    where: { enrollment_id: enrollmentId, last_contacted_at: { [Op.gte]: since } },
  });
  return replayed + direct;
}

/** Autonomous outreach sent today (UTC): replayed holds plus direct sends. */
async function outreachSentToday(now: Date): Promise<number> {
  const since = startOfUtcDay(now);
  const replayed = await ApprovalRequest.count({ where: { action: ACTION, replayed_at: { [Op.gte]: since } } as any });
  const direct = await ReeseOutreach.count({ where: { last_contacted_at: { [Op.gte]: since } } });
  return replayed + direct;
}

/**
 * Switch the sweep off and tell the admins. Idempotent: only the call that actually flips the flag sends the alert,
 * so a batch of twenty blocked rows produces one email, not twenty. Returns true when this call flipped it.
 */
export async function tripReeseOutreach(reason: TripwireBlockReason, detail: Record<string, unknown>): Promise<boolean> {
  const [changed] = await AiAgent.update(
    { enabled: false } as any,
    { where: { agent_name: REESE_SWEEP_AGENT, enabled: true } },
  );
  const flipped = changed > 0;
  console.error(JSON.stringify({
    level: 'error', service: 'reeseOutreachTripwire', event: 'reese_outreach_tripped', outcome: 'failure',
    error_class: 'ContractViolation', reason, flipped, context: detail,
  }));
  if (flipped) await alertAdmins(reason, detail);
  return flipped;
}

async function alertAdmins(reason: TripwireBlockReason, detail: Record<string, unknown>): Promise<void> {
  const why = reason === 'student_already_messaged'
    ? `A student was about to receive a second autonomous Reese message within ${TRIPWIRE_STUDENT_WINDOW_DAYS} days.`
    : `Autonomous Reese outreach reached the ceiling of ${TRIPWIRE_DAILY_CEILING} messages today.`;
  try {
    // Lazy imports: alerting pulls in the email stack, which this module must not load at boot.
    const { emitAlert } = await import('../alertService');
    const { deliverAlert } = await import('../alertDeliveryService');
    const alert = await emitAlert({
      type: 'critical',
      severity: 5,
      title: 'Reese outreach switched itself off',
      description: `${why} The message was blocked and the daily outreach sweep (${REESE_SWEEP_AGENT}) was turned off. `
        + 'It stays off until someone turns it back on. Nothing else in Reese changed.',
      sourceType: 'system',
      impactArea: 'student_outreach',
      urgency: 'immediate',
      metadata: { reason, ...detail },
    });
    // Email directly as well, so the alert reaches a person even if no subscription matches it.
    await deliverAlert(alert, ['email']);
  } catch (err: any) {
    console.error(JSON.stringify({
      level: 'error', service: 'reeseOutreachTripwire', event: 'tripwire_alert_failed', outcome: 'failure',
      error_class: err?.name || 'UpstreamUnavailable', message: String(err?.message || err), reason,
    }));
  }
}

/**
 * Decide whether one held outreach may be sent now. Call immediately before the send. Rules in the header.
 * Reads only; the one write is the switch-off when a rule other than `sweep_disabled` fires.
 */
export async function checkOutreachReplay(approvalId: string, enrollmentId: string, now = new Date()): Promise<TripwireVerdict> {
  if (!(await isReeseOutreachEnabled())) {
    return { allowed: false, reason: 'sweep_disabled', tripped: false, detail: { approvalId } };
  }

  const prior = await priorOutreachToStudent(approvalId, enrollmentId, now);
  if (prior > 0) {
    const detail = { approvalId, enrollmentId, priorInWindow: prior, windowDays: TRIPWIRE_STUDENT_WINDOW_DAYS };
    const tripped = await tripReeseOutreach('student_already_messaged', detail);
    return { allowed: false, reason: 'student_already_messaged', tripped, detail };
  }

  const today = await outreachSentToday(now);
  if (today >= TRIPWIRE_DAILY_CEILING) {
    const detail = { approvalId, sentToday: today, ceiling: TRIPWIRE_DAILY_CEILING };
    const tripped = await tripReeseOutreach('daily_ceiling_reached', detail);
    return { allowed: false, reason: 'daily_ceiling_reached', tripped, detail };
  }

  return { allowed: true };
}
