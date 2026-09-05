import api from '../utils/api';

// Mirrors backend/src/services/studentSuccessSnapshot/types.ts. Redeclared here
// rather than imported across the frontend/backend boundary (matches this
// codebase's own convention — see PersonHistory in PersonHistoryDrawer.tsx and
// StudentSummary in studentStoryApi.ts). Dates arrive as ISO strings over the
// wire, not the backend's `Date` type.

export type FieldStatus = 'known' | 'unknown' | 'not_applicable' | 'stale' | 'quarantined' | 'conflicting';

export interface SnapshotField<T> {
  value: T | null;
  status: FieldStatus;
  sourceSystem: string;
  sourceRecordIds: string[];
  observedAt: string | null;
  freshnessPolicy: string;
  reliabilityState: 'healthy' | 'degraded' | 'quarantined' | 'recovering';
  reliabilityReason?: string | null;
}

export interface IdentityValue { fullName: string | null; status: string | null; cohortId: string | null; cohortName: string | null; }
export interface AttendanceValue { sessionsPresent: number; sessionsHeldSoFar: number; attendancePct: number | null; }
export interface TimelineProgressValue { cardsCompleted: number; totalCardsSeen: number; lastActivityAt: string | null; }
export interface AssessmentTrendValue {
  evalsTaken: number; evalsPassed: number; avgEvalPct: number | null; weakCompetencies: string[];
  trend: 'up' | 'down' | 'flat';
}
export interface ReflectionCompletionValue { count: number; lastSubmittedAt: string | null; lastReadiness: number | null; }
export interface CompetencyEvidenceValue {
  domains: Array<{ domainId: string; domainName: string; confidence: number; evidenceCount: number }>;
}
export interface ArtifactsEvidenceValue { totalValidated: number; bySourceType: Record<string, number>; }
export interface CommunityActivityValue {
  postCount: number; totalLikesReceived: number; totalCommentsReceived: number; communityPoints: number; communityLevel: number;
}
export interface TicketsInterventionsValue {
  openCount: number; totalCount: number;
  recentTickets: Array<{ id: string; title: string; status: string; type: string; updatedAt: string | null }>;
}
export interface InstructorFeedbackValue { releasedCount: number; lastReleasedAt: string | null; avgConfidence: number | null; }
export type AgreedNextStepsValue = null;
export interface PreviousReeseCommunicationsValue {
  messageCount: number; lastMessageAt: string | null;
  recentMessages: Array<{ enrollmentId: string | null; isFromReese: boolean; createdAt: string | null }>;
}
export interface ProjectProgressValue {
  name: string | null; stage: string | null; requirementsCompletionPct: number | null;
  repoConnected: boolean; totalStories: number; verifiedStories: number;
}
export interface CertReadinessValue {
  overallState: 'not_measured' | 'building' | 'approaching' | 'sustained';
  overallScaled: number | null; knowledgeScaled: number | null; evidenceCoveragePct: number | null;
  weightsAvailable: boolean;
}

export interface StudentSuccessSnapshot {
  enrollmentId: string;
  asOf: string;
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
  agreedNextSteps: SnapshotField<AgreedNextStepsValue>;
}

export async function fetchStudentSuccessSnapshot(enrollmentId: string): Promise<StudentSuccessSnapshot> {
  const { data } = await api.get<StudentSuccessSnapshot>(
    `/api/admin/accelerator/enrollments/${enrollmentId}/success-snapshot`,
  );
  return data;
}
