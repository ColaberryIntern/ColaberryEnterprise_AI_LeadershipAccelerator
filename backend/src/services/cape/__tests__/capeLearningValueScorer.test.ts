import { scoreLearningValue } from '../capeLearningValueScorer';
import { EMPTY_CONTRACT, type LearningValueCandidate } from '../capeCandidateFeatureService';
import type { LearnerState, LearnerSkillState } from '../capeLearnerStateService';

const NOW = new Date('2026-08-03T00:00:00.000Z');

function skillState(overrides: Partial<LearnerSkillState> & { skill_id: string }): LearnerSkillState {
  return {
    name: overrides.skill_id, axis_order: 0, placement: 0, claim: 0, knowledge: 0, application: 0,
    judgment: 0, proficiency: 0, confidence: 0, next_review_at: null, evidence_balance_ratio: 1,
    ...overrides,
  };
}

function learnerState(skills: LearnerSkillState[], overrides: Partial<LearnerState> = {}): LearnerState {
  return {
    enrollment_id: 'enr-1', skills, overall_placement: 0, overall_proficiency: 0,
    goal: null, role: null, industry: null, has_resume: false, recent_failure: false,
    learner_state_version: NOW.toISOString(),
    ...overrides,
  };
}

function candidate(overrides: Partial<LearningValueCandidate> = {}): LearningValueCandidate {
  return {
    position: 0, kind: 'anchored', ref: 'x', surface: 'today', type: 'implementation_task', render_band: 'task',
    card_id: 'card-x', title: 'x', subtitle: null, description: null, image: null, video: null, blog: null,
    content: null, week: 5, estimated_time: 15, status: null, interacted: false,
    skill_mapping: EMPTY_CONTRACT,
    ...overrides,
  };
}

function withImpact(skillId: string, weight = 1, bands: Array<'claim' | 'knowledge' | 'application' | 'judgment'> = ['knowledge']) {
  return {
    skill_mapping: {
      ...EMPTY_CONTRACT,
      skill_impacts: [{ skill_id: skillId, weight, bands, credit_strength: 'medium' as const, evidence_required: false, max_credit: 20 }],
    },
  };
}

describe('scoreLearningValue — happy path: skill-gap fit', () => {
  it('a candidate matching the learner\'s weakest skill scores higher than one matching an already-mastered skill', () => {
    const state = learnerState([skillState({ skill_id: 'rag', proficiency: 5 }), skillState({ skill_id: 'agents_mcp', proficiency: 95 })]);
    const weak = candidate({ ref: 'weak', ...withImpact('rag') });
    const mastered = candidate({ ref: 'mastered', ...withImpact('agents_mcp') });
    const weakScore = scoreLearningValue(weak, state, NOW);
    const masteredScore = scoreLearningValue(mastered, state, NOW);
    expect(weakScore.components.skill_gap_fit).toBeGreaterThan(masteredScore.components.skill_gap_fit);
    expect(weakScore.score).toBeGreaterThan(masteredScore.score);
  });
});

describe('scoreLearningValue — NAMED evidence-balance-need test (required by the request)', () => {
  it('an application-band candidate scores measurably higher for a heavy-knowledge/thin-application learner than for a balanced learner, and cites it in reasons', () => {
    const applicationCandidate = candidate({ ref: 'lab', ...withImpact('agents_mcp', 1, ['application']) });

    const imbalancedLearner = learnerState([
      skillState({ skill_id: 'agents_mcp', knowledge: 80, application: 5, evidence_balance_ratio: 5 }),
    ]);
    const balancedLearner = learnerState([
      skillState({ skill_id: 'agents_mcp', knowledge: 40, application: 40, evidence_balance_ratio: 1 }),
    ]);

    const imbalancedResult = scoreLearningValue(applicationCandidate, imbalancedLearner, NOW);
    const balancedResult = scoreLearningValue(applicationCandidate, balancedLearner, NOW);

    expect(imbalancedResult.components.evidence_balance_need).toBeGreaterThan(balancedResult.components.evidence_balance_need);
    expect(imbalancedResult.score).toBeGreaterThan(balancedResult.score);
    expect(imbalancedResult.reasons).toContain('evidence-balance: favors building over more consumption');
  });

  it('a KNOWLEDGE-band-only candidate (no application/judgment) is unaffected by evidence imbalance — neutral either way', () => {
    const knowledgeCandidate = candidate({ ref: 'article', ...withImpact('agents_mcp', 1, ['knowledge']) });
    const imbalancedLearner = learnerState([skillState({ skill_id: 'agents_mcp', evidence_balance_ratio: 5 })]);
    const result = scoreLearningValue(knowledgeCandidate, imbalancedLearner, NOW);
    expect(result.components.evidence_balance_need).toBe(0.5);
  });
});

describe('scoreLearningValue — boundary: zero-credit candidate (empty skill_impacts)', () => {
  it('produces a valid, non-NaN score with neutral skill-gap/prerequisite components', () => {
    const result = scoreLearningValue(candidate({ skill_mapping: EMPTY_CONTRACT }), learnerState([]), NOW);
    expect(Number.isNaN(result.score)).toBe(false);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.components.skill_gap_fit).toBe(0.5);
    expect(result.components.prerequisite_sequence_fit).toBe(0.5);
  });
});

describe('scoreLearningValue — boundary: zero-evidence learner (brand new, empty skills array)', () => {
  it('produces a valid score for every candidate type, no divide-by-zero', () => {
    const candidates = [
      candidate({ ref: 'a', ...withImpact('rag') }),
      candidate({ ref: 'b', type: 'ai_news_flash' }),
      candidate({ ref: 'c', type: 'live_class' }),
    ];
    const state = learnerState([]);
    for (const c of candidates) {
      const result = scoreLearningValue(c, state, NOW);
      expect(Number.isNaN(result.score)).toBe(false);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });
});

describe('scoreLearningValue — prerequisite/sequence fit', () => {
  it('scores 1.0 when the learner\'s placement sits inside recommended_range', () => {
    const state = learnerState([skillState({ skill_id: 'rag', placement: 30 })]);
    const c = candidate({
      skill_mapping: { ...EMPTY_CONTRACT, skill_impacts: [{ skill_id: 'rag', weight: 1, bands: ['knowledge'], credit_strength: 'medium', evidence_required: false, max_credit: 10 }], recommended_range: { min: 20, max: 60 } },
    });
    expect(scoreLearningValue(c, state, NOW).components.prerequisite_sequence_fit).toBe(1);
  });

  it('decays below 1.0 the further the learner is outside the range', () => {
    const state = learnerState([skillState({ skill_id: 'rag', placement: 0 })]);
    const c = candidate({
      skill_mapping: { ...EMPTY_CONTRACT, skill_impacts: [{ skill_id: 'rag', weight: 1, bands: ['knowledge'], credit_strength: 'medium', evidence_required: false, max_credit: 10 }], recommended_range: { min: 20, max: 60 } },
    });
    const result = scoreLearningValue(c, state, NOW).components.prerequisite_sequence_fit;
    expect(result).toBeLessThan(1);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

describe('scoreLearningValue — goal/role/industry fit', () => {
  it('scores higher when a candidate\'s skill matches the learner\'s stated goal text', () => {
    const state = learnerState([], { goal: 'Become an AI Architect focused on system design and governance' });
    const matching = candidate({ ref: 'sd', ...withImpact('system_design') });
    const nonMatching = candidate({ ref: 'rag', ...withImpact('rag') });
    expect(scoreLearningValue(matching, state, NOW).components.goal_role_industry_fit)
      .toBeGreaterThan(scoreLearningValue(nonMatching, state, NOW).components.goal_role_industry_fit);
  });

  it('is neutral (0.5) when the learner has no goal/role/industry signal at all', () => {
    const state = learnerState([]);
    const c = candidate({ ...withImpact('system_design') });
    expect(scoreLearningValue(c, state, NOW).components.goal_role_industry_fit).toBe(0.5);
  });
});

describe('scoreLearningValue — freshness/field importance', () => {
  it('AI Pulse types score higher on freshness than evergreen curriculum types', () => {
    const state = learnerState([]);
    const pulse = scoreLearningValue(candidate({ type: 'ai_news_flash' }), state, NOW).components.freshness_field_importance;
    const evergreen = scoreLearningValue(candidate({ type: 'implementation_task' }), state, NOW).components.freshness_field_importance;
    expect(pulse).toBeGreaterThan(evergreen);
  });
});

describe('scoreLearningValue — live/community urgency', () => {
  it('live_class scores higher on urgency than a static content type', () => {
    const state = learnerState([]);
    const live = scoreLearningValue(candidate({ type: 'live_class' }), state, NOW).components.live_community_urgency;
    const staticType = scoreLearningValue(candidate({ type: 'blog' }), state, NOW).components.live_community_urgency;
    expect(live).toBeGreaterThan(staticType);
  });
});

describe('scoreLearningValue — mismatch penalty', () => {
  it('penalizes and cites a reason when the learner is well below the recommended_range minimum', () => {
    const state = learnerState([skillState({ skill_id: 'rag', placement: 0 })]);
    const c = candidate({
      skill_mapping: { ...EMPTY_CONTRACT, skill_impacts: [{ skill_id: 'rag', weight: 1, bands: ['application'], credit_strength: 'high', evidence_required: true, max_credit: 20 }], recommended_range: { min: 80, max: 100 } },
    });
    const result = scoreLearningValue(c, state, NOW);
    expect(result.components.mismatch_penalty).toBeGreaterThan(0);
    expect(result.reasons).toContain('below your current readiness for this item');
  });
});
