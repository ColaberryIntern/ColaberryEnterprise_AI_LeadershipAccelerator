const mockGetStudentSuccessSnapshot = jest.fn();
jest.mock('../../studentSuccessSnapshot', () => ({ getStudentSuccessSnapshot: (...a: any[]) => mockGetStudentSuccessSnapshot(...a) }));

const mockGetLatestStudentAssessment = jest.fn();
const mockMaybeRefreshStudentAssessment = jest.fn();
jest.mock('../../studentHealthAssessment', () => ({
  getLatestStudentAssessment: (...a: any[]) => mockGetLatestStudentAssessment(...a),
  maybeRefreshStudentAssessment: (...a: any[]) => mockMaybeRefreshStudentAssessment(...a),
}));

import { executeReeseTool, isReeseTool, REESE_TOOLS } from '../reeseTools';

function known<T>(value: T): any {
  return { value, status: 'known', sourceSystem: 'x', sourceRecordIds: ['rec-1'], observedAt: new Date('2026-09-06T00:00:00Z'), freshnessPolicy: 'n/a', reliabilityState: 'healthy' };
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
    projectProgress: unknownField('no active project'),
    certReadiness: unknownField('no practice exam yet'),
    artifactsEvidence: known({ totalValidated: 0, bySourceType: {} }),
    communityActivity: known({ postCount: 0, totalLikesReceived: 0, totalCommentsReceived: 0, communityPoints: 0, communityLevel: 1 }),
    ticketsInterventions: known({ openCount: 1, totalCount: 1, recentTickets: [] }),
    previousReeseCommunications: known({ messageCount: 9, lastMessageAt: null, recentMessages: [] }),
    instructorFeedback: known({ releasedCount: 0, lastReleasedAt: null, avgConfidence: null }),
    agreedNextSteps: { value: null, status: 'not_applicable', sourceSystem: 'work_ledger', sourceRecordIds: [], observedAt: null, freshnessPolicy: 'n/a', reliabilityState: 'healthy', reliabilityReason: 'n/a' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('REESE_TOOLS / isReeseTool', () => {
  it('exposes exactly the 2 read-only tools this slice scopes to, with no parameters accepted from the model', () => {
    const functionTools = REESE_TOOLS.filter((t): t is Extract<typeof t, { type: 'function' }> => t.type === 'function');
    expect(functionTools.map((t) => t.function.name).sort()).toEqual(['assess_student_health', 'read_student_success_snapshot']);
    for (const tool of functionTools) {
      expect((tool.function.parameters as any).properties).toEqual({});
    }
  });

  it('isReeseTool recognizes only the real tool names', () => {
    expect(isReeseTool('read_student_success_snapshot')).toBe(true);
    expect(isReeseTool('assess_student_health')).toBe(true);
    expect(isReeseTool('delete_everything')).toBe(false);
  });
});

describe('executeReeseTool — read_student_success_snapshot', () => {
  it('happy path: returns known categories with real summaries and excluded categories with real reasons, no raw sourceRecordIds leaked', async () => {
    mockGetStudentSuccessSnapshot.mockResolvedValue(fullSnapshot());

    const result = JSON.parse(await executeReeseTool('read_student_success_snapshot', 'enrollment-1'));

    expect(mockGetStudentSuccessSnapshot).toHaveBeenCalledWith('enrollment-1');
    const attendance = result.known.find((k: any) => k.category === 'attendance');
    expect(attendance.summary).toContain('8/10');
    expect(attendance.sourceRecordIds).toBeUndefined();
    const projectProgress = result.notKnown.find((k: any) => k.category === 'projectProgress');
    expect(projectProgress.reason).toBe('no active project');
  });

  it('failure path: a snapshot-service rejection degrades to an honest error payload, never throws into the reply pipeline', async () => {
    mockGetStudentSuccessSnapshot.mockRejectedValue(new Error('DB connection lost'));

    const result = JSON.parse(await executeReeseTool('read_student_success_snapshot', 'enrollment-1'));

    expect(result.error).toBe('Tool execution failed');
    expect(result.message).toContain('DB connection lost');
  });
});

describe('executeReeseTool — assess_student_health', () => {
  it('happy path: refreshes if due, then returns a compact judgment (no raw evidence citations)', async () => {
    mockMaybeRefreshStudentAssessment.mockResolvedValue(undefined);
    mockGetLatestStudentAssessment.mockResolvedValue({
      id: 'a1', enrollmentId: 'enrollment-1', status: 'watch', confidenceScore: 60, confidenceBand: 'moderate',
      primaryRootCause: 'time_management_problem', secondaryRootCause: null, supportingEvidence: [{ huge: 'payload' }],
      contradictingEvidence: [], excludedEvidence: [], positiveMomentumSignals: [], unansweredQuestions: [],
      recommendedIntervention: 'Schedule a check-in.', requiresHumanReview: false, reassessmentDate: null,
      rulesVersion: 'checkpoint-d-v1', model: 'gpt-4o-mini', llmCostUsd: 0.0002, createdAt: '2026-09-06T00:00:00.000Z',
    });

    const result = JSON.parse(await executeReeseTool('assess_student_health', 'enrollment-1'));

    expect(mockMaybeRefreshStudentAssessment).toHaveBeenCalledWith('enrollment-1');
    expect(result.status).toBe('watch');
    expect(result.recommendedIntervention).toBe('Schedule a check-in.');
    expect(result.supportingEvidence).toBeUndefined();
  });

  it('honesty boundary: no assessment exists even after a refresh attempt returns an honest unknown, not a fabricated result', async () => {
    mockMaybeRefreshStudentAssessment.mockResolvedValue(undefined);
    mockGetLatestStudentAssessment.mockResolvedValue(null);

    const result = JSON.parse(await executeReeseTool('assess_student_health', 'enrollment-1'));

    expect(result.status).toBe('unknown');
  });

  it('failure path: a refresh failure degrades to an honest error payload', async () => {
    mockMaybeRefreshStudentAssessment.mockRejectedValue(new Error('LLM provider timeout'));

    const result = JSON.parse(await executeReeseTool('assess_student_health', 'enrollment-1'));

    expect(result.error).toBe('Tool execution failed');
  });
});

describe('executeReeseTool — unknown tool name', () => {
  it('an unrecognized tool name returns an honest error, never silently no-ops or throws', async () => {
    const result = JSON.parse(await executeReeseTool('delete_everything', 'enrollment-1'));

    expect(result.error).toContain('Unknown tool');
    expect(mockGetStudentSuccessSnapshot).not.toHaveBeenCalled();
  });
});
