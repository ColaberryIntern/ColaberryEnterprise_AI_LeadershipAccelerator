import { applyPolicyRerank, DEFAULT_RERANK_CAPS, type RankedLearningValueItem, type RerankCaps } from '../capeLearningValuePolicy';
import { EMPTY_CONTRACT, type LearningValueCandidate } from '../capeCandidateFeatureService';
import type { LearnerState, LearnerSkillState } from '../capeLearnerStateService';
import { DEFAULT_FEED_POLICY, type FeedPolicy } from '../../timeline/feedConfigService';

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

function ranked(overrides: Partial<RankedLearningValueItem> & { ref: string; score: number }): RankedLearningValueItem {
  const skillId = overrides.skill_mapping?.skill_impacts?.[0]?.skill_id;
  return {
    position: 0, kind: 'anchored', surface: 'today', type: 'implementation_task', render_band: 'task',
    card_id: `card-${overrides.ref}`, title: overrides.ref, subtitle: null, description: null, image: null,
    video: null, blog: null, content: null, week: 5, estimated_time: 15, status: null, interacted: false,
    skill_mapping: EMPTY_CONTRACT,
    components: {}, reasons: [],
    ...overrides,
  } as RankedLearningValueItem;
}

function withSkill(skillId: string, min = 0, max = 100) {
  return {
    skill_mapping: {
      ...EMPTY_CONTRACT,
      skill_impacts: [{ skill_id: skillId, weight: 1, bands: ['application' as const], credit_strength: 'medium' as const, evidence_required: false, max_credit: 20 }],
      recommended_range: { min, max },
    },
  };
}

const NO_EXPLORATION_POLICY: FeedPolicy = { ...DEFAULT_FEED_POLICY, explorationPct: 0 };

describe('applyPolicyRerank — §17 AC 8: first five respect diversity/passive-active/stretch limits', () => {
  it('synthetic fixture: 8 candidates, diverse types/skills, no recent failure', () => {
    const scored: RankedLearningValueItem[] = [
      ranked({ ref: 'lesson1', type: 'video', score: 0.95, ...withSkill('rag') }),
      ranked({ ref: 'lesson2', type: 'video', score: 0.94, ...withSkill('rag') }),
      ranked({ ref: 'lesson3', type: 'video', score: 0.93, ...withSkill('vectors') }),
      ranked({ ref: 'check1', type: 'knowledge_check', score: 0.5, ...withSkill('rag') }),
      ranked({ ref: 'lab1', type: 'implementation_task', score: 0.9, ...withSkill('agents_mcp') }),
      ranked({ ref: 'blog1', type: 'blog', score: 0.4, ...withSkill('governance') }),
      ranked({ ref: 'article1', type: 'deep_dive', score: 0.35, ...withSkill('llm_core') }),
      ranked({ ref: 'lab2', type: 'implementation_task', score: 0.3, ...withSkill('system_design') }),
    ];
    const state = learnerState([], { recent_failure: false });
    const out = applyPolicyRerank(scored, state, NO_EXPLORATION_POLICY, NOW);

    // Never drops or duplicates a candidate.
    expect(out.map((c) => c.ref).sort()).toEqual(scored.map((c) => c.ref).sort());

    // No more than 2 same-type consecutive, anywhere in the output.
    for (let i = 0; i < out.length - 2; i++) {
      const sameRun = out[i].type === out[i + 1].type && out[i + 1].type === out[i + 2].type;
      expect(sameRun).toBe(false);
    }

    // First 5: no skill appears more than twice.
    const first5 = out.slice(0, 5);
    const skillCounts = new Map<string, number>();
    for (const c of first5) {
      const id = c.skill_mapping.skill_impacts[0]?.skill_id;
      if (id) skillCounts.set(id, (skillCounts.get(id) ?? 0) + 1);
    }
    for (const count of skillCounts.values()) expect(count).toBeLessThanOrEqual(2);
  });

  it('caps passive items at 2 before an active (check/reflection/action) item appears', () => {
    const scored: RankedLearningValueItem[] = [
      ranked({ ref: 'v1', type: 'video', score: 0.9 }),
      ranked({ ref: 'v2', type: 'blog', score: 0.89 }),
      ranked({ ref: 'v3', type: 'podcast', score: 0.88 }),
      ranked({ ref: 'check', type: 'knowledge_check', score: 0.1 }),
    ];
    const out = applyPolicyRerank(scored, learnerState(), NO_EXPLORATION_POLICY, NOW);
    // Within the first 3 positions, an active item must appear (can't stack 3 passive in a row).
    const first3Types = out.slice(0, 3).map((c) => c.type);
    expect(first3Types.includes('knowledge_check')).toBe(true);
  });

  it('limits stretch items to 1 in the first 5 after a recent failure', () => {
    // 7 total candidates (2 stretch + 5 non-stretch) so the cap is satisfiable
    // without dropping anything — with only 5 total items and 2 must-include
    // stretch items, "max 1 in the first 5" and "never drop a candidate" would
    // be mathematically unsatisfiable at once (the second stretch item would
    // have nowhere else to go), so this fixture deliberately gives it room to
    // land at position 5+ instead.
    const scored: RankedLearningValueItem[] = [
      ranked({ ref: 'stretch1', type: 'implementation_task', score: 0.95, ...withSkill('rag', 80, 100) }),
      ranked({ ref: 'stretch2', type: 'project_task', score: 0.9, ...withSkill('vectors', 80, 100) }),
      ranked({ ref: 'easy1', type: 'video', score: 0.5, ...withSkill('llm_core', 0, 20) }),
      ranked({ ref: 'easy2', type: 'blog', score: 0.4, ...withSkill('governance', 0, 20) }),
      ranked({ ref: 'easy3', type: 'knowledge_check', score: 0.3, ...withSkill('prompting', 0, 20) }),
      ranked({ ref: 'easy4', type: 'podcast', score: 0.2, ...withSkill('context_engineering', 0, 20) }),
      ranked({ ref: 'easy5', type: 'survey', score: 0.1, ...withSkill('eval_guardrails', 0, 20) }),
    ];
    const state = learnerState([], { recent_failure: true }); // all skills at placement 0 -> both stretch1/stretch2 are stretch items
    const out = applyPolicyRerank(scored, state, NO_EXPLORATION_POLICY, NOW);
    expect(out).toHaveLength(7);
    expect(out.map((c) => c.ref).sort()).toEqual(scored.map((c) => c.ref).sort()); // nothing dropped
    const stretchRefsInFirst5 = out.slice(0, 5).filter((c) => ['stretch1', 'stretch2'].includes(c.ref));
    expect(stretchRefsInFirst5.length).toBeLessThanOrEqual(1);
    // and the deferred stretch item still appears somewhere (position 5 or 6).
    expect(out.map((c) => c.ref)).toContain('stretch2');
  });
});

describe('applyPolicyRerank — stretch definition covers BOTH directions (below min AND above max)', () => {
  it('an item the learner has already outgrown (well above recommended_range.max) also counts as a stretch item for the first-5 cap', () => {
    const scored: RankedLearningValueItem[] = [
      ranked({ ref: 'outgrown1', type: 'implementation_task', score: 0.95, ...withSkill('rag', 0, 10) }),
      ranked({ ref: 'outgrown2', type: 'project_task', score: 0.9, ...withSkill('vectors', 0, 10) }),
      // range (0,20) with default placement 0 sits INSIDE the range (not below
      // min, since min=0) and not above max(20) — genuinely non-stretch, unlike
      // the outgrown1/outgrown2 items above whose learner placement (90) sits
      // above their range's max(10).
      ranked({ ref: 'ok1', type: 'video', score: 0.5, ...withSkill('llm_core', 0, 20) }),
      ranked({ ref: 'ok2', type: 'blog', score: 0.4, ...withSkill('governance', 0, 20) }),
      ranked({ ref: 'ok3', type: 'knowledge_check', score: 0.3, ...withSkill('prompting', 0, 20) }),
      ranked({ ref: 'ok4', type: 'podcast', score: 0.2, ...withSkill('context_engineering', 0, 20) }),
      ranked({ ref: 'ok5', type: 'survey', score: 0.1, ...withSkill('eval_guardrails', 0, 20) }),
    ];
    // learner placement is 0 for every skill except this scenario needs the
    // learner to be ABOVE range.max (0..10) for outgrown1/outgrown2 — placement
    // comes from learnerState.skills, default 0 for unknown skills, so give the
    // learner explicit high placement on rag/vectors only.
    const state = learnerState([
      { name: 'rag', axis_order: 0, placement: 90, claim: 0, knowledge: 0, application: 0, judgment: 0, proficiency: 0, confidence: 0, next_review_at: null, evidence_balance_ratio: 1, skill_id: 'rag' },
      { name: 'vectors', axis_order: 0, placement: 90, claim: 0, knowledge: 0, application: 0, judgment: 0, proficiency: 0, confidence: 0, next_review_at: null, evidence_balance_ratio: 1, skill_id: 'vectors' },
    ], { recent_failure: true });
    const out = applyPolicyRerank(scored, state, NO_EXPLORATION_POLICY, NOW);
    expect(out).toHaveLength(7);
    const outgrownInFirst5 = out.slice(0, 5).filter((c) => ['outgrown1', 'outgrown2'].includes(c.ref));
    expect(outgrownInFirst5.length).toBeLessThanOrEqual(1);
  });
});

describe('applyPolicyRerank — boundary: fewer than 5 total candidates', () => {
  it('applies without index errors and returns all candidates', () => {
    const scored: RankedLearningValueItem[] = [
      ranked({ ref: 'a', score: 0.9 }),
      ranked({ ref: 'b', score: 0.5 }),
    ];
    const out = applyPolicyRerank(scored, learnerState(), NO_EXPLORATION_POLICY, NOW);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.ref).sort()).toEqual(['a', 'b']);
  });

  it('handles a single candidate', () => {
    const out = applyPolicyRerank([ranked({ ref: 'only', score: 0.5 })], learnerState(), NO_EXPLORATION_POLICY, NOW);
    expect(out).toHaveLength(1);
  });

  it('handles zero candidates', () => {
    expect(applyPolicyRerank([], learnerState(), NO_EXPLORATION_POLICY, NOW)).toEqual([]);
  });
});

describe('applyPolicyRerank — boundary: all candidates same type', () => {
  it('degrades gracefully (no infinite loop, no dropped items) when diversity is impossible', () => {
    const scored: RankedLearningValueItem[] = Array.from({ length: 6 }, (_, i) =>
      ranked({ ref: `v${i}`, type: 'video', score: 1 - i * 0.1 }));
    const out = applyPolicyRerank(scored, learnerState(), NO_EXPLORATION_POLICY, NOW);
    expect(out).toHaveLength(6);
    expect(out.map((c) => c.ref).sort()).toEqual(scored.map((c) => c.ref).sort());
  });
});

describe('applyPolicyRerank — urgent preservation', () => {
  it('a low-score urgent (live_class) item is pulled toward the front ahead of higher-scored non-urgent items', () => {
    const scored: RankedLearningValueItem[] = [
      ranked({ ref: 'top-content', type: 'implementation_task', score: 0.95 }),
      ranked({ ref: 'live-session', type: 'live_class', score: 0.1 }),
      ranked({ ref: 'mid-content', type: 'video', score: 0.5 }),
    ];
    const out = applyPolicyRerank(scored, learnerState(), NO_EXPLORATION_POLICY, NOW);
    const liveIdx = out.findIndex((c) => c.ref === 'live-session');
    const midIdx = out.findIndex((c) => c.ref === 'mid-content');
    expect(liveIdx).toBeLessThan(midIdx);
  });
});

describe('applyPolicyRerank — spaced review pull-forward', () => {
  it('a candidate touching a skill whose next_review_at is overdue is pulled ahead of a higher-scored non-review item', () => {
    const scored: RankedLearningValueItem[] = [
      ranked({ ref: 'fresh-topic', type: 'video', score: 0.9, ...withSkill('vectors') }),
      ranked({ ref: 'review-due', type: 'video', score: 0.2, ...withSkill('rag') }),
    ];
    const state = learnerState([skillState({ skill_id: 'rag', next_review_at: '2026-07-01T00:00:00.000Z' })]);
    const out = applyPolicyRerank(scored, state, NO_EXPLORATION_POLICY, NOW);
    expect(out[0].ref).toBe('review-due');
  });
});

describe('applyPolicyRerank — exploration reserve', () => {
  it('with explorationPct effectively disabled (0), the order is pure caps-respecting greedy-by-score (no forced exploration pulls)', () => {
    const scored: RankedLearningValueItem[] = [
      ranked({ ref: 'a', type: 'video', score: 0.9 }),
      ranked({ ref: 'b', type: 'blog', score: 0.1 }),
    ];
    const out = applyPolicyRerank(scored, learnerState(), { ...DEFAULT_FEED_POLICY, explorationPct: 0 }, NOW);
    expect(out.map((c) => c.ref)).toEqual(['a', 'b']);
  });

  it('reuses the existing feedConfigService default (0.15), not an invented number', () => {
    expect(DEFAULT_FEED_POLICY.explorationPct).toBe(0.15);
  });
});

describe('applyPolicyRerank — CAPE Phase 6: RerankCaps parametrization', () => {
  // 4 passive-type items (video is NOT in ACTIVE_TYPES) + 1 ACTIVE-type disruptor
  // (knowledge_check IS in ACTIVE_TYPES) — deliberately using an active disruptor
  // rather than a second passive type, since 2 passive items already saturate
  // the DEFAULT passiveMaxStreak (2) regardless of same-type streak, which would
  // make a same-type-only relaxation invisible in the output.
  const fourVideosOneCheck: RankedLearningValueItem[] = [
    ranked({ ref: 'v1', type: 'video', score: 0.95 }),
    ranked({ ref: 'v2', type: 'video', score: 0.90 }),
    ranked({ ref: 'v3', type: 'video', score: 0.85 }),
    ranked({ ref: 'v4', type: 'video', score: 0.80 }),
    ranked({ ref: 'check1', type: 'knowledge_check', score: 0.50 }),
  ];

  it('omitting the 5th argument entirely reproduces the exact same order as explicitly passing DEFAULT_RERANK_CAPS (backward-compat identity)', () => {
    const withoutArg = applyPolicyRerank(fourVideosOneCheck, learnerState(), NO_EXPLORATION_POLICY, NOW);
    const withExplicitDefault = applyPolicyRerank(fourVideosOneCheck, learnerState(), NO_EXPLORATION_POLICY, NOW, DEFAULT_RERANK_CAPS);
    expect(withoutArg.map((c) => c.ref)).toEqual(withExplicitDefault.map((c) => c.ref));
  });

  it('default caps (sameTypeMaxStreak=2, passiveMaxStreak=2) break the passive video streak after 2 items, pulling the active check item forward to position 2', () => {
    const out = applyPolicyRerank(fourVideosOneCheck, learnerState(), NO_EXPLORATION_POLICY, NOW);
    expect(out.map((c) => c.ref)).toEqual(['v1', 'v2', 'check1', 'v3', 'v4']);
  });

  it('relaxed sameTypeMaxStreak+passiveMaxStreak (raised via caps) allows pure score order with no forced diversity break — proves the wiring is real, not decorative', () => {
    const relaxedCaps: RerankCaps = { ...DEFAULT_RERANK_CAPS, sameTypeMaxStreak: 10, passiveMaxStreak: 10 };
    const out = applyPolicyRerank(fourVideosOneCheck, learnerState(), NO_EXPLORATION_POLICY, NOW, relaxedCaps);
    expect(out.map((c) => c.ref)).toEqual(['v1', 'v2', 'v3', 'v4', 'check1']);
  });

  it('a tightened crowdOutWindow/crowdOutMaxPerSkill measurably changes which items land in the first 5 positions vs the default', () => {
    const sameSkillFive: RankedLearningValueItem[] = [
      ranked({ ref: 's1', type: 'video', score: 0.95, ...withSkill('rag') }),
      ranked({ ref: 's2', type: 'blog', score: 0.90, ...withSkill('rag') }),
      ranked({ ref: 's3', type: 'deep_dive', score: 0.85, ...withSkill('rag') }),
      ranked({ ref: 'other1', type: 'implementation_task', score: 0.5, ...withSkill('agents_mcp') }),
      ranked({ ref: 'other2', type: 'knowledge_check', score: 0.4, ...withSkill('governance') }),
    ];
    const defaultOut = applyPolicyRerank(sameSkillFive, learnerState(), NO_EXPLORATION_POLICY, NOW);
    const tightCaps: RerankCaps = { ...DEFAULT_RERANK_CAPS, crowdOutMaxPerSkill: 1 };
    const tightOut = applyPolicyRerank(sameSkillFive, learnerState(), NO_EXPLORATION_POLICY, NOW, tightCaps);
    expect(defaultOut.map((c) => c.ref)).not.toEqual(tightOut.map((c) => c.ref));
    // Default (max 2 per skill in first 5): s1, s2 both land before crowd-out kicks in.
    expect(defaultOut.slice(0, 2).map((c) => c.ref)).toEqual(['s1', 's2']);
    // Tightened (max 1 per skill in first 5): only s1 lands before crowd-out blocks s2/s3.
    expect(tightOut[0].ref).toBe('s1');
    expect(tightOut[1].ref).not.toBe('s2');
  });
});
