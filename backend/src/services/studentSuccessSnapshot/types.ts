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

export interface CompetencyEvidenceValue {
  domains: Array<{ domainId: string; domainName: string; confidence: number; evidenceCount: number }>;
}

export interface ArtifactsEvidenceValue {
  totalValidated: number;
  bySourceType: Record<string, number>;
}

export interface CommunityActivityValue {
  postCount: number;
  totalLikesReceived: number;
  totalCommentsReceived: number;
  communityPoints: number;
  communityLevel: number;
}

export interface TicketsInterventionsValue {
  openCount: number;
  totalCount: number;
  recentTickets: Array<{ id: string; title: string; status: string; type: string; updatedAt: string | null }>;
}

export interface InstructorFeedbackValue {
  releasedCount: number;
  lastReleasedAt: string | null;
  avgConfidence: number | null;
}

/** Capability 6/7 (work ledger, stateful checklists, commitment tracking)
 * doesn't exist in this codebase yet — confirmed at Checkpoint A
 * discovery. There is real value here (once built), but nothing real to
 * report today; this stays `not_applicable` (value always null), never a
 * guessed/empty-but-pretending-to-be-real value. */
export type AgreedNextStepsValue = null;

export interface PreviousReeseCommunicationsValue {
  messageCount: number;
  lastMessageAt: string | null;
  /** Body text deliberately excluded — matches this codebase's own
   * PII-redaction discipline (learnerContextFormat.ts's redactPII()). A
   * caller that genuinely needs message content should read RoomMessage
   * directly with its own justification, not get it smuggled through here. */
  recentMessages: Array<{ enrollmentId: string | null; isFromReese: boolean; createdAt: string | null }>;
}

export interface ProjectProgressValue {
  name: string | null;
  stage: string | null;
  requirementsCompletionPct: number | null;
  repoConnected: boolean;
  totalStories: number;
  /** StudentTask.verified_at IS NOT NULL — platform-confirmed completion,
   * distinct from the student's own self-reported status. */
  verifiedStories: number;
}

export interface CertReadinessValue {
  overallState: 'not_measured' | 'building' | 'approaching' | 'sustained';
  overallScaled: number | null;
  knowledgeScaled: number | null;
  evidenceCoveragePct: number | null;
  /** false = a coverage estimate, not an exam-weighted one — must be
   * captioned honestly by any caller, per the model's own header comment. */
  weightsAvailable: boolean;
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
  competencyEvidence: SnapshotField<CompetencyEvidenceValue>;
  projectProgress: SnapshotField<ProjectProgressValue>;
  certReadiness: SnapshotField<CertReadinessValue>;
  artifactsEvidence: SnapshotField<ArtifactsEvidenceValue>;
  communityActivity: SnapshotField<CommunityActivityValue>;
  ticketsInterventions: SnapshotField<TicketsInterventionsValue>;
  previousReeseCommunications: SnapshotField<PreviousReeseCommunicationsValue>;
  instructorFeedback: SnapshotField<InstructorFeedbackValue>;
  /** Always `not_applicable` today — see AgreedNextStepsValue's own comment. */
  agreedNextSteps: SnapshotField<AgreedNextStepsValue>;
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
