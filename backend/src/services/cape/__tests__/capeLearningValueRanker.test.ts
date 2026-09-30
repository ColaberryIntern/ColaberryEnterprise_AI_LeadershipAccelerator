import { rankLearningValue, CAPE_RANKER_POLICY_VERSION } from '../capeLearningValueRanker';
import { getLearnerState } from '../capeLearnerStateService';
import { enrichCandidates } from '../capeCandidateFeatureService';
import { filterEligible } from '../capeEligibilityFilter';
import { scoreLearningValue } from '../capeLearningValueScorer';
import { applyPolicyRerank } from '../capeLearningValuePolicy';
import { getCurrentGovernancePolicy } from '../capeGovernancePolicyService';
import type { TodayFeedItem } from '../../timeline/todayFeedComposer';

jest.mock('../capeLearnerStateService', () => ({ getLearnerState: jest.fn() }));
jest.mock('../capeCandidateFeatureService', () => ({ enrichCandidates: jest.fn() }));
jest.mock('../capeEligibilityFilter', () => ({ filterEligible: jest.fn() }));
jest.mock('../capeLearningValueScorer', () => ({ scoreLearningValue: jest.fn() }));
jest.mock('../capeLearningValuePolicy', () => ({
  applyPolicyRerank: jest.fn(),
  DEFAULT_RERANK_CAPS: { sameTypeMaxStreak: 2, passiveMaxStreak: 2, crowdOutMaxPerSkill: 2, crowdOutWindow: 5, stretchCapFirstFive: 1 },
}));
// CAPE Phase 6: capeLearningValueRanker.ts now imports capeGovernancePolicyService,
// which imports the real ../../config/database (a live Sequelize instantiation at
// module load time). Mocked at this direct-import boundary (not the transitive
// config/database boundary) to match this file's existing per-dependency mocking
// convention — and because env.feedControlEnabled is false in every test below, the
// ranker never actually calls this function; it only needs to exist so the module
// graph loads without touching a real DB connection string.
jest.mock('../capeGovernancePolicyService', () => ({ getCurrentGovernancePolicy: jest.fn() }));
jest.mock('../../../config/env', () => ({ env: { feedControlEnabled: false } }));
jest.mock('../../timeline/feedConfigService', () => ({
  getFeedPolicy: jest.fn(),
  DEFAULT_FEED_POLICY: { todayCadence: 2, ambientProviders: [], defaultFrequencyCap: 0, defaultCooldownDays: 0, recencyHalfLifeDays: 21, explorationPct: 0.15, priorityWeight: 0.02 },
}));

const mockGetLearnerState = getLearnerState as unknown as jest.Mock;
const mockEnrich = enrichCandidates as unknown as jest.Mock;
const mockFilter = filterEligible as unknown as jest.Mock;
const mockScore = scoreLearningValue as unknown as jest.Mock;
const mockPolicy = applyPolicyRerank as unknown as jest.Mock;
const mockGovernancePolicy = getCurrentGovernancePolicy as unknown as jest.Mock;

const NOW = new Date('2026-08-03T00:00:00.000Z');
const LEARNER_STATE = { enrollment_id: 'enr-1', skills: [], overall_placement: 0, overall_proficiency: 0, goal: null, role: null, industry: null, has_resume: false, recent_failure: false, learner_state_version: '2026-08-01T00:00:00.000Z' };

function mkItem(ref: string): TodayFeedItem {
  return { position: 0, kind: 'anchored', ref, surface: 'today', type: 'implementation_task', render_band: 'task', card_id: `card-${ref}`, title: ref, subtitle: null, description: null, image: null, video: null, blog: null, content: null, week: 1, estimated_time: 15, status: null, interacted: false };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLearnerState.mockResolvedValue(LEARNER_STATE);
});

describe('rankLearningValue — happy path', () => {
  it('composes all 5 stages and returns candidates in final ranked order, each carrying rank_score/reasons/policy_version/learner_state_version', async () => {
    const rawCandidates = [mkItem('a'), mkItem('b')];
    const enriched = rawCandidates.map((c) => ({ ...c, skill_mapping: { skill_impacts: [], prerequisite_skills: [], recommended_range: { min: 0, max: 0 }, freshness_days: null, reviewable: true } }));
    mockEnrich.mockResolvedValue(enriched);
    mockFilter.mockReturnValue({ eligible: enriched, excluded: [] });
    mockScore.mockImplementation((c: any) => ({ score: c.ref === 'a' ? 0.9 : 0.5, components: {}, reasons: ['general fit'] }));
    const scoredExpected = enriched.map((c) => ({ ...c, ...mockScore(c) }));
    mockPolicy.mockReturnValue([scoredExpected[1], scoredExpected[0]]); // policy reorders: b before a

    const result = await rankLearningValue('enr-1', rawCandidates, NOW);

    expect(result.items.map((i) => i.ref)).toEqual(['b', 'a']);
    // rank_score must be the REAL score this candidate's own scoreLearningValue
    // mock returned (not just "a number") — a regression that hardcodes/mangles
    // the value would slip past a type-only check.
    expect(result.items.find((i) => i.ref === 'a')?.rank_score).toBe(0.9);
    expect(result.items.find((i) => i.ref === 'b')?.rank_score).toBe(0.5);
    for (const item of result.items) {
      expect(typeof item.rank_score).toBe('number');
      expect(Array.isArray(item.reasons)).toBe(true);
      expect(item.policy_version).toBe(CAPE_RANKER_POLICY_VERSION);
      expect(item.learner_state_version).toBe(LEARNER_STATE.learner_state_version);
    }
    expect(mockGetLearnerState).toHaveBeenCalledWith('enr-1');
    expect(mockEnrich).toHaveBeenCalledWith(rawCandidates);
  });
});

describe('rankLearningValue — boundary: empty input', () => {
  it('returns items: [] without calling enrich/filter/score/policy, not a throw', async () => {
    const result = await rankLearningValue('enr-1', [], NOW);
    expect(result.items).toEqual([]);
    expect(result.excluded).toEqual([]);
    expect(mockEnrich).not.toHaveBeenCalled();
  });
});

describe('rankLearningValue — boundary: zero eligible candidates after filtering', () => {
  it('returns items: [] but surfaces the exclusion reasons, not a throw', async () => {
    mockEnrich.mockResolvedValue([mkItem('gated')]);
    mockFilter.mockReturnValue({ eligible: [], excluded: [{ ref: 'gated', reason: 'requires x placement >= 50 (learner at 0)' }] });

    const result = await rankLearningValue('enr-1', [mkItem('gated')], NOW);

    expect(result.items).toEqual([]);
    expect(result.excluded).toEqual([{ ref: 'gated', reason: 'requires x placement >= 50 (learner at 0)' }]);
    expect(mockScore).not.toHaveBeenCalled();
    expect(mockPolicy).not.toHaveBeenCalled();
  });
});

describe('rankLearningValue — failure path', () => {
  it('propagates a learner-state read failure rather than swallowing it (matches capeLearnerStateService\'s fail-hard contract)', async () => {
    mockGetLearnerState.mockRejectedValue(new Error('CapeLearnerStateError: ledger unavailable'));
    await expect(rankLearningValue('enr-1', [mkItem('a')], NOW)).rejects.toThrow('ledger unavailable');
  });
});

describe('rankLearningValue — feed policy source', () => {
  it('uses DEFAULT_FEED_POLICY (not getFeedPolicy) when env.feedControlEnabled is false', async () => {
    const { getFeedPolicy } = require('../../timeline/feedConfigService');
    mockEnrich.mockResolvedValue([mkItem('a')]);
    mockFilter.mockReturnValue({ eligible: [mkItem('a') as any], excluded: [] });
    mockScore.mockReturnValue({ score: 0.5, components: {}, reasons: [] });
    mockPolicy.mockImplementation((scored: any) => scored);

    await rankLearningValue('enr-1', [mkItem('a')], NOW);
    expect(getFeedPolicy).not.toHaveBeenCalled();
  });
});

describe('rankLearningValue — CAPE Phase 6 governance-policy (RerankCaps) source', () => {
  it('does NOT call getCurrentGovernancePolicy when env.feedControlEnabled is false, and passes DEFAULT_RERANK_CAPS through to applyPolicyRerank', async () => {
    mockEnrich.mockResolvedValue([mkItem('a')]);
    mockFilter.mockReturnValue({ eligible: [mkItem('a') as any], excluded: [] });
    mockScore.mockReturnValue({ score: 0.5, components: {}, reasons: [] });
    mockPolicy.mockImplementation((scored: any) => scored);

    await rankLearningValue('enr-1', [mkItem('a')], NOW);

    expect(mockGovernancePolicy).not.toHaveBeenCalled();
    // 5th argument to applyPolicyRerank is the caps object — must be the
    // byte-identical default, proving flag-off behavior is unchanged.
    expect(mockPolicy).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(),
      { sameTypeMaxStreak: 2, passiveMaxStreak: 2, crowdOutMaxPerSkill: 2, crowdOutWindow: 5, stretchCapFirstFive: 1 },
    );
  });
});
