/**
 * The validated subordinate row, and the one place that says what an agent's
 * `status` means.
 *
 * Two reasons this is its own module rather than more lines in
 * superAgentHealth.ts.
 *
 * 1. `ai_agents.status` is `DataTypes.STRING(20)` with no enum and no CHECK
 *    constraint (models/AiAgent.ts:380). The `AiAgentStatus` union
 *    'idle' | 'running' | 'paused' | 'error' (models/AiAgent.ts:204) is a
 *    TypeScript-only promise the database does not keep, so a row can arrive
 *    carrying 'crashed', 'stopped', '' or nothing at all. Health logic that
 *    tests only for `status === 'error'` and lets every other string fall
 *    through to 'healthy' repeats the defect this subtree exists to kill:
 *    absence of a recognised signal read as a positive signal. Naming the
 *    taxonomy in one place makes "a status we do not recognise" a state the
 *    rules can see and refuse to certify.
 *
 * 2. superAgentBase counts the "healthy" subordinates printed in the report
 *    summary, superAgentHealth decides the verdict, and while each held its
 *    own copy of `(status === 'idle' || status === 'running')` they could
 *    disagree. They did - one enabled, paused agent wrote the row
 *      "Finance: health HEALTHY - 0/1 healthy, 0 errored, 1 paused."
 *    where the number that proves it is broken sits beside the word healthy.
 *    Both now import `isRunnableStatus` from here.
 *
 * Pure: no database, no clock, no logging.
 */

/**
 * A subordinate row that has been through `normalizeSubordinateRows` and is
 * safe to reason about: `agent_name` is a non-empty string, the counts are
 * non-negative finite numbers, and `status` is a string (possibly one this
 * module does not recognise, which is itself a finding rather than a crash).
 *
 * `last_run_at` is deliberately wider than the model's `Date | null`. A raw
 * query, a JSON round-trip through a job payload or a cached report hands over
 * an ISO string, and the readers in superAgentHealth already parse both. The
 * narrow type was a lie the tests had to cast around.
 */
export interface SubordinateStatus {
  agent_name: string;
  status: string;
  enabled: boolean;
  last_run_at: Date | string | null;
  error_count: number;
  run_count: number;
  avg_duration_ms: number | null;
  last_error: string | null;
}

/**
 * Statuses that mean "this agent is in a position to do work". Everything
 * outside this set is a reason an enabled agent is not working - including a
 * value added to `AiAgentStatus` after this file was written, which is why the
 * rules test the COMPLEMENT of this set rather than listing bad statuses.
 */
export const RUNNABLE_STATUSES: ReadonlySet<string> = new Set(['idle', 'running']);

/** The whole `AiAgentStatus` union. A status outside it is uninterpretable. */
export const RECOGNISED_STATUSES: ReadonlySet<string> = new Set(['idle', 'running', 'paused', 'error']);

export function isRunnableStatus(status: unknown): boolean {
  return typeof status === 'string' && RUNNABLE_STATUSES.has(status);
}

export function isRecognisedStatus(status: unknown): boolean {
  return typeof status === 'string' && RECOGNISED_STATUSES.has(status);
}

/** Name a status in an anomaly line without ever printing a bare `undefined`. */
export function describeStatus(status: string): string {
  return status === '' ? '(none recorded)' : `'${status}'`;
}

/** Name a value's type in an anomaly line, for the same reason. */
export function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'an array';
  // 'object' is the one typeof that needs "an". An anomaly line reading "is a
  // object" looks like a formatting bug and invites the reader to discount the
  // whole finding.
  const type = typeof value;
  return `${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type}`;
}

/**
 * `readable: false` is the whole list being unusable - not an array at all.
 * `malformed` is the per-row version: the rows we could read are in `valid`,
 * and each row we could not read contributes one line instead of a TypeError.
 */
export type RowNormalization =
  | { readable: true; valid: SubordinateStatus[]; malformed: string[] }
  | { readable: false; reason: string };

export function normalizeSubordinateRows(rows: unknown): RowNormalization {
  if (!Array.isArray(rows)) {
    return {
      readable: false,
      reason: `the subordinate list is ${describeValue(rows)}, not an array of agent records`,
    };
  }

  const valid: SubordinateStatus[] = [];
  const malformed: string[] = [];

  rows.forEach((raw, index) => {
    const row = normalizeRow(raw, index);
    if (typeof row === 'string') malformed.push(row);
    else valid.push(row);
  });

  return { readable: true, valid, malformed };
}

/** A row, or the one-line reason it could not be made into one. */
function normalizeRow(raw: unknown, index: number): SubordinateStatus | string {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return `Subordinate row ${index} is ${describeValue(raw)}, not an agent record - this department could not be fully read`;
  }

  const row = raw as Record<string, unknown>;
  const name = typeof row.agent_name === 'string' ? row.agent_name.trim() : '';
  if (name === '') {
    return `Subordinate row ${index} has no agent_name - this department could not be fully read`;
  }

  return {
    agent_name: name,
    status: typeof row.status === 'string' ? row.status : '',
    // `=== true`, not `Boolean()`. An absent or non-boolean `enabled` reads as
    // disabled, and disabled is the reading that PRODUCES a finding here (the
    // all-disabled and disabled-after-running rules) while enabled-and-idle is
    // the only reading that can be certified. When the field cannot be trusted
    // we take the reading that cannot end in a false all-clear.
    enabled: row.enabled === true,
    last_run_at: normalizeTimestamp(row.last_run_at),
    // An unreadable count becomes 0. For `run_count` that is the strict
    // reading, because 0 runs on an enabled agent is itself an anomaly.
    error_count: toCount(row.error_count),
    run_count: toCount(row.run_count),
    avg_duration_ms: toDuration(row.avg_duration_ms),
    last_error: typeof row.last_error === 'string' ? row.last_error : null,
  };
}

function normalizeTimestamp(value: unknown): Date | string | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  return null;
}

function toCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function toDuration(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
