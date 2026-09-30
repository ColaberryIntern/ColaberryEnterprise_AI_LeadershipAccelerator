/**
 * Isolated flag-ON test for CAPE Phase 6's governance-policy (RerankCaps) wiring
 * into capeLearningValueRanker.ts. A SEPARATE file from
 * capeLearningValueRanker.test.ts (which fixes env.feedControlEnabled=false for its
 * whole suite) — same convention as
 * backend/src/services/timeline/__tests__/feedControlService.simulateCapeFlagOn.test.ts,
 * whose header comment documents WHY: per-test jest.isolateModulesAsync fights
 * Jest's mock-hoisting order, so a whole-file mock with env.feedControlEnabled=true
 * is the reliable pattern for exercising the flag-on branch.
 */
jest.mock('../capeLearnerStateService', () => ({ getLearnerState: jest.fn() }));
jest.mock('../capeCandidateFeatureService', () => ({ enrichCandidates: jest.fn() }));
jest.mock('../capeEligibilityFilter', () => ({ filterEligible: jest.fn() }));
jest.mock('../capeLearningValueScorer', () => ({ scoreLearningValue: jest.fn() }));
jest.mock('../capeLearningValuePolicy', () => ({
  applyPolicyRerank: jest.fn(),
  DEFAULT_RERANK_CAPS: { sameTypeMaxStreak: 2, passiveMaxStreak: 2, crowdOutMaxPerSkill: 2, crowdOutWindow: 5, stretchCapFirstFive: 1 },
}));
jest.mock('../capeGovernancePolicyService', () => ({ getCurrentGovernancePolicy: jest.fn() }));
jest.mock('../../../config/env', () => ({ env: { feedControlEnabled: true } }));
jest.mock('../../timeline/feedConfigService', () => ({
  getFeedPolicy: jest.fn().mockResolvedValue({ todayCadence: 2, ambientProviders: [], defaultFrequencyCap: 0, defaultCooldownDays: 0, recencyHalfLifeDays: 21, explorationPct: 0.15, priorityWeight: 0.02 }),
  DEFAULT_FEED_POLICY: { todayCadence: 2, ambientProviders: [], defaultFrequencyCap: 0, defaultCooldownDays: 0, recencyHalfLifeDays: 21, explorationPct: 0.15, priorityWeight: 0.02 },
}));

import { rankLearningValue } from '../capeLearningValueRanker';
import { getLearnerState } from '../capeLearnerStateService';
import { enrichCandidates } from '../capeCandidateFeatureService';
import { filterEligible } from '../capeEligibilityFilter';
import { scoreLearningValue } from '../capeLearningValueScorer';
import { applyPolicyRerank } from '../capeLearningValuePolicy';
import { getCurrentGovernancePolicy } from '../capeGovernancePolicyService';
import type { TodayFeedItem } from '../../timeline/todayFeedComposer';

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
  mockEnrich.mockResolvedValue([mkItem('a')]);
  mockFilter.mockReturnValue({ eligible: [mkItem('a') as any], excluded: [] });
  mockScore.mockReturnValue({ score: 0.5, components: {}, reasons: [] });
  mockPolicy.mockImplementation((scored: any) => scored);
});

describe('rankLearningValue — governance policy fetched and mapped correctly when env.feedControlEnabled is true', () => {
  it('calls getCurrentGovernancePolicy and maps its snake_case fields to RerankCaps camelCase fields exactly', async () => {
    mockGovernancePolicy.mockResolvedValue({
      same_type_max_streak: 3, passive_max_streak: 4, crowd_out_max_per_skill: 5,
      crowd_out_window: 7, stretch_cap_first_five: 2,
      daily_plan_target_minutes: 30, review_slot_share: 0, ai_pulse_slot_share: 1,
    });

    await rankLearningValue('enr-1', [mkItem('a')], NOW);

    expect(mockGovernancePolicy).toHaveBeenCalledTimes(1);
    expect(mockPolicy).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(),
      { sameTypeMaxStreak: 3, passiveMaxStreak: 4, crowdOutMaxPerSkill: 5, crowdOutWindow: 7, stretchCapFirstFive: 2 },
    );
  });

  it('a non-default governance policy measurably changes what gets passed to Stage 4 (proves the wiring is real, not decorative)', async () => {
    mockGovernancePolicy.mockResolvedValue({
      same_type_max_streak: 99, passive_max_streak: 99, crowd_out_max_per_skill: 99,
      crowd_out_window: 99, stretch_cap_first_five: 99,
      daily_plan_target_minutes: 999, review_slot_share: 1, ai_pulse_slot_share: 1,
    });

    await rankLearningValue('enr-1', [mkItem('a')], NOW);

    const capsArg = mockPolicy.mock.calls[0][4];
    expect(capsArg).not.toEqual({ sameTypeMaxStreak: 2, passiveMaxStreak: 2, crowdOutMaxPerSkill: 2, crowdOutWindow: 5, stretchCapFirstFive: 1 });
    expect(capsArg.sameTypeMaxStreak).toBe(99);
  });
});
