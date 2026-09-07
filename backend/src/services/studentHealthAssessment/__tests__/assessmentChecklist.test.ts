const mockChecklistCreate = jest.fn();
jest.mock('../../../models/ChecklistInstance', () => ({
  __esModule: true,
  default: { create: (...a: any[]) => mockChecklistCreate(...a) },
}));

import { deriveAssessmentChecklistItems, createAssessmentChecklistInstance } from '../assessmentChecklist';
import { AssembledEvidence, LlmAssessmentJudgment } from '../types';

function snapshot(identityKnown = true): any {
  return { identity: { status: identityKnown ? 'known' : 'unknown' } };
}

function evidence(usableCategories: string[]): AssembledEvidence {
  return {
    enrollmentId: 'e1',
    usable: usableCategories.map((category) => ({ category: category as any, summary: '', sourceSystem: 'x', sourceRecordIds: [], observedAt: null })),
    excluded: [],
    knownCount: usableCategories.length,
    totalRelevant: 12,
    confidenceScore: 50,
    confidenceBand: 'moderate',
    meetsMinimumBar: true,
    positiveMomentumSignals: [],
  };
}

function judgment(overrides: Partial<LlmAssessmentJudgment> = {}): LlmAssessmentJudgment {
  return {
    status: 'watch',
    primaryRootCause: 'time_management_problem',
    secondaryRootCause: null,
    supportingCategories: ['attendance'],
    contradictingCategories: [],
    unansweredQuestions: [],
    recommendedIntervention: 'Schedule a check-in.',
    requiresHumanReview: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockChecklistCreate.mockImplementation(async (attrs: any) => ({ id: 'checklist-1', ...attrs }));
});

describe('deriveAssessmentChecklistItems', () => {
  it('happy path: full evidence coverage + a real recommendation + a real reassessment date completes every item', () => {
    const items = deriveAssessmentChecklistItems(
      snapshot(true),
      evidence(['attendance', 'timelineProgress', 'assessmentTrend', 'projectProgress', 'ticketsInterventions']),
      judgment(),
      new Date('2026-09-14T00:00:00Z'),
    );

    expect(items).toEqual({
      confirm_identity: true,
      validate_source_reliability: true,
      review_engagement: true,
      review_learning_progress: true,
      review_assessment_trend: true,
      review_project_activity: true,
      review_tickets_interventions: true,
      identify_evidence: true,
      record_quarantined_evidence: true,
      assign_confidence: true,
      determine_next_action: true,
      store_evidence_references: true,
      set_reassessment_date: true,
    });
  });

  it('honesty path: unknown identity is the one item that genuinely fails', () => {
    const items = deriveAssessmentChecklistItems(snapshot(false), evidence(['attendance']), judgment(), new Date());
    expect(items.confirm_identity).toBe(false);
  });

  it('honesty path: a category never known is an honest, non-fabricated false — not silently marked reviewed', () => {
    const items = deriveAssessmentChecklistItems(snapshot(true), evidence(['attendance']), judgment(), new Date());
    expect(items.review_engagement).toBe(true);
    expect(items.review_learning_progress).toBe(false);
    expect(items.review_project_activity).toBe(false);
  });

  it('review_project_activity is true from EITHER projectProgress or artifactsEvidence being known', () => {
    const items = deriveAssessmentChecklistItems(snapshot(true), evidence(['artifactsEvidence']), judgment(), new Date());
    expect(items.review_project_activity).toBe(true);
  });

  it('an unknown-status judgment (insufficient evidence) is NOT a failure of identify_evidence or determine_next_action — that is the correct behavior for that case', () => {
    const items = deriveAssessmentChecklistItems(
      snapshot(true), evidence([]),
      judgment({ status: 'unknown', supportingCategories: [], recommendedIntervention: null, unansweredQuestions: ['Needs a direct conversation.'] }),
      new Date(),
    );
    expect(items.identify_evidence).toBe(true);
    expect(items.determine_next_action).toBe(true);
  });

  it('BREAK: a non-unknown status with zero supporting evidence would fail identify_evidence — the real defensive value of this item (this invariant is already enforced upstream by assessmentPrompt.ts, so this predicate should never see it in practice)', () => {
    const items = deriveAssessmentChecklistItems(
      snapshot(true), evidence([]),
      judgment({ status: 'watch', supportingCategories: [] }),
      new Date(),
    );
    expect(items.identify_evidence).toBe(false);
  });

  it('BREAK: a non-unknown status with no recommendation and no unanswered questions would fail determine_next_action', () => {
    const items = deriveAssessmentChecklistItems(
      snapshot(true), evidence(['attendance']),
      judgment({ status: 'watch', recommendedIntervention: null }),
      new Date(),
    );
    expect(items.determine_next_action).toBe(false);
  });

  it('boundary: a null reassessment date fails set_reassessment_date', () => {
    const items = deriveAssessmentChecklistItems(snapshot(true), evidence(['attendance']), judgment(), null);
    expect(items.set_reassessment_date).toBe(false);
  });
});

describe('createAssessmentChecklistInstance', () => {
  it('persists checklist_type/subject_type/subject_id and the real derived items + completion state', async () => {
    await createAssessmentChecklistInstance(
      'assessment-1',
      snapshot(true),
      evidence(['attendance', 'timelineProgress', 'assessmentTrend', 'projectProgress', 'ticketsInterventions']),
      judgment(),
      new Date('2026-09-14T00:00:00Z'),
    );

    expect(mockChecklistCreate).toHaveBeenCalledWith(expect.objectContaining({
      checklist_type: 'assessment',
      subject_type: 'student_assessment',
      subject_id: 'assessment-1',
      complete: true,
      incomplete_items: [],
    }));
  });

  it('an incomplete required item is reflected in complete:false and incomplete_items', async () => {
    await createAssessmentChecklistInstance('assessment-2', snapshot(false), evidence([]), judgment(), new Date());

    const call = mockChecklistCreate.mock.calls[0][0];
    expect(call.complete).toBe(false);
    expect(call.incomplete_items).toContain('confirm_identity');
  });
});
