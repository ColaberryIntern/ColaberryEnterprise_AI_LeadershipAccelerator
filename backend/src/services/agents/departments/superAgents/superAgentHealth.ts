/**
 * Department health verdict - the pure core behind every super agent cycle.
 *
 * WHY THIS MODULE EXISTS
 *
 * Eight super agents run every 30 minutes and each one wrote a
 * DepartmentReport whose verdict was computed like this:
 *
 *   collectGroupStatus()  -> [] on an empty group AND [] on a DB throw
 *   detectAnomalies([])   -> []
 *   report_type           -> 'periodic' (because anomalies.length === 0)
 *   briefing              -> 'healthy'  (because anomalies.length === 0)
 *
 * So "I could not look" and "I looked and everything is fine" produced the
 * byte-identical report. ContentEngineSuperAgent certified a department that
 * has never had a single registered agent 9,366 consecutive times. Finance and
 * Partnerships went quiet on 2026-08-24 - the day their one subordinate was
 * disabled - because the staleness rule only looked at enabled agents, which
 * means switching off a broken agent switched off the alarm about it.
 *
 * The fix is to make absence of evidence its own verdict. 'unknown' is a third
 * state that can never be mistaken for 'healthy', and the one reassuring
 * string this system emits is gated on 'healthy' and nothing else.
 *
 * THE ROUTES TO A FALSE ALL-CLEAR THAT ARE CLOSED HERE
 *
 *   failed query        -> unknown   (not "no anomalies")
 *   zero members        -> unknown   (a supervisor of nothing certifies nothing)
 *   unreadable row      -> unknown   (partially blind is still blind)
 *   unreadable input    -> unknown   (degrade, never throw, never pass)
 *   all members off     -> degraded
 *   disabled after work -> degraded  (Finance / Partnerships, 2026-08-24)
 *   enabled + paused    -> degraded  (ExecutionAgent.ts:74 pauses an agent as
 *                                     automated backoff and never clears
 *                                     `enabled`; aiOpsService.ts:259 does the
 *                                     same from the admin UI. Only `status`
 *                                     changes, so a rule keyed on `enabled`
 *                                     alone lets a remediation silence the
 *                                     alarm about what it just remediated)
 *   unknown status      -> degraded  (`status` is STRING(20) with no enum, so
 *                                     'crashed' must not take the healthy path)
 *   never ran at all    -> degraded  (registered, enabled, run_count 0)
 *   every run errored   -> degraded  (4 errors in 4 runs used to sit under the
 *                                     5-run floor and report nothing)
 *
 * Pure by construction: no database, no clock except the one passed in, no
 * logging. The IO shell lives in superAgentBase.ts and the row taxonomy in
 * superAgentSubordinateRows.ts. Same shape as
 * openclaw/openclawCircuitBreaker.ts (evaluateCircuit) - decisions here,
 * queries there.
 */

import type { ErrorClass } from '../../../../utils/errorClassifier';
import type { SubordinateStatus } from './superAgentSubordinateRows';
import {
  describeStatus,
  describeValue,
  isRecognisedStatus,
  isRunnableStatus,
  normalizeSubordinateRows,
} from './superAgentSubordinateRows';

// --- Types -----------------------------------------------------------------

// The validated row shape lives with the normalizer that produces it; this
// keeps superAgentHealth the single import surface for the pure core, which is
// what superAgentBase and both test files already use.
export type { SubordinateStatus };

/**
 * 'unknown' is the load-bearing member. It means "this supervisor does not
 * know", and it exists so that state can never collapse into 'healthy'.
 */
export type GroupHealth = 'healthy' | 'degraded' | 'unknown';

export type DepartmentReportType = 'alert' | 'periodic';

/**
 * The result of trying to read a department's agents. A failure carries its
 * error_class so the report can name the reason it is blind.
 */
export type StatusCollection =
  | { ok: true; subordinates: SubordinateStatus[] }
  | { ok: false; errorClass: ErrorClass; message: string };

export interface HealthVerdict {
  health: GroupHealth;
  anomalies: string[];
  recommendations: string[];
  report_type: DepartmentReportType;
}

/**
 * The only reassuring line this system is allowed to emit. Exported so tests
 * can assert on the exact literal rather than a paraphrase of it.
 */
export const HEALTHY_RECOMMENDATION = 'All agents operating within normal parameters';

const STALE_AFTER_MS = 60 * 60 * 1000;
const SLOW_RUN_MS = 30000;
const HIGH_ERROR_COUNT = 5;
const ERROR_RATE_THRESHOLD = 0.3;

// --- Helpers ---------------------------------------------------------------

/**
 * last_run_at can arrive as a Date or as an ISO string. Read it tolerantly so
 * a stale agent is never missed on a type technicality.
 */
function lastRunMs(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function describeLastRun(value: Date | string | null | undefined): string {
  const ms = lastRunMs(value);
  return ms === null ? 'never recorded a run' : `last ran ${new Date(ms).toISOString()}`;
}

// --- Detectors -------------------------------------------------------------

/**
 * Anomalies for a department whose agents were read successfully.
 *
 * This exported entry point is defensive on purpose. Returning `[]` - the
 * value that means "looked, found nothing wrong" - for input it could not read
 * would be the original defect in a new costume. Throwing would be worse: a
 * TypeError aborts the cycle before any row is written, and silence is the one
 * outcome worse than a wrong row.
 */
export function detectAnomalies(subordinates: SubordinateStatus[], now: number = Date.now()): string[] {
  const normalized = normalizeSubordinateRows(subordinates);
  if (!normalized.readable) {
    return [
      `Agent status list could not be read: ${normalized.reason} (ContractViolation) - department health could not be determined`,
    ];
  }
  return [...normalized.malformed, ...detectValidatedAnomalies(normalized.valid, now)];
}

/**
 * The rules themselves, over rows that have already been validated.
 *
 * Every rule is additive to what shipped before: nothing was relaxed,
 * suppressed or allowlisted. `now` is injected so staleness is deterministic
 * under test and identical across a replay of the same inputs.
 */
function detectValidatedAnomalies(subordinates: SubordinateStatus[], now: number): string[] {
  const anomalies: string[] = [];
  const staleBefore = now - STALE_AFTER_MS;
  const enabledCount = subordinates.filter(s => s.enabled).length;

  // A department with members but nothing switched on cannot be healthy at any
  // size - including a department of one, which is the Finance/Partnerships
  // shape that the old >2-member floor silently excused.
  if (subordinates.length > 0 && enabledCount === 0) {
    anomalies.push(
      `All ${subordinates.length} agent(s) in this department are disabled - no work can run here`,
    );
  }

  for (const sub of subordinates) {
    if (sub.status === 'error') {
      anomalies.push(`${sub.agent_name} is in error state (${sub.error_count} errors)`);
    }

    // Status is read as the COMPLEMENT of "runnable", so a value nobody taught
    // this module about cannot fall through to healthy.
    if (!isRecognisedStatus(sub.status)) {
      // Uninterpretable whatever `enabled` says: this is not a state we are
      // reading, it is a string we do not understand.
      anomalies.push(
        `${sub.agent_name} reports status ${describeStatus(sub.status)}, which is not a known agent status - its health cannot be determined`,
      );
    } else if (sub.enabled && !isRunnableStatus(sub.status) && sub.status !== 'error') {
      // The ExecutionAgent backoff shape: `status` moved to 'paused' and
      // `enabled` was never cleared. Registered to run, and not running.
      anomalies.push(
        `${sub.agent_name} is enabled but its status is ${describeStatus(sub.status)}, which is not a running state - it is registered to run and is not running`,
      );
    }

    // Registered, switched on, and no run has ever been recorded. Kept
    // distinct from staleness on purpose: staleness means "it ran and
    // stopped", this means "it never started", and the two have different
    // fixes. Measured against production before adding the rule: of the agents
    // in a supervised agent_group, 0 are enabled with run_count = 0, so this
    // raises no new production alerts today.
    if (sub.enabled && sub.run_count === 0) {
      anomalies.push(
        `${sub.agent_name} is enabled but has never run (run_count 0) - it may never have been scheduled`,
      );
    }

    const ranAt = lastRunMs(sub.last_run_at);
    if (sub.enabled && ranAt !== null && ranAt < staleBefore && sub.run_count > 0) {
      anomalies.push(`${sub.agent_name} has not run in over 1 hour`);
    }

    // An agent that used to work and is now switched off is a finding, not a
    // silence. This is the rule whose absence muted Finance and Partnerships
    // for six weeks.
    if (!sub.enabled && sub.run_count > 0) {
      anomalies.push(
        `${sub.agent_name} is disabled after ${sub.run_count} run(s) - ${describeLastRun(sub.last_run_at)}`,
      );
    }

    if (sub.error_count >= HIGH_ERROR_COUNT) {
      anomalies.push(`${sub.agent_name} has ${sub.error_count} errors`);
    } else if (sub.run_count > 0 && sub.error_count >= sub.run_count) {
      // Every recorded run errored. The old pair of rules needed BOTH 5 errors
      // and 5 runs before either would speak, so 4 errors in 4 runs - an agent
      // that has never once succeeded - was certified healthy.
      anomalies.push(
        `${sub.agent_name} has never completed a run successfully (${sub.error_count} error(s) in ${sub.run_count} run(s))`,
      );
    } else if (sub.run_count > 0 && sub.error_count > 0) {
      // The 5-run floor is gone. Measured against production before removing
      // it: 0 agents in a supervised agent_group have run_count < 5 with an
      // error rate over 30%, so this raises no new production alerts today.
      const errorRate = sub.error_count / sub.run_count;
      if (errorRate > ERROR_RATE_THRESHOLD) {
        anomalies.push(`${sub.agent_name} has ${(errorRate * 100).toFixed(0)}% error rate`);
      }
    }

    if (sub.avg_duration_ms && sub.avg_duration_ms > SLOW_RUN_MS) {
      anomalies.push(
        `${sub.agent_name} avg duration ${(sub.avg_duration_ms / 1000).toFixed(1)}s exceeds 30s threshold`,
      );
    }
  }

  return anomalies;
}

/**
 * Recommendations are advice for a human reader. They never decide health and
 * never gate anything - health comes from the anomaly list alone.
 */
export function generateRecommendations(
  anomalies: string[],
  subordinates: SubordinateStatus[],
  health: GroupHealth,
): string[] {
  const recommendations: string[] = [];
  const rows = normalizeSubordinateRows(subordinates);
  const subs = rows.readable ? rows.valid : [];

  const erroredAgents = subs.filter(s => s.status === 'error');
  if (erroredAgents.length > 0) {
    recommendations.push(
      `Investigate and restart ${erroredAgents.length} errored agent(s): ${erroredAgents.map(a => a.agent_name).join(', ')}`,
    );
  }

  const stalledAgents = subs.filter(s => s.enabled && !isRunnableStatus(s.status) && s.status !== 'error');
  if (stalledAgents.length > 0) {
    recommendations.push(
      `Resume or formally disable ${stalledAgents.length} enabled agent(s) in a non-running state: ${stalledAgents.map(a => a.agent_name).join(', ')}`,
    );
  }

  const disabledAgents = subs.filter(s => !s.enabled);
  const enabledCount = subs.length - disabledAgents.length;

  if (subs.length > 0 && enabledCount === 0) {
    // The all-disabled case gets its own, louder line. The half-disabled line
    // below is skipped for it so the same fact is not reported twice.
    recommendations.push(
      `Re-enable or formally retire the ${subs.length} disabled agent(s) in this department`,
    );
  } else if (disabledAgents.length > 0 && disabledAgents.length * 2 >= subs.length) {
    // The old rule required subordinates.length > 2, so a department of one or
    // two could never trip it. The member floor is gone and the bar is now
    // "half or more" rather than "strictly over half" - strictly more
    // sensitive than what shipped, in both directions.
    recommendations.push(
      `${disabledAgents.length} of ${subs.length} department agents are disabled - review if intentional`,
    );
  }

  // THE INVARIANT. This string is the sentence a human reads as "nothing to do
  // here", and it is reachable from exactly one state.
  if (health === 'healthy') {
    recommendations.push(HEALTHY_RECOMMENDATION);
  }

  return recommendations;
}

// --- Verdict ---------------------------------------------------------------

function blindVerdict(anomaly: string, recommendation: string): HealthVerdict {
  return {
    health: 'unknown',
    anomalies: [anomaly],
    recommendations: [recommendation],
    report_type: 'alert',
  };
}

/**
 * Turn a status collection into the department's verdict.
 *
 * Four doors, and only the last of them can produce 'healthy':
 *   unreadable input  -> unknown (the contract was broken; say so, do not throw)
 *   collection failed -> unknown (we are blind, and we say so)
 *   zero members      -> unknown (a supervisor of nothing certifies nothing)
 *   otherwise         -> unknown if any row was unreadable, degraded if
 *                        anything was detected, else healthy
 */
export function evaluateGroupHealth(
  collection: StatusCollection,
  now: number = Date.now(),
): HealthVerdict {
  // The declared parameter type is the contract; these guards are the
  // enforcement. collectGroupStatus honours it, but this function is exported
  // and a JS caller, a mock or a future refactor can hand over anything - and
  // a TypeError raised here aborts runSuperAgentCycle before it writes any row
  // at all. Degrade to 'unknown': never throw, and never pass.
  const raw: unknown = collection;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return blindVerdict(
      `Agent status collection is ${describeValue(raw)}, not a status result (ContractViolation) - department health could not be determined`,
      'Fix the caller so it passes a status collection result to evaluateGroupHealth, then re-run this department health check',
    );
  }

  const candidate = raw as { ok?: unknown; errorClass?: unknown; message?: unknown; subordinates?: unknown };

  if (candidate.ok !== true) {
    // Reached by a genuine ok:false failure AND by an object carrying no `ok`
    // key at all. Both mean "we did not get a usable read", and neither passes.
    const errorClass = typeof candidate.errorClass === 'string' && candidate.errorClass !== ''
      ? candidate.errorClass
      : 'ContractViolation';
    const message = typeof candidate.message === 'string' && candidate.message !== ''
      ? candidate.message
      : 'no error detail provided';
    return blindVerdict(
      `Agent status collection failed (${errorClass}): ${message} - department health could not be determined`,
      `Resolve the ${errorClass} blocking the agent status query, then re-run this department health check`,
    );
  }

  const rows = normalizeSubordinateRows(candidate.subordinates);
  if (!rows.readable) {
    return blindVerdict(
      `Agent status collection reported success but ${rows.reason} (ContractViolation) - department health could not be determined`,
      'Fix the status collection so it returns an array of agent records, then re-run this department health check',
    );
  }

  if (rows.valid.length === 0 && rows.malformed.length === 0) {
    return blindVerdict(
      'Department has no registered agents, so its health cannot be determined',
      'Register at least one agent to this department, or retire the super agent that supervises it',
    );
  }

  const anomalies = [...rows.malformed, ...detectValidatedAnomalies(rows.valid, now)];

  // A row we could not read means part of this department is invisible, and a
  // supervisor that cannot see part of its department does not get to grade the
  // rest of it. 'degraded' would be a claim about agents we never read;
  // 'unknown' is the truth.
  const health: GroupHealth = rows.malformed.length > 0
    ? 'unknown'
    : anomalies.length > 0 ? 'degraded' : 'healthy';

  const recommendations = generateRecommendations(anomalies, rows.valid, health);
  if (rows.malformed.length > 0) {
    recommendations.unshift(
      `Repair the ${rows.malformed.length} unreadable agent record(s) in this department, then re-run this department health check`,
    );
  }

  return {
    health,
    anomalies,
    recommendations,
    report_type: health === 'healthy' ? 'periodic' : 'alert',
  };
}
