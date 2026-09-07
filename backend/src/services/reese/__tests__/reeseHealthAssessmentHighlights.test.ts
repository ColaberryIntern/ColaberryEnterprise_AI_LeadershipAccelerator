const mockGetLatestStudentAssessment = jest.fn();
jest.mock('../../studentHealthAssessment', () => ({ getLatestStudentAssessment: (...a: any[]) => mockGetLatestStudentAssessment(...a) }));

const mockGetChecklistForSubject = jest.fn();
jest.mock('../../checklist/checklistLookup', () => ({ getChecklistForSubject: (...a: any[]) => mockGetChecklistForSubject(...a) }));

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
  // Default: no checklist instance recorded for this assessment — fail-open,
  // matches assessmentChecklist.ts's own posture. Existing tests below never
  // set this up, so this default keeps them passing unchanged.
  mockGetChecklistForSubject.mockResolvedValue(null);
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

  describe('Capability 6 gate', () => {
    it('a notable status with an INCOMPLETE, non-bypassed checklist is suppressed — Reese must not act on it', async () => {
      mockGetLatestStudentAssessment.mockResolvedValue(assessment({ status: 'at_risk' }));
      mockGetChecklistForSubject.mockResolvedValue({ complete: false, bypassed_at: null });

      const block = await getReeseHealthAssessmentHighlight('enrollment-1');

      expect(block).toBe('');
    });

    it('a notable status with a COMPLETE checklist renders normally', async () => {
      mockGetLatestStudentAssessment.mockResolvedValue(assessment({ status: 'at_risk' }));
      mockGetChecklistForSubject.mockResolvedValue({ complete: true, bypassed_at: null });

      const block = await getReeseHealthAssessmentHighlight('enrollment-1');

      expect(block).toContain('RECENT HEALTH ASSESSMENT');
    });

    it('an INCOMPLETE checklist that has been explicitly bypassed still renders — a real, audited bypass authorizes the material action', async () => {
      mockGetLatestStudentAssessment.mockResolvedValue(assessment({ status: 'at_risk' }));
      mockGetChecklistForSubject.mockResolvedValue({ complete: false, bypassed_at: new Date('2026-09-07T00:00:00Z') });

      const block = await getReeseHealthAssessmentHighlight('enrollment-1');

      expect(block).toContain('RECENT HEALTH ASSESSMENT');
    });

    it('fail-open: no checklist instance recorded at all (bookkeeping failure) never blocks the highlight', async () => {
      mockGetLatestStudentAssessment.mockResolvedValue(assessment({ status: 'at_risk' }));
      mockGetChecklistForSubject.mockResolvedValue(null);

      const block = await getReeseHealthAssessmentHighlight('enrollment-1');

      expect(block).toContain('RECENT HEALTH ASSESSMENT');
    });

    it('looks up the checklist keyed on the real assessment id, scoped to the student_assessment subject type', async () => {
      mockGetLatestStudentAssessment.mockResolvedValue(assessment({ id: 'assessment-42', status: 'at_risk' }));
      mockGetChecklistForSubject.mockResolvedValue({ complete: true, bypassed_at: null });

      await getReeseHealthAssessmentHighlight('enrollment-1');

      expect(mockGetChecklistForSubject).toHaveBeenCalledWith('student_assessment', 'assessment-42');
    });
  });
});
