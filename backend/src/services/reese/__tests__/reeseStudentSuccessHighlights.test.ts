const mockGetStudentSuccessSnapshot = jest.fn();
jest.mock('../../studentSuccessSnapshot', () => ({ getStudentSuccessSnapshot: (...a: any[]) => mockGetStudentSuccessSnapshot(...a) }));

import { getReeseStudentSuccessHighlights } from '../reeseStudentSuccessHighlights';

function unknownField() {
  return { value: null, status: 'unknown', sourceSystem: 'x', sourceRecordIds: [], observedAt: null, freshnessPolicy: 'n/a', reliabilityState: 'healthy' as const };
}

function emptySnapshot() {
  return {
    enrollmentId: 'enrollment-1', asOf: new Date(),
    identity: unknownField(), attendance: unknownField(), timelineProgress: unknownField(), assessmentTrend: unknownField(),
    reflectionCompletion: unknownField(), competencyEvidence: unknownField(), projectProgress: unknownField(),
    certReadiness: unknownField(), artifactsEvidence: unknownField(), communityActivity: unknownField(),
    ticketsInterventions: unknownField(), previousReeseCommunications: unknownField(), instructorFeedback: unknownField(),
    agreedNextSteps: unknownField(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getReeseStudentSuccessHighlights', () => {
  it('happy path: renders all 3 real facts when all are present and notable', async () => {
    mockGetStudentSuccessSnapshot.mockResolvedValue({
      ...emptySnapshot(),
      ticketsInterventions: { ...unknownField(), status: 'known', value: { openCount: 2, totalCount: 5, recentTickets: [] } },
      certReadiness: { ...unknownField(), status: 'known', value: { overallState: 'approaching', overallScaled: 72, knowledgeScaled: 75, evidenceCoveragePct: 60, weightsAvailable: true } },
      previousReeseCommunications: { ...unknownField(), status: 'known', value: { messageCount: 4, lastMessageAt: null, recentMessages: [] } },
    });

    const block = await getReeseStudentSuccessHighlights('enrollment-1');

    expect(block).toContain('ADDITIONAL CONTEXT');
    expect(block).toContain('2 open support tickets');
    expect(block).toContain('approaching');
    expect(block).toContain('72/100');
    expect(block).toContain("You've exchanged 4 messages");
  });

  it('honesty boundary: weightsAvailable:false is captioned honestly, never presented as exam-weighted', async () => {
    mockGetStudentSuccessSnapshot.mockResolvedValue({
      ...emptySnapshot(),
      certReadiness: { ...unknownField(), status: 'known', value: { overallState: 'building', overallScaled: null, knowledgeScaled: 40, evidenceCoveragePct: 10, weightsAvailable: false } },
    });

    const block = await getReeseStudentSuccessHighlights('enrollment-1');

    expect(block).toContain('coverage estimate, not exam-weighted');
  });

  it('honesty boundary: nothing notable (zero open tickets, no cert data, no history) returns empty string, no header at all', async () => {
    mockGetStudentSuccessSnapshot.mockResolvedValue(emptySnapshot());

    const block = await getReeseStudentSuccessHighlights('enrollment-1');

    expect(block).toBe('');
  });

  it('zero open tickets is not rendered as a line at all (only genuinely notable facts appear)', async () => {
    mockGetStudentSuccessSnapshot.mockResolvedValue({
      ...emptySnapshot(),
      ticketsInterventions: { ...unknownField(), status: 'known', value: { openCount: 0, totalCount: 3, recentTickets: [] } },
    });

    const block = await getReeseStudentSuccessHighlights('enrollment-1');

    expect(block).toBe('');
  });

  it('fail-safe: a snapshot-assembly failure returns empty string, never throws into the prompt builder', async () => {
    mockGetStudentSuccessSnapshot.mockRejectedValue(new Error('DB connection lost'));

    const block = await getReeseStudentSuccessHighlights('enrollment-1');

    expect(block).toBe('');
  });
});
