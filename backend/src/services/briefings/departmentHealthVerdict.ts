// ─── Department Health Verdict (pure) ────────────────────────────────────────
/**
 * How a `department_reports` row is turned into a verdict about a department.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two consumers used to compute the verdict inline, identically:
 *
 *     health: r.anomalies && (r.anomalies as any[]).length > 0 ? 'degraded' : 'healthy'
 *
 * so 'healthy' was the ELSE branch of "no anomalies were recorded", and a
 * supervisor with zero subordinates - or one whose status query had thrown -
 * produced no anomalies and was therefore certified healthy. On 2026-10-06
 * ContentEngineSuperAgent had written 9,366 such reports for an `agent_group`
 * that does not exist, and FinanceSuperAgent and PartnershipSuperAgent had
 * reported 'healthy' every 30 minutes since 2026-08-24, the day their single
 * subordinate stopped running.
 *
 * "No bad news" and "no news" are different states. This module keeps them
 * different, and 'healthy' is the only verdict that must be positively earned.
 *
 * WHO CALLS IT
 * ------------
 *   - services/cory/coryBrain.ts (getCOODashboardData) - the LIVE consumer.
 *     Its verdict is served by GET /api/admin/intelligence/cory/coo-dashboard
 *     and rendered by frontend CoryCOOTab.tsx, which is where the sentence
 *     "Content Engine - healthy - 0 agents" was on screen.
 *   - services/executiveBriefingService.ts (compileExecutiveBriefing), whose
 *     `departmentReports` field currently has NO renderer (see the comment at
 *     that call site).
 *
 * SHAPE
 * -----
 * Pure, no IO, no imports that touch Sequelize - the same pure-core/IO-shell
 * split as agents/openclaw/openclawCircuitBreaker.ts. Callers own the query;
 * this file owns the judgement, so the rules are testable without Postgres.
 *
 * FAIL CLOSED
 * -----------
 * Every reader below defends itself, and both entry points accept null. These
 * functions are called inside a `Promise.all` that builds a whole briefing and
 * inside the COO dashboard handler: a TypeError thrown over one malformed JSONB
 * column would take out the entire surface, replacing a wrong green tick with
 * a 500. Unreadable input is answered with 'unknown', never with a throw.
 */

import type { GroupHealth } from '../agents/departments/superAgents/superAgentHealth';

export type DepartmentHealth = 'healthy' | 'degraded' | 'unknown';

// Compile-time proof that this union is exactly the one the writer
// (superAgentHealth.evaluateGroupHealth) stamps into `metrics.health`. If a
// fourth state is ever added there, `tsc --noEmit` fails here instead of the
// new state silently landing in this file's "unreadable verdict" branch.
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;
type _WriterContract = Expect<Mutual<DepartmentHealth, GroupHealth>>;

/**
 * The parts of a DepartmentReport row this module reads.
 *
 * Structural on purpose: a Sequelize DepartmentReport instance satisfies it
 * without this file importing the model (which would drag the model layer, and
 * therefore a live database, into the test run). `metrics` and `anomalies` are
 * `unknown` rather than `any` so every read has to be defended - they are JSONB
 * columns and the row can hold whatever the database happens to hold.
 */
export interface DepartmentReportLike {
  department: string;
  summary: string;
  metrics?: unknown;
  anomalies?: unknown;
  created_at?: unknown;
}

/** What a caller can actually hand us. A row can be missing; it is not a crash. */
export type MaybeDepartmentReport = DepartmentReportLike | null | undefined;

export interface DepartmentHealthProjection {
  department: string;
  summary: string;
  health: DepartmentHealth;
}

/**
 * How old a report may be before this module stops believing it.
 *
 * The 8 super agents are on `3,33 * * * *` through `17,47 * * * *` - one sweep
 * every 30 minutes - so two hours is four consecutive missed cycles. Below that
 * this never fires. Above it, the department that has stopped reporting is the
 * Finance/Partnership failure mode, and the honest answer about a department
 * whose last word is four cycles old is that we do not know.
 */
export const DEPARTMENT_REPORT_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/**
 * Tolerance for a `created_at` in the future. Small clock skew between the
 * writer and the reader is normal; a report minted an hour from now is a model
 * bug, and a model bug is not evidence of health.
 */
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Severity ranking. The combinator below takes the WORST of every available
 * signal, which is what makes 'healthy' unreachable unless each signal
 * independently agrees, and makes it impossible for a later rule to cancel an
 * earlier alarm. Adding a quieter rule can therefore never weaken this
 * function - only a change to these ranks could, which is why they live here
 * and are asserted in the suite.
 */
const SEVERITY: Record<DepartmentHealth, number> = {
  healthy: 0,
  unknown: 1,
  degraded: 2,
};

function worst(verdicts: readonly DepartmentHealth[]): DepartmentHealth {
  return verdicts.reduce(
    (acc, v) => (SEVERITY[v] > SEVERITY[acc] ? v : acc),
    'healthy' as DepartmentHealth,
  );
}

/** A JSONB column can hold a scalar, an array or null; only a plain object has fields. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * A headcount: a non-negative safe integer, or null when the value cannot be
 * one. Fractions are rejected along with negatives, NaN, Infinity, booleans and
 * junk - `{ total: 0.4 }` is not "a department with some agents", it is a row
 * nobody should be reading a verdict out of.
 */
function readCount(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

/** True when the key is absent or explicitly empty - i.e. a pre-fix row, not a bad one. */
function absent(m: Record<string, unknown>, key: string): boolean {
  return !(key in m) || m[key] === null || m[key] === undefined;
}

/**
 * How many subordinates the supervisor saw, or null when the row does not say.
 *
 * Exported because the COO dashboard shows this number next to the verdict, and
 * "0 agents" must come from the row rather than from `(metrics as any)?.total
 * || 0`, which turned every unreadable metrics blob into a confident 0.
 *
 * `null` and `0` both mean "this supervisor cannot vouch for anything", but they
 * have different causes: 0 is an empty or unreadable agent_group (superAgentBase
 * writes `total: subordinates.length`, which is 0 on a failed read too), while
 * null is a mangled or pre-metrics row.
 */
export function readReportedAgentCount(metrics: unknown): number | null {
  const m = asRecord(metrics);
  if (!m) return null;
  return readCount(m.total);
}

/**
 * What the headcount fields say.
 *
 * `total` was the only field read before 2026-10-06, which is why the
 * Finance/Partnership half of the defect survived the first fix: a department
 * of one whose one agent is switched off, and a department of seven where all
 * seven errored, both carry total > 0 and both read 'healthy' if you stop at
 * total. `healthy`, `errored` and `paused` are present on all 74,769 historical
 * rows, so using them re-judges history with no migration.
 *
 * superAgentBase computes them as:
 *   healthy = enabled && (idle | running),  errored = status error,
 *   paused  = status paused || !enabled
 * over the four statuses AiAgentStatus allows, so with agents present a
 * `healthy` of 0 means not one agent is in a state where work can run. Every
 * such shape makes the current writer emit an anomaly and return 'degraded';
 * this rule is what makes the same true of the rows written before it existed.
 *
 * Returns signals only - never a single verdict - so the combinator keeps the
 * worst of these and of everything else on the row.
 */
function judgeHeadcount(m: Record<string, unknown> | null): DepartmentHealth[] {
  // No readable metrics object at all: a supervisor that reported nothing
  // measurable cannot be certified.
  if (!m) return ['unknown'];

  const signals: DepartmentHealth[] = [];

  const total = readCount(m.total);
  // No readable count, or a count of 0: a supervisor with nothing to supervise
  // knows nothing. This is the ContentEngine shape (9,366 rows of total 0).
  if (total === null || total === 0) signals.push('unknown');

  // A bucket that is present but is not a headcount, or that exceeds the
  // department's own size, is a contract violation between writer and reader.
  // An impossible number is a model bug, and a model bug is not evidence.
  for (const key of ['healthy', 'errored', 'paused'] as const) {
    if (absent(m, key)) continue;
    const n = readCount(m[key]);
    if (n === null || (total !== null && n > total)) signals.push('unknown');
  }

  const healthy = readCount(m.healthy);
  const errored = readCount(m.errored);
  const paused = readCount(m.paused);

  if (total !== null && total > 0) {
    // Agents exist and not one of them is in a working state.
    if (healthy === 0) signals.push('degraded');
    // An agent in error state is a finding, whatever the anomalies column says.
    if (errored !== null && errored > 0) signals.push('degraded');
    // The three buckets cover every status the writer models, and double-count
    // a disabled-and-errored agent, so they can sum ABOVE total but never
    // below it. Below means some agent is in a status this system does not
    // model, and an unaccounted-for agent is not a certifiable one.
    if (healthy !== null && errored !== null && paused !== null && healthy + errored + paused < total) {
      signals.push('unknown');
    }
  }

  return signals;
}

/**
 * Whether the supervisor could see its department at all.
 *
 * superAgentBase writes `collection_ok: collection.ok` and, on a failure,
 * `error_class`. It is the one field that says "I was blind", so discarding it
 * would leave a route to a false all-clear wide open: a row of
 * `{ total: 5, health: 'healthy', collection_ok: false }` is a supervisor
 * claiming health about agents it could not read.
 *
 * Absent means a pre-fix row and carries no signal. Present-and-exactly-`true`
 * is the only value that counts as sight; anything else - false, null, a
 * string, a number - is answered with 'unknown'.
 */
function judgeCollection(m: Record<string, unknown> | null): DepartmentHealth[] {
  if (!m || !('collection_ok' in m)) return [];
  return m.collection_ok === true ? [] : ['unknown'];
}

/**
 * The verdict the supervisor stamped on itself, or null when it did not stamp
 * one (every row written before 2026-10-06).
 *
 * An unrecognised value returns 'unknown', never null: a `health` field this
 * reader cannot interpret means the writer and the reader disagree about the
 * contract, and a contract violation is not evidence of health.
 */
function readDeclaredHealth(m: Record<string, unknown> | null): DepartmentHealth | null {
  if (!m || absent(m, 'health')) return null;

  const raw = m.health;
  if (typeof raw !== 'string') return 'unknown';

  const normalised = raw.trim().toLowerCase();
  return normalised in SEVERITY ? (normalised as DepartmentHealth) : 'unknown';
}

/**
 * Count the anomalies on a row.
 *
 * The old inline check did `(r.anomalies as any[]).length > 0`, which reads
 * `undefined` on a JSONB object and is therefore falsy - an anomalies payload
 * written as `{ ... }` instead of `[ ... ]` rendered as healthy. Both shapes
 * count here; the model types the column as `Record<string, any> | null`, so
 * the object shape is legal.
 */
function countAnomalies(anomalies: unknown): number {
  if (anomalies === null || anomalies === undefined) return 0;
  if (Array.isArray(anomalies)) return anomalies.length;

  const record = asRecord(anomalies);
  if (record) return Object.keys(record).length;

  // A scalar in the anomalies column is not nothing - somebody wrote something
  // there. An empty string is the one scalar that carries no finding.
  return typeof anomalies === 'string' && anomalies.trim() === '' ? 0 : 1;
}

/** Age of the report in ms, or null when the row carries no readable timestamp. */
function readAgeMs(createdAt: unknown, now: number): number | null {
  let ms: number;
  if (createdAt instanceof Date) ms = createdAt.getTime();
  else if (typeof createdAt === 'number') ms = createdAt;
  else if (typeof createdAt === 'string') ms = Date.parse(createdAt);
  else return null;

  return Number.isFinite(ms) ? now - ms : null;
}

/**
 * Decide what one department_reports row says about its department.
 *
 * Every signal is collected and the WORST one wins, so the list below is
 * documentation rather than control flow:
 *
 *   - row unreadable (null, scalar, array)            -> unknown
 *   - metrics unreadable, or total null or 0           -> unknown
 *   - a headcount bucket that is not a count, or that
 *     exceeds total, or buckets that undercount total  -> unknown
 *   - total > 0 and healthy 0, or errored > 0          -> degraded
 *   - collection_ok present and not exactly true       -> unknown
 *   - `metrics.health` present                         -> that value
 *   - anomalies present                                -> degraded
 *   - report older than DEPARTMENT_REPORT_STALE_AFTER_MS,
 *     or dated in the future beyond clock skew         -> unknown
 *   - otherwise                                        -> healthy
 *
 * Where two signals disagree, taking the worst gives the honest answer rather
 * than the convenient one:
 *
 *   - total 0 with `health: 'healthy'`  -> unknown, not healthy. A claim of
 *     health from a supervisor with no subordinates is not believed.
 *   - total 0 with `health: 'degraded'` -> degraded, not unknown. Downgrading a
 *     positive finding to "we don't know" would lose an alarm.
 *   - anomalies with `health: 'healthy'`-> degraded. The pre-existing anomaly
 *     check can never be cancelled by a later field.
 *
 * Pure. `now` is injected so staleness is testable without faking the clock.
 */
export function judgeDepartmentHealth(
  report: MaybeDepartmentReport,
  now: number = Date.now(),
): DepartmentHealth {
  // null, undefined, a scalar or an array: there is no row here to judge, and
  // the caller's whole surface must not die over it.
  const row = asRecord(report);
  if (!row) return 'unknown';

  const metrics = asRecord(row.metrics);
  const signals: DepartmentHealth[] = [
    ...judgeHeadcount(metrics),
    ...judgeCollection(metrics),
  ];

  const declared = readDeclaredHealth(metrics);
  if (declared !== null) signals.push(declared);

  if (countAnomalies(row.anomalies) > 0) signals.push('degraded');

  const ageMs = readAgeMs(row.created_at, now);
  if (ageMs !== null && (ageMs > DEPARTMENT_REPORT_STALE_AFTER_MS || ageMs < -CLOCK_SKEW_TOLERANCE_MS)) {
    signals.push('unknown');
  }

  // 'healthy' is the floor of `worst`, so it is returned only when no signal
  // spoke against it.
  return worst(signals);
}

/**
 * Project a department section: one row per department, newest first, each
 * carrying a three-state verdict.
 *
 * Dedup keeps the FIRST row seen per department, so the caller must pass rows
 * ordered `created_at DESC` for "first" to mean "most recent". The key is
 * trimmed and lower-cased so two spellings of the same department cannot each
 * claim a slot, while the emitted `department` keeps the row's own spelling.
 *
 * Fails closed in both directions: a non-array (including null) projects to no
 * departments, and an unreadable row inside the array projects as 'unknown'
 * rather than being dropped - a dropped department is silence, and silence is
 * the failure mode this module exists to end.
 *
 * Pure and replay-safe: it does not mutate the input array or its rows, and
 * calling it twice with the same rows and the same `now` returns deep-equal
 * output. The dedup set is function-local on purpose; hoisting it would make
 * the second call return nothing.
 */
export function projectDepartmentReports(
  reports: readonly MaybeDepartmentReport[] | null | undefined,
  now: number = Date.now(),
): DepartmentHealthProjection[] {
  const rows: readonly MaybeDepartmentReport[] = Array.isArray(reports) ? reports : [];
  const seen = new Set<string>();
  const out: DepartmentHealthProjection[] = [];

  for (const report of rows) {
    const row = asRecord(report);
    const department = row && typeof row.department === 'string' ? row.department : '';
    const key = department.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      department,
      summary: row && typeof row.summary === 'string' ? row.summary : '',
      health: judgeDepartmentHealth(report, now),
    });
  }

  return out;
}
