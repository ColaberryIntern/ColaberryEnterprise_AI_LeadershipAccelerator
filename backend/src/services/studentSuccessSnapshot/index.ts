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
 * completion. Slice 2 added 3 more: competency evidence, project/
 * repository progress, certification readiness. Slice 3 adds 4 more:
 * artifacts/evidence, community/room/event activity (also covers the
 * mission's separate "engagement" category — no distinct engagement data
 * source was found at Checkpoint A discovery, so treating them as two
 * would invent a distinction this codebase doesn't have), open tickets/
 * interventions, previous Reese communications (message bodies
 * deliberately excluded — PII discipline). 2 categories remain: agreed
 * next steps/due dates (real Capability 6/7 work-ledger concept — doesn't
 * exist in this codebase yet, deliberately not faked) and instructor/
 * manager feedback (MentorReviewItem — a later slice).
 */
import { getAttendanceField } from './attendanceSource';
import { getIdentityField } from './identitySource';
import { getTimelineProgressField } from './timelineProgressSource';
import { getAssessmentTrendField } from './assessmentTrendSource';
import { getReflectionCompletionField } from './reflectionCompletionSource';
import { getCompetencyEvidenceField } from './competencyEvidenceSource';
import { getProjectProgressField } from './projectProgressSource';
import { getCertReadinessField } from './certReadinessSource';
import { getArtifactsEvidenceField } from './artifactsEvidenceSource';
import { getCommunityActivityField } from './communityActivitySource';
import { getTicketsInterventionsField } from './ticketsInterventionsSource';
import { getPreviousReeseCommunicationsField } from './reeseCommunicationsSource';
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

  const [attendanceR, timelineR, assessmentR, reflectionR, competencyR, projectR, certR, artifactsR, communityR, ticketsR, reeseCommsR] = await Promise.allSettled([
    getAttendanceField(enrollmentId, cohortId),
    getTimelineProgressField(enrollmentId),
    getAssessmentTrendField(enrollmentId),
    getReflectionCompletionField(enrollmentId),
    getCompetencyEvidenceField(enrollmentId),
    getProjectProgressField(enrollmentId),
    getCertReadinessField(enrollmentId),
    getArtifactsEvidenceField(enrollmentId),
    getCommunityActivityField(enrollmentId),
    getTicketsInterventionsField(enrollmentId),
    getPreviousReeseCommunicationsField(enrollmentId),
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
    artifactsEvidence: artifactsR.status === 'fulfilled' ? artifactsR.value : unknownField('evidence_records', artifactsR.reason),
    communityActivity: communityR.status === 'fulfilled' ? communityR.value : unknownField('community_posts', communityR.reason),
    ticketsInterventions: ticketsR.status === 'fulfilled' ? ticketsR.value : unknownField('tickets_via_community_room', ticketsR.reason),
    previousReeseCommunications: reeseCommsR.status === 'fulfilled' ? reeseCommsR.value : unknownField('room_messages', reeseCommsR.reason),
  };
}

// Re-exported for a future caller that wants an honest not_applicable
// placeholder for a not-yet-built category (e.g. a UI drill-down listing
// all 15 mission categories) without importing types.ts directly.
export { notApplicableField };
