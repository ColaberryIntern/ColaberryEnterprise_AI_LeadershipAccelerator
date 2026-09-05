const mockGetLatestStudentAssessment = jest.fn();
jest.mock('../../studentHealthAssessment', () => ({ getLatestStudentAssessment: (...a: any[]) => mockGetLatestStudentAssessment(...a) }));

import { getReeseHealthAssessmentHighlight } from '../reeseHealthAssessmentHighlights';

function assessment(overrides: any = {}) {
  return {
    id: 'a1', enrollmentId: 'enrollment-1', status: 'watch', confidenceScore: 60, confidenceBand: 'moderate',
    primaryRootCause: 'time_management_problem', secondaryRootCause: null, supportingEvidence: [], contradictingEvidence: [],
    excludedEvidence: [], positiveMomentumSignals: [], unansweredQuestions: [], recommendedIntervention: null,
    requiresHumanReview: false, reassessmentDate: '2026-09-20T00:00:00.000Z', rulesVersion: 'checkpoint-d-v1',
    model: 'gpt-4o-mini', llmCostUsd: 0.0002, createdAt: '2026-09-05T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getReeseHealthAssessmentHighlight', () => {
  it('happy path: a watch/at_risk/critical status renders the status and root cause', async () => {
    mockGetLatestStudentAssessment.mockResolvedValue(assessment({ status: 'at_risk', primaryRootCause: 'motivation_confidence_decline' }));

    const block = await getReeseHealthAssessmentHighlight('enrollment-1');

    expect(block).toContain('RECENT HEALTH ASSESSMENT');
    expect(block).toContain('at risk');
    expect(block).toContain('motivation confidence decline');
  });

  it('a recommended intervention is included when present', async () => {
    mockGetLatestStudentAssessment.mockResolvedValue(assessment({ recommendedIntervention: 'Schedule a check-in.' }));

    const block = await getReeseHealthAssessmentHighlight('enrollment-1');

    expect(block).toContain('Suggested approach: Schedule a check-in.');
  });

  it('honesty boundary: on_track is not notable, renders nothing', async () => {
    mockGetLatestStudentAssessment.mockResolvedValue(assessment({ status: 'on_track' }));

    const block = await getReeseHealthAssessmentHighlight('enrollment-1');

    expect(block).toBe('');
  });

  it('honesty boundary: unknown (inconclusive, not a signal either way) renders nothing', async () => {
    mockGetLatestStudentAssessment.mockResolvedValue(assessment({ status: 'unknown', primaryRootCause: 'unknown_conversation_required' }));

    const block = await getReeseHealthAssessmentHighlight('enrollment-1');

    expect(block).toBe('');
  });

  it('honesty boundary: no assessment has ever been run renders nothing', async () => {
    mockGetLatestStudentAssessment.mockResolvedValue(null);

    const block = await getReeseHealthAssessmentHighlight('enrollment-1');

    expect(block).toBe('');
  });

  it('fail-safe: a lookup failure returns empty string, never throws into the prompt builder', async () => {
    mockGetLatestStudentAssessment.mockRejectedValue(new Error('DB connection lost'));

    const block = await getReeseHealthAssessmentHighlight('enrollment-1');

    expect(block).toBe('');
  });
});
