/**
 * CAPE Phase 4 safety-invariant + boundary test suite (design doc §7, §12,
 * §15, §17 — consolidated per this run's plan.md T010). Each invariant below
 * is a separate, unmissable, named test citing the design-doc section it
 * enforces — matching the existing repo convention in
 * `capePlacementService.test.ts`.
 *
 * NOTE on §17 AC 6 ("a validated Classroom lab grows mapped skills materially
 * faster than a Timeline reading"): already covered by Phase 3's
 * `capeSkillCreditSpeed.test.ts` — not duplicated here, since that assertion
 * is about the EVIDENCE credit-speed model (unrelated to Phase 4's ranker)
 * and adding a second copy would just be redundant, not more rigorous.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { filterEligible } from '../capeEligibilityFilter';
import { scoreLearningValue } from '../capeLearningValueScorer';
import { applyPolicyRerank } from '../capeLearningValuePolicy';
import { EMPTY_CONTRACT, type LearningValueCandidate } from '../capeCandidateFeatureService';
import type { LearnerState, LearnerSkillState } from '../capeLearnerStateService';
import { DEFAULT_FEED_POLICY } from '../../timeline/feedConfigService';

const NOW = new Date('2026-08-03T00:00:00.000Z');

function skillState(overrides: Partial<LearnerSkillState> & { skill_id: string }): LearnerSkillState {
  return {
    name: overrides.skill_id, axis_order: 0, placement: 0, claim: 0, knowledge: 0, application: 0,
    judgment: 0, proficiency: 0, confidence: 0, next_review_at: null, evidence_balance_ratio: 1,
    ...overrides,
  };
}

function learnerState(skills: LearnerSkillState[] = [], overrides: Partial<LearnerState> = {}): LearnerState {
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

const RANKER_MODULE_FILES = [
  'capeLearnerStateService.ts',
  'capeCandidateFeatureService.ts',
  'capeEligibilityFilter.ts',
  'capeLearningValueScorer.ts',
  'capeLearningValuePolicy.ts',
  'capeLearningValueRanker.ts',
];

function readRankerModuleSource(filename: string): string {
  return readFileSync(join(__dirname, '..', filename), 'utf-8');
}

describe('SAFETY INVARIANT (design doc §17 AC 7, §15): click/dwell/open/streak never produce Architecture Skill evidence', () => {
  it('none of the 6 CAPE Phase 4 ranker modules import the evidence-write path (capeEvidenceLedgerService / capeTimelineEvidenceBridge) — a static, unmissable guarantee that ranking a feed can never itself create skill credit', () => {
    for (const file of RANKER_MODULE_FILES) {
      const src = readRankerModuleSource(file);
      expect(src).not.toMatch(/capeEvidenceLedgerService/);
      expect(src).not.toMatch(/capeTimelineEvidenceBridge/);
      expect(src).not.toMatch(/StudentSkillEvidence/); // the append-only evidence model itself
    }
  });

  it('runtime corollary: filtering, scoring, and reranking a candidate list never mutates the learnerState object passed in — no in-place evidence-like side effect is even structurally possible', () => {
    const learner = learnerState([skillState({ skill_id: 'rag', proficiency: 10 })]);
    const snapshot = JSON.parse(JSON.stringify(learner));
    const cands = [candidate({ ref: 'a', skill_mapping: { ...EMPTY_CONTRACT, skill_impacts: [{ skill_id: 'rag', weight: 1, bands: ['knowledge'], credit_strength: 'medium', evidence_required: false, max_credit: 10 }] } })];
    const { eligible } = filterEligible(cands, learner);
    const scored = eligible.map((c) => ({ ...c, ...scoreLearningValue(c, learner, NOW) }));
    applyPolicyRerank(scored, learner, DEFAULT_FEED_POLICY, NOW);
    expect(JSON.parse(JSON.stringify(learner))).toEqual(snapshot);
  });
});

describe('SAFETY INVARIANT (design doc §17 AC 12): Points, Learning XP, Builder XP, Community XP, Architecture Skills, and promotion stay distinct and auditable', () => {
  it('none of the 6 CAPE Phase 4 ranker modules import any points/XP/promotion write-path service', () => {
    const forbidden = /awardPoints|pointsService|xpService|promotionService|progressionService|EvidenceRecord\b/;
    for (const file of RANKER_MODULE_FILES) {
      expect(readRankerModuleSource(file)).not.toMatch(forbidden);
    }
  });
});

describe('BOUNDARY: zero-candidate learner (empty input list)', () => {
  it('filterEligible returns empty eligible/excluded without error', () => {
    const result = filterEligible([], learnerState());
    expect(result).toEqual({ eligible: [], excluded: [] });
  });

  it('applyPolicyRerank returns [] for an empty scored list', () => {
    expect(applyPolicyRerank([], learnerState(), DEFAULT_FEED_POLICY, NOW)).toEqual([]);
  });
});

describe('BOUNDARY (design doc §5, §15): brand-new learner with no evidence at all ("no resume never lowers status or access")', () => {
  const NEW_LEARNER = learnerState([]); // zero skill rows, no resume, no diagnostic

  it('every stage produces valid, non-NaN, non-negative output for a zero-credit and a skill-tagged candidate alike', () => {
    const candidates = [
      candidate({ ref: 'zero-credit' }),
      candidate({ ref: 'tagged', skill_mapping: { ...EMPTY_CONTRACT, skill_impacts: [{ skill_id: 'llm_core', weight: 1, bands: ['knowledge'], credit_strength: 'low', evidence_required: false, max_credit: 5 }] } }),
    ];
    const { eligible, excluded } = filterEligible(candidates, NEW_LEARNER);
    expect(eligible).toHaveLength(2); // neither candidate declares a prerequisite, so both remain eligible
    expect(excluded).toHaveLength(0);

    for (const c of eligible) {
      const result = scoreLearningValue(c, NEW_LEARNER, NOW);
      expect(Number.isNaN(result.score)).toBe(false);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }

    const scored = eligible.map((c) => ({ ...c, ...scoreLearningValue(c, NEW_LEARNER, NOW) }));
    const ranked = applyPolicyRerank(scored, NEW_LEARNER, DEFAULT_FEED_POLICY, NOW);
    expect(ranked).toHaveLength(2);
  });

  it('a candidate WITH a real prerequisite is excluded (fails safe) for the zero-placement new learner, not silently let through', () => {
    const gated = candidate({ ref: 'gated', skill_mapping: { ...EMPTY_CONTRACT, prerequisite_skills: [{ skill_id: 'agents_mcp', min_placement: 20 }] } });
    const { eligible, excluded } = filterEligible([gated], NEW_LEARNER);
    expect(eligible).toHaveLength(0);
    expect(excluded).toEqual([{ ref: 'gated', reason: 'requires agents_mcp placement >= 20 (learner at 0)' }]);
  });
});

describe('BOUNDARY (design doc §9 Stage 2, §15): a learner failing EVERY eligibility check', () => {
  it('produces an empty eligible list with a populated, per-candidate exclusion reason for each — never a fallback that bypasses the filter', () => {
    const candidates = [
      candidate({ ref: 'a', skill_mapping: { ...EMPTY_CONTRACT, prerequisite_skills: [{ skill_id: 'rag', min_placement: 50 }] } }),
      candidate({ ref: 'b', skill_mapping: { ...EMPTY_CONTRACT, prerequisite_skills: [{ skill_id: 'agents_mcp', min_placement: 80 }] } }),
      candidate({ ref: 'c', skill_mapping: { ...EMPTY_CONTRACT, prerequisite_skills: [{ skill_id: 'system_design', min_placement: 30 }] } }),
    ];
    const strugglingLearner = learnerState([
      skillState({ skill_id: 'rag', placement: 5 }),
      skillState({ skill_id: 'agents_mcp', placement: 10 }),
      skillState({ skill_id: 'system_design', placement: 0 }),
    ]);

    const { eligible, excluded } = filterEligible(candidates, strugglingLearner);

    expect(eligible).toEqual([]);
    expect(excluded).toHaveLength(3);
    for (const e of excluded) {
      expect(typeof e.reason).toBe('string');
      expect(e.reason.length).toBeGreaterThan(0);
    }
    // downstream stages given an all-excluded, empty eligible list produce a
    // valid empty result rather than erroring — the whole pipeline degrades
    // gracefully, matching capeLearningValueRanker.ts's own documented
    // "zero eligible candidates" boundary contract.
    expect(applyPolicyRerank([], strugglingLearner, DEFAULT_FEED_POLICY, NOW)).toEqual([]);
  });
});
