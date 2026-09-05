const mockGetStudentSuccessSnapshot = jest.fn();
jest.mock('../../studentSuccessSnapshot', () => ({ getStudentSuccessSnapshot: (...a: any[]) => mockGetStudentSuccessSnapshot(...a) }));

const mockChatJson = jest.fn();
jest.mock('../../runtime/runtimeAi', () => ({ chatJson: (...a: any[]) => mockChatJson(...a) }));

const mockCreate = jest.fn();
jest.mock('../../../models/StudentAssessment', () => ({ __esModule: true, default: { create: (...a: any[]) => mockCreate(...a) } }));

import { assessStudentHealth } from '../assessStudentHealth';

function known<T>(value: T): any {
  return { value, status: 'known', sourceSystem: 'x', sourceRecordIds: ['rec-1'], observedAt: new Date('2026-09-05T00:00:00Z'), freshnessPolicy: 'n/a', reliabilityState: 'healthy' };
}
function unknownField(reason: string): any {
  return { value: null, status: 'unknown', sourceSystem: 'x', sourceRecordIds: [], observedAt: null, freshnessPolicy: 'n/a', reliabilityState: 'healthy', reliabilityReason: reason };
}

function fullSnapshot(overrides: any = {}) {
  return {
    enrollmentId: 'enrollment-1',
    asOf: new Date(),
    identity: known({ fullName: 'Test Student', status: 'active', cohortId: 'c1', cohortName: 'Cohort A' }),
    attendance: known({ sessionsPresent: 8, sessionsHeldSoFar: 10, attendancePct: 80 }),
    timelineProgress: known({ cardsCompleted: 20, totalCardsSeen: 40, lastActivityAt: null }),
    assessmentTrend: known({ evalsTaken: 5, evalsPassed: 4, avgEvalPct: 82, weakCompetencies: [], trend: 'flat' }),
    reflectionCompletion: known({ count: 3, lastSubmittedAt: null, lastReadiness: 70 }),
    competencyEvidence: known({ domains: [] }),
    projectProgress: known({ name: 'Widget', stage: 'build', requirementsCompletionPct: 60, repoConnected: true, totalStories: 5, verifiedStories: 2 }),
    certReadiness: known({ overallState: 'building', overallScaled: 40, knowledgeScaled: 40, evidenceCoveragePct: 20, weightsAvailable: true }),
    artifactsEvidence: known({ totalValidated: 0, bySourceType: {} }),
    communityActivity: known({ postCount: 0, totalLikesReceived: 0, totalCommentsReceived: 0, communityPoints: 0, communityLevel: 1 }),
    ticketsInterventions: known({ openCount: 0, totalCount: 0, recentTickets: [] }),
    previousReeseCommunications: known({ messageCount: 0, lastMessageAt: null, recentMessages: [] }),
    instructorFeedback: known({ releasedCount: 0, lastReleasedAt: null, avgConfidence: null }),
    agreedNextSteps: { value: null, status: 'not_applicable', sourceSystem: 'work_ledger', sourceRecordIds: [], observedAt: null, freshnessPolicy: 'n/a', reliabilityState: 'healthy', reliabilityReason: 'n/a' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockImplementation(async (attrs: any) => ({ id: 'assessment-1', createdAt: new Date('2026-09-05T00:00:00Z'), ...attrs }));
});

describe('assessStudentHealth', () => {
  it('happy path: sufficient evidence calls the LLM and persists a real, validated assessment row', async () => {
    mockGetStudentSuccessSnapshot.mockResolvedValue(fullSnapshot());
    mockChatJson.mockResolvedValue({
      parsed: {
        status: 'watch', primaryRootCause: 'certification_readiness_gap', secondaryRootCause: null,
        supportingCategories: ['certReadiness'], contradictingCategories: [],
        unansweredQuestions: ['Has the student scheduled a practice exam?'],
        recommendedIntervention: 'Recommend a practice exam this week.', requiresHumanReview: false,
      },
      runtime_ms: 500, cost_usd: 0.002,
    });

    const result = await assessStudentHealth('enrollment-1');

    expect(mockChatJson).toHaveBeenCalledWith('student_health_assessment', expect.any(String), expect.any(String), expect.any(String));
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('watch');
    expect(result.primaryRootCause).toBe('certification_readiness_gap');
    expect(result.supportingEvidence).toHaveLength(1);
    expect(result.supportingEvidence[0].category).toBe('certReadiness');
    expect(result.llmCostUsd).toBe(0.002);
    expect(result.rulesVersion).toBe('checkpoint-d-v1');
  });

  it('honesty boundary: insufficient evidence never calls the LLM and persists an honest unknown assessment', async () => {
    mockGetStudentSuccessSnapshot.mockResolvedValue(fullSnapshot({
      attendance: unknownField('no data'), timelineProgress: unknownField('no data'), assessmentTrend: unknownField('no data'),
      reflectionCompletion: unknownField('no data'), competencyEvidence: unknownField('no data'), projectProgress: unknownField('no data'),
      certReadiness: unknownField('no data'), artifactsEvidence: unknownField('no data'), communityActivity: unknownField('no data'),
      ticketsInterventions: unknownField('no data'), previousReeseCommunications: unknownField('no data'), instructorFeedback: unknownField('no data'),
    }));

    const result = await assessStudentHealth('enrollment-1');

    expect(mockChatJson).not.toHaveBeenCalled();
    expect(result.status).toBe('unknown');
    expect(result.primaryRootCause).toBe('unknown_conversation_required');
    expect(result.confidenceBand).toBe('insufficient_evidence');
    expect(result.model).toBeNull();
    expect(result.llmCostUsd).toBeNull();
  });

  it('failure path: a chatJson rejection degrades to an unknown, human-review-required assessment rather than throwing', async () => {
    mockGetStudentSuccessSnapshot.mockResolvedValue(fullSnapshot());
    mockChatJson.mockRejectedValue(new Error('LLM provider timeout'));

    const result = await assessStudentHealth('enrollment-1');

    expect(result.status).toBe('unknown');
    expect(result.requiresHumanReview).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('a critical judgment always sets requires_human_review true on the persisted row', async () => {
    mockGetStudentSuccessSnapshot.mockResolvedValue(fullSnapshot());
    mockChatJson.mockResolvedValue({
      parsed: {
        status: 'critical', primaryRootCause: 'motivation_confidence_decline', secondaryRootCause: null,
        supportingCategories: ['attendance'], contradictingCategories: [], unansweredQuestions: [],
        recommendedIntervention: 'Escalate to instructor.', requiresHumanReview: false,
      },
      runtime_ms: 400, cost_usd: 0.001,
    });

    const result = await assessStudentHealth('enrollment-1');

    expect(result.status).toBe('critical');
    expect(result.requiresHumanReview).toBe(true);
    expect(mockCreate.mock.calls[0][0].requires_human_review).toBe(true);
  });
});
