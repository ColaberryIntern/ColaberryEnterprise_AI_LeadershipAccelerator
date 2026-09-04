/**
 * studentSuccessSnapshot — Reese Agentic AI Employee mission, Checkpoint C,
 * Capability 2: "one canonical, read-only student snapshot assembler."
 *
 * getStudentSuccessSnapshot(enrollmentId) is the real entry point. Read-only
 * by construction (same discipline learnerContextService.ts already
 * established: no source here is ever written to as a side effect of
 * assembly). Resilient via Promise.allSettled — one slow/failed source
 * yields an honest `unknown` field for just that category, never a thrown
 * snapshot.
 *
 * Slice 1 (2026-09-04) implemented 5 of the mission's 15 named categories:
 * identity/cohort, attendance (reusing Checkpoint B's fail-closed
 * reliability gate), timeline progress, assessment trend, reflection
 * completion. Slice 2 (2026-09-04) adds 3 more: competency evidence,
 * project/repository progress, certification readiness. The remaining 7
 * (engagement, artifacts/evidence, community/room/event activity, open
 * tickets/interventions, previous Reese communications, agreed next
 * steps/due dates, instructor/manager feedback) are real, cataloged,
 * un-built categories — deliberately not stubbed as fake `not_applicable`
 * placeholders on the snapshot type itself (a field that doesn't exist yet
 * shouldn't pretend to be a real "N/A" verdict about the category) —
 * they're added to the type and wired for real in later slices, matching
 * Checkpoint B's own small-slice discipline.
 */
import { getAttendanceField } from './attendanceSource';
import { getIdentityField } from './identitySource';
import { getTimelineProgressField } from './timelineProgressSource';
import { getAssessmentTrendField } from './assessmentTrendSource';
import { getReflectionCompletionField } from './reflectionCompletionSource';
import { getCompetencyEvidenceField } from './competencyEvidenceSource';
import { getProjectProgressField } from './projectProgressSource';
import { getCertReadinessField } from './certReadinessSource';
import { AttendanceValue, IdentityValue, notApplicableField, SnapshotField, StudentSuccessSnapshot, TimelineProgressValue } from './types';

export * from './types';

function unknownField<T>(sourceSystem: string, error: unknown): SnapshotField<T> {
  const message = error instanceof Error ? error.message : String(error);
  return {
    value: null, status: 'unknown', sourceSystem, sourceRecordIds: [], observedAt: null,
    freshnessPolicy: 'n/a', reliabilityState: 'healthy', reliabilityReason: `Lookup failed: ${message}`,
  };
}

export async function getStudentSuccessSnapshot(enrollmentId: string): Promise<StudentSuccessSnapshot> {
  const identityResult = await Promise.allSettled([getIdentityField(enrollmentId)]);
  const identity: SnapshotField<IdentityValue> =
    identityResult[0].status === 'fulfilled' ? identityResult[0].value : unknownField('enrollment', (identityResult[0] as PromiseRejectedResult).reason);

  const cohortId = identity.value?.cohortId ?? null;

  const [attendanceR, timelineR, assessmentR, reflectionR, competencyR, projectR, certR] = await Promise.allSettled([
    getAttendanceField(enrollmentId, cohortId),
    getTimelineProgressField(enrollmentId),
    getAssessmentTrendField(enrollmentId),
    getReflectionCompletionField(enrollmentId),
    getCompetencyEvidenceField(enrollmentId),
    getProjectProgressField(enrollmentId),
    getCertReadinessField(enrollmentId),
  ]);

  return {
    enrollmentId,
    asOf: new Date(),
    identity,
    attendance: attendanceR.status === 'fulfilled' ? attendanceR.value : unknownField<AttendanceValue>('attendance', attendanceR.reason),
    timelineProgress: timelineR.status === 'fulfilled' ? timelineR.value : unknownField<TimelineProgressValue>('timeline_card_progress', timelineR.reason),
    assessmentTrend: assessmentR.status === 'fulfilled' ? assessmentR.value : unknownField('assessment_attempts', assessmentR.reason),
    reflectionCompletion: reflectionR.status === 'fulfilled' ? reflectionR.value : unknownField('reflection_entries', reflectionR.reason),
    competencyEvidence: competencyR.status === 'fulfilled' ? competencyR.value : unknownField('student_competency', competencyR.reason),
    projectProgress: projectR.status === 'fulfilled' ? projectR.value : unknownField('projects', projectR.reason),
    certReadiness: certR.status === 'fulfilled' ? certR.value : unknownField('cert_readiness_snapshots', certR.reason),
  };
}

// Re-exported for a future caller that wants an honest not_applicable
// placeholder for a not-yet-built category (e.g. a UI drill-down listing
// all 15 mission categories) without importing types.ts directly.
export { notApplicableField };
