import { parseAssessmentResponse } from '../assessmentPrompt';
import { AssembledEvidence } from '../types';

function evidence(overrides: Partial<AssembledEvidence> = {}): AssembledEvidence {
  return {
    enrollmentId: 'enrollment-1',
    usable: [
      { category: 'attendance', summary: '8/10 sessions attended (80%)', sourceSystem: 'x', sourceRecordIds: [], observedAt: null },
      { category: 'ticketsInterventions', summary: '1 open / 3 total support tickets', sourceSystem: 'x', sourceRecordIds: [], observedAt: null },
    ],
    excluded: [],
    knownCount: 2,
    totalRelevant: 12,
    confidenceScore: 17,
    confidenceBand: 'low',
    meetsMinimumBar: true,
    positiveMomentumSignals: [],
    ...overrides,
  };
}

describe('parseAssessmentResponse', () => {
  it('happy path: a well-formed response is accepted and passed through', () => {
    const judgment = parseAssessmentResponse({
      status: 'watch',
      primaryRootCause: 'time_management_problem',
      secondaryRootCause: null,
      supportingCategories: ['attendance'],
      contradictingCategories: [],
      unansweredQuestions: ['Is the student still enrolled full-time?'],
      recommendedIntervention: 'Schedule a check-in about pacing.',
      requiresHumanReview: false,
    }, evidence());

    expect(judgment.status).toBe('watch');
    expect(judgment.primaryRootCause).toBe('time_management_problem');
    expect(judgment.supportingCategories).toEqual(['attendance']);
    expect(judgment.recommendedIntervention).toBe('Schedule a check-in about pacing.');
  });

  it('honesty boundary: chatJson()\'s documented {} fallback (unparseable LLM output) degrades to unknown + forced human review, never a fabricated status', () => {
    const judgment = parseAssessmentResponse({}, evidence());

    expect(judgment.status).toBe('unknown');
    expect(judgment.requiresHumanReview).toBe(true);
    expect(judgment.primaryRootCause).toBeNull();
  });

  it('a category the model was never shown is dropped, not trusted as a real citation', () => {
    const judgment = parseAssessmentResponse({
      status: 'on_track',
      primaryRootCause: null,
      secondaryRootCause: null,
      supportingCategories: ['attendance', 'competencyEvidence'], // competencyEvidence was never in `usable`
      contradictingCategories: [],
      unansweredQuestions: [],
      recommendedIntervention: null,
      requiresHumanReview: false,
    }, evidence());

    expect(judgment.supportingCategories).toEqual(['attendance']);
  });

  it('a root cause outside the fixed enum is dropped to null, not passed through as free text', () => {
    const judgment = parseAssessmentResponse({
      status: 'at_risk',
      primaryRootCause: 'the student just seems lazy', // not a real enum value
      secondaryRootCause: null,
      supportingCategories: [],
      contradictingCategories: [],
      unansweredQuestions: [],
      recommendedIntervention: null,
      requiresHumanReview: false,
    }, evidence());

    expect(judgment.primaryRootCause).toBeNull();
  });

  it('safety net: critical status forces requiresHumanReview true even if the model said false', () => {
    const judgment = parseAssessmentResponse({
      status: 'critical',
      primaryRootCause: 'motivation_confidence_decline',
      secondaryRootCause: null,
      supportingCategories: [],
      contradictingCategories: [],
      unansweredQuestions: [],
      recommendedIntervention: null,
      requiresHumanReview: false,
    }, evidence());

    expect(judgment.requiresHumanReview).toBe(true);
  });

  it('safety net: at_risk status also forces requiresHumanReview true', () => {
    const judgment = parseAssessmentResponse({
      status: 'at_risk', primaryRootCause: null, secondaryRootCause: null,
      supportingCategories: [], contradictingCategories: [], unansweredQuestions: [],
      recommendedIntervention: null, requiresHumanReview: false,
    }, evidence());

    expect(judgment.requiresHumanReview).toBe(true);
  });

  it('honesty boundary: a real production case — a confident non-unknown status with an empty supportingCategories array is discarded, never trusted (caught live on gpt-4o-mini, Checkpoint D verification)', () => {
    const judgment = parseAssessmentResponse({
      status: 'critical', primaryRootCause: 'motivation_confidence_decline', secondaryRootCause: null,
      supportingCategories: [], contradictingCategories: [], unansweredQuestions: [],
      recommendedIntervention: 'Increase engagement.', requiresHumanReview: true,
    }, evidence());

    expect(judgment.status).toBe('unknown');
    expect(judgment.primaryRootCause).toBeNull();
    expect(judgment.requiresHumanReview).toBe(true);
  });

  it('a status is kept when supportingCategories survives filtering to at least one real category, even if some cited categories were dropped', () => {
    const judgment = parseAssessmentResponse({
      status: 'watch', primaryRootCause: null, secondaryRootCause: null,
      supportingCategories: ['attendance', 'not_a_real_category'], contradictingCategories: [],
      unansweredQuestions: [], recommendedIntervention: null, requiresHumanReview: false,
    }, evidence());

    expect(judgment.status).toBe('watch');
    expect(judgment.supportingCategories).toEqual(['attendance']);
  });

  it('an invalid status value degrades to the unknown fallback entirely', () => {
    const judgment = parseAssessmentResponse({ status: 'thriving' }, evidence());

    expect(judgment.status).toBe('unknown');
    expect(judgment.requiresHumanReview).toBe(true);
  });
});
