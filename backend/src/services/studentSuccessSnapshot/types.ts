/**
 * studentSuccessSnapshot/types — Reese Agentic AI Employee mission,
 * Checkpoint C (Capability 2: Student Success 360). Pure types, no I/O.
 *
 * Every field is a `SnapshotField<T>` — real value + real provenance +
 * real reliability state, per the mission's own required envelope. Missing
 * data is NEVER converted to a fabricated zero/failure/absence — a
 * genuinely-zero real fact (e.g. "0 evaluations taken yet") gets
 * `status: 'known'` with `value: {..., evalsTaken: 0}` (it IS known, and
 * the true answer is zero); `status: 'unknown'` is reserved for when the
 * underlying source genuinely could not be read (a query failure, a
 * missing record). `status: 'quarantined'` means the reliability gate
 * (metricReliabilityService.ts, Checkpoint B) currently excludes this
 * source — `value` is `null` in that case, never the untrusted real data.
 */

export type FieldStatus = 'known' | 'unknown' | 'not_applicable' | 'stale' | 'quarantined' | 'conflicting';

export interface SnapshotField<T> {
  value: T | null;
  status: FieldStatus;
  sourceSystem: string;
  sourceRecordIds: string[];
  observedAt: Date | null;
  freshnessPolicy: string;
  reliabilityState: 'healthy' | 'degraded' | 'quarantined' | 'recovering';
  reliabilityReason?: string | null;
}

export interface IdentityValue {
  fullName: string | null;
  status: string | null;
  cohortId: string | null;
  cohortName: string | null;
}

export interface AttendanceValue {
  sessionsPresent: number;
  sessionsHeldSoFar: number;
  attendancePct: number | null;
}

export interface TimelineProgressValue {
  cardsCompleted: number;
  totalCardsSeen: number;
  lastActivityAt: string | null;
}

export interface AssessmentTrendValue {
  evalsTaken: number;
  evalsPassed: number;
  avgEvalPct: number | null;
  weakCompetencies: string[];
  /** 'up'|'down'|'flat' — acceleratorService.ts's own computeTrendDirection(),
   * reused rather than re-derived. */
  trend: 'up' | 'down' | 'flat';
}

export interface ReflectionCompletionValue {
  count: number;
  lastSubmittedAt: string | null;
  lastReadiness: number | null;
}

/**
 * Capability 2's own field list, in the mission's stated order. Slice 1
 * (2026-09-04) implements identity/attendance/timelineProgress/
 * assessmentTrend/reflectionCompletion for real — every other field is
 * honestly `not_applicable` (a real category with zero backing source
 * today, e.g. `agreedNextSteps` — Capability 6/7's work-ledger/checklist
 * system doesn't exist yet) or deferred to a later slice, never faked to
 * look complete. See index.ts's own header for exactly which is which.
 */
export interface StudentSuccessSnapshot {
  enrollmentId: string;
  asOf: Date;
  identity: SnapshotField<IdentityValue>;
  attendance: SnapshotField<AttendanceValue>;
  timelineProgress: SnapshotField<TimelineProgressValue>;
  assessmentTrend: SnapshotField<AssessmentTrendValue>;
  reflectionCompletion: SnapshotField<ReflectionCompletionValue>;
}

/** A field with no real backing source yet — honest, never a guess. */
export function notApplicableField<T>(sourceSystem: string, reason: string): SnapshotField<T> {
  return {
    value: null,
    status: 'not_applicable',
    sourceSystem,
    sourceRecordIds: [],
    observedAt: null,
    freshnessPolicy: 'n/a',
    reliabilityState: 'healthy',
    reliabilityReason: reason,
  };
}
