import AiAgentActivityLog from '../../models/AiAgentActivityLog';
import { logAgentActivity } from '../agentBlueprint/agentActivityLogService';
import { getReeseAgentId } from './reeseIdentitySeed';
import { classifyError } from '../../utils/errorClassifier';

/**
 * reeseGovernedActionLog — make an authorization-held action VISIBLE instead of
 * looking like nothing happened.
 *
 * WHY THIS EXISTS. Every one of Reese's seven authorization-gated call sites
 * already returns early when `authorizeTicketDispatch()` says `allowed: false`,
 * and every one of them writes a `console.log` and nothing else. A console line
 * is not a record: it is not queryable, it is not on the agent's own scorecard,
 * and it disappears with the container. Measured on production 2026-10-07:
 *   - `ai_agent_activity_logs` holds 4,115,630 `success` + 159,768 `failed`
 *     rows and ZERO `skipped`, ZERO `pending` — fleet-wide, across every agent.
 *     The column's own type allows four values; the table has only ever stored
 *     two. This is not for want of code: 30 non-comment `result: 'skipped'`
 *     literals exist across 22 backend files, 7 of which call this very
 *     table's writer (`logAgentActivity`). Not one has ever produced a row,
 *     so every one of those branches is either dead or never taken.
 *   - Reese's own agent row holds exactly 30 rows, all `success`, across only
 *     two actions (`reese_autonomous_outreach` 22, `reese_dm_reply` 8).
 *   - Meanwhile `approval_requests` holds 106 held rows across FIVE action
 *     types, and `reese_welcomes` honestly records 10 rows with
 *     `outcome: 'held'`. The activity log shows none of it.
 * So a held send is indistinguishable, in the one table the agent's own
 * dashboard reads, from a send that never had a reason to happen.
 *
 * WHAT THIS DOES NOT DO. Nothing here decides whether anything sends. Both
 * functions are pure bookkeeping, called AFTER the send decision has already
 * been made by the caller's own `if (!authResult.allowed)` branch. A hold stays
 * a hold. Removing this module entirely would change no student's experience —
 * it would only put the record back to silence.
 *
 * Failure-First Design (root CLAUDE.md):
 * 1. What happens if this fails? Nothing, by construction. Both functions
 *    resolve to a status string and never throw, so a logging outage cannot
 *    turn a held send into a crash or a real send into a failure. The inner
 *    write is `logAgentActivity()`, itself already fail-open (it catches and
 *    warns); the outer try/catch here additionally covers `getReeseAgentId()`
 *    and the dedup `findOne()` — the two DB calls that happen BEFORE it.
 * 2. Retry? None. One fire-once call per decision. A lost record under-documents
 *    one decision; it never loses or duplicates real work.
 * 3. Recovery if exhausted? None needed — see (2). The `approval_requests` row
 *    the authorization bridge already wrote remains the authoritative record of
 *    the hold; this is the agent-scorecard-visible mirror of it.
 * 4. Failure modes handled: Reese's AiAgent row not seeded (returns
 *    'no_agent'), the dedup read or the write throwing (returns
 *    'log_unavailable'), the same held unit evaluated twice (returns
 *    'deduped'). NOT handled: two processes evaluating the same held unit
 *    concurrently can both pass the dedup read and write two rows. That is a
 *    benign over-count of a log row, never a duplicated side effect, and
 *    closing it would need a unique index — a schema change, out of scope here.
 */

/** What `recordHeldAction` / `recordSentAction` actually managed to do. Returned
 * rather than thrown so a caller can assert on it without a try/catch, and so a
 * silent no-op is impossible to mistake for a successful write. */
export type GovernedActionLogOutcome = 'written' | 'deduped' | 'no_agent' | 'log_unavailable';

export interface HeldActionInput {
  /** The governed action name, identical to the one passed to
   * `authorizeTicketDispatch()` — so an activity row joins to its
   * `approval_requests` row by action as well as by id. */
  action: string;
  /** The risk tier the action declared (R3 for every current Reese path). */
  riskTier: string;
  /** The authorization verdict that held it, verbatim from the bridge. */
  verdict: string;
  /** The bridge's own `reason` (its `reason_code`), verbatim. */
  reasonCode: string;
  /** Names the unit of work this hold belongs to, e.g.
   * `outreach:<id>:attempt:3`. Two evaluations of the SAME unit write one row;
   * a genuinely new unit (next attempt, different student) writes its own. */
  unitKey: string;
  /** The correlation id the caller generated for this authorization decision —
   * the same `eventId` it passed to the bridge and logged as
   * `correlation_id`. Stored as `trace_id` so one id walks the console line,
   * the `approval_requests` row and this row. */
  eventId: string;
  /** The `approval_requests` row id, when the bridge created one. */
  decisionId?: string | null;
  /** Domain context (ticket id, enrollment id, …). Merged UNDER the governance
   * fields below, so a caller can never shadow the verdict it was held by. */
  details?: Record<string, any>;
}

/**
 * The exact `reason` text written for a held action, and — deliberately — the
 * dedup key. It is a pure function of the held unit, so the same held unit
 * always produces the same string and a second evaluation is recognizable by
 * equality alone. Keeping the key IN the row (rather than hashing it into an
 * opaque uuid) means a human reading the table can see why two rows are
 * distinct, and `skipped` rows stay self-describing: held by policy, not
 * errored, and not "nothing to do".
 */
export function heldActionReason(
  input: Pick<HeldActionInput, 'action' | 'riskTier' | 'verdict' | 'reasonCode' | 'unitKey'>,
): string {
  return [
    'held_by_policy',
    `verdict=${input.verdict}`,
    `action=${input.action}`,
    `risk_tier=${input.riskTier}`,
    `reason_code=${input.reasonCode}`,
    `unit=${input.unitKey}`,
  ].join(' ');
}

function warn(event: string, context: Record<string, any>): void {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn',
    service: 'reeseGovernedActionLog', event, outcome: 'failure', ...context,
  }));
}

/**
 * Record that a governed action was HELD by authorization — `result: 'skipped'`,
 * with the verdict, action and risk tier named in the reason.
 *
 * Writes nothing else and gates nothing. Idempotent per `unitKey`.
 */
export async function recordHeldAction(input: HeldActionInput): Promise<GovernedActionLogOutcome> {
  // INSIDE the try, deliberately. heldActionReason() reads properties off `input`, and this
  // function's contract is that it never throws - bookkeeping must not be able to break the thing
  // it is bookkeeping for. Built on it: processDueReeseTicketFollowUps loops over tickets with no
  // per-iteration catch, so a throw escaping here would abandon every remaining ticket in the
  // sweep; and in the welcome path this call is awaited inside a try whose catch writes
  // outcome: 'failed', so a throw would record a successfully sent welcome as a failure. Neither
  // is reachable from today's five call sites, which all pass plain primitives - which is exactly
  // why it needs to be structural rather than left to the callers staying careful.
  let reason = '';
  try {
    reason = heldActionReason(input);
    const agentId = await getReeseAgentId();
    if (!agentId) {
      warn('held_action_log_no_agent', { action: input.action, unit_key: input.unitKey });
      return 'no_agent';
    }

    const existing = await AiAgentActivityLog.findOne({
      where: { agent_id: agentId, action: input.action, result: 'skipped', reason },
      attributes: ['id'],
    });
    if (existing) return 'deduped';

    await logAgentActivity({
      agentId,
      action: input.action,
      result: 'skipped',
      reason,
      traceId: input.eventId,
      details: {
        ...(input.details ?? {}),
        held_by: 'authorization',
        verdict: input.verdict,
        reason_code: input.reasonCode,
        risk_tier: input.riskTier,
        unit_key: input.unitKey,
        event_id: input.eventId,
        authorization_decision_id: input.decisionId ?? null,
      },
    });
    return 'written';
  } catch (e: any) {
    warn('held_action_log_failed', {
      action: input.action, unit_key: input.unitKey,
      error_class: classifyError(e), message: String(e?.message || e),
    });
    return 'log_unavailable';
  }
}

export interface SentActionInput {
  action: string;
  riskTier: string;
  /** Why this action fired — a short, human-readable marker. */
  reason: string;
  eventId: string;
  details?: Record<string, any>;
}

/**
 * Record that a governed action actually RAN — `result: 'success'`.
 *
 * Exists so the five Reese paths that had no activity-log write at all do not
 * become log entries that read 100% held the moment `recordHeldAction()` starts
 * writing. A table showing only the holds for an action would be a NEW false
 * signal, not an improvement. Not deduped: every real send is its own event.
 */
export async function recordSentAction(input: SentActionInput): Promise<GovernedActionLogOutcome> {
  try {
    const agentId = await getReeseAgentId();
    if (!agentId) {
      warn('sent_action_log_no_agent', { action: input.action });
      return 'no_agent';
    }
    await logAgentActivity({
      agentId,
      action: input.action,
      result: 'success',
      reason: input.reason,
      traceId: input.eventId,
      details: { ...(input.details ?? {}), risk_tier: input.riskTier, event_id: input.eventId },
    });
    return 'written';
  } catch (e: any) {
    warn('sent_action_log_failed', {
      action: input.action, error_class: classifyError(e), message: String(e?.message || e),
    });
    return 'log_unavailable';
  }
}
