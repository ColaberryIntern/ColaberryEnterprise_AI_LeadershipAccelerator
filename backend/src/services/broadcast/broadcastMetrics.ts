/**
 * broadcastMetrics — the five operational measures §7 requires, for the five paths it names.
 *
 * PURE aggregation plus a thin emitter. Pure because the acceptance bar is that these
 * numbers are asserted EQUAL to hand-computed values rather than merely present, and a
 * metric you cannot compute by hand in a test is a metric nobody can audit in production.
 *
 * THREE DECISIONS THAT ARE EASY TO GET SUBTLY WRONG.
 *
 * 1. ZERO OBSERVATIONS YIELDS null, NOT ZERO.
 *    A success_rate of 0 means "everything failed". A success_rate of null means "nothing
 *    was measured". Collapsing them is how a dashboard reports a catastrophe during an
 *    outage of the dashboard itself — and §4.7 is explicit that a surface must show
 *    unavailable rather than a fabricated zero. Every rate here is `number | null`.
 *
 * 2. PERCENTILES USE NEAREST-RANK, STATED.
 *    There are several defensible definitions and they disagree on small samples, so the
 *    one in use is written down rather than left to whichever library is installed:
 *    the p-th percentile is the value at 1-indexed rank ceil(p/100 × N) in the sorted
 *    sample. No interpolation. On N=5 that makes p95 and p99 both the maximum, which is
 *    correct and worth knowing before someone reads too much into a p99 over five events.
 *
 * 3. retry_count IS A SUM, NOT A RATE.
 *    §7 asks for retry_count. It counts retries, including retries on operations that
 *    eventually succeeded — which is the whole point, because rising retries on a healthy
 *    success_rate is the earliest signal that an upstream is degrading.
 */
import { ensureTraceId } from '../../utils/requestContext';

/** The five paths §7 names. Nothing else is tracked here, so the list stays auditable. */
export const OPERATIONAL_PATHS = [
  'provider', 'playback_authorization', 'notification', 'recording', 'publishing',
] as const;
export type OperationalPath = (typeof OPERATIONAL_PATHS)[number];

export interface Observation {
  path: OperationalPath;
  outcome: 'success' | 'failure';
  durationMs: number;
  /** Retries consumed before this outcome. 0 on a first-attempt success. */
  retries?: number;
  /** Required on a failure. A generic 'Error' is rejected — see assertErrorClass. */
  errorClass?: string;
}

export interface Latency {
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export interface PathMetrics {
  volume: number;
  success_rate: number | null;
  failure_rate: number | null;
  retry_count: number;
  latency_ms: Latency;
}

/**
 * Nearest-rank percentile. Returns null for an empty sample rather than 0, for the same
 * reason the rates do.
 */
export function percentile(sortedAsc: ReadonlyArray<number>, p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  const idx = Math.min(Math.max(rank, 1), sortedAsc.length) - 1;
  return sortedAsc[idx];
}

/** Aggregate one path's observations. Pure. */
export function aggregate(observations: ReadonlyArray<Observation>): PathMetrics {
  const volume = observations.length;
  if (volume === 0) {
    // Not zero. Nothing was measured, and saying 0% success would be a lie about an
    // outage rather than a report of one.
    return {
      volume: 0,
      success_rate: null,
      failure_rate: null,
      retry_count: 0,
      latency_ms: { p50: null, p95: null, p99: null },
    };
  }

  const successes = observations.filter((o) => o.outcome === 'success').length;
  const durations = observations.map((o) => o.durationMs).sort((a, b) => a - b);
  const retries = observations.reduce((sum, o) => sum + (o.retries ?? 0), 0);

  return {
    volume,
    success_rate: successes / volume,
    failure_rate: (volume - successes) / volume,
    retry_count: retries,
    latency_ms: {
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      p99: percentile(durations, 99),
    },
  };
}

/** Aggregate every path, including the ones with no observations. */
export function aggregateAll(
  observations: ReadonlyArray<Observation>,
): Record<OperationalPath, PathMetrics> {
  const out = {} as Record<OperationalPath, PathMetrics>;
  for (const path of OPERATIONAL_PATHS) {
    // Every path appears even when unobserved, so a silent path is visible as
    // volume 0 / rates null rather than missing from the payload entirely.
    out[path] = aggregate(observations.filter((o) => o.path === path));
  }
  return out;
}

/**
 * Generic classes that carry no triage information. CLAUDE.md: "Generic `Error` is not an
 * acceptable classification in production code paths; if it appears in logs, the
 * surrounding code needs a more specific catch."
 */
const GENERIC_CLASSES = new Set(['Error', 'error', 'Exception', 'UnknownError', '', 'undefined', 'null']);

export function isUsableErrorClass(errorClass: string | undefined | null): boolean {
  if (!errorClass) return false;
  return !GENERIC_CLASSES.has(errorClass);
}

/**
 * Emit one observation in the JSON shape CLAUDE.md specifies, with the correlation id
 * threaded from the ambient request context.
 *
 * `correlation_id` is not optional here. The repo already has the plumbing
 * (`utils/requestContext.ensureTraceId`) and a column on the outbox that no caller had ever
 * populated; the point of this module is that a failure can be traced from symptom back to
 * cause on one id, which §7 says is the bar for the observability being complete at all.
 */
export function emitObservation(observation: Observation, correlationId?: string): void {
  const line = {
    timestamp: new Date().toISOString(),
    level: observation.outcome === 'failure' ? 'error' : 'info',
    service: 'broadcast',
    event: `broadcast_${observation.path}`,
    correlation_id: correlationId ?? ensureTraceId(),
    duration_ms: observation.durationMs,
    outcome: observation.outcome,
    ...(observation.outcome === 'failure'
      ? { error_class: isUsableErrorClass(observation.errorClass) ? observation.errorClass : 'UnclassifiedError' }
      : {}),
    context: { path: observation.path, retries: observation.retries ?? 0 },
  };
  if (observation.outcome === 'failure') console.error(JSON.stringify(line));
  else console.log(JSON.stringify(line));
}

/**
 * Time an operation and emit its observation. Returns the operation's own result, so it can
 * wrap an existing call without changing its contract.
 *
 * Re-throws after recording. Swallowing here would turn an instrumentation helper into a
 * silent-failure machine, which is the forbidden pattern in CLAUDE.md's Failure-First rules.
 */
export async function observe<T>(
  path: OperationalPath,
  fn: () => Promise<T>,
  opts: { retries?: number; nowMs?: () => number; correlationId?: string } = {},
): Promise<T> {
  const clock = opts.nowMs ?? (() => Date.now());
  const started = clock();
  try {
    const result = await fn();
    emitObservation({ path, outcome: 'success', durationMs: clock() - started, retries: opts.retries }, opts.correlationId);
    return result;
  } catch (err: any) {
    emitObservation(
      {
        path,
        outcome: 'failure',
        durationMs: clock() - started,
        retries: opts.retries,
        errorClass: err?.error_class || err?.name,
      },
      opts.correlationId,
    );
    throw err;
  }
}
