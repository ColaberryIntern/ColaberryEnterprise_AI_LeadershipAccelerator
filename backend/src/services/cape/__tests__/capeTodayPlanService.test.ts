import { getTodayPlan } from '../capeTodayPlanService';
import { getTodayPage } from '../../timeline/todayFeedComposer';
import { getLifecycleMode } from '../capeLifecycleModeService';
import { enrichCard } from '../capeCardEnrichmentService';
import { getCurrentGovernancePolicy } from '../capeGovernancePolicyService';
import { sequelize } from '../../../config/database';
import { todayPlanResponseSchema } from '../../../schemas/capeSchema';

jest.mock('../../timeline/todayFeedComposer', () => {
  const actual = jest.requireActual('../../timeline/todayFeedComposer');
  return { ...actual, getTodayPage: jest.fn() };
});
jest.mock('../capeLifecycleModeService', () => ({ getLifecycleMode: jest.fn() }));
jest.mock('../capeCardEnrichmentService', () => ({ enrichCard: jest.fn() }));
// CAPE Phase 6: mocked at this direct-import boundary (not the transitive
// config/database boundary) — same convention as
// capeLearningValueRanker.test.ts's capeGovernancePolicyService mock. Default
// resolved value below is byte-identical to the pre-Phase-6 hardcoded
// behavior, so every pre-existing test in this file that doesn't override it
// keeps its exact prior expected output.
jest.mock('../capeGovernancePolicyService', () => ({ getCurrentGovernancePolicy: jest.fn() }));
const mockQuery = jest.spyOn(sequelize, 'query');

const mockGetTodayPage = getTodayPage as unknown as jest.Mock;
const mockGetLifecycleMode = getLifecycleMode as unknown as jest.Mock;
const mockEnrichCard = enrichCard as unknown as jest.Mock;
const mockGovernancePolicy = getCurrentGovernancePolicy as unknown as jest.Mock;

const DEFAULT_PACING = {
  same_type_max_streak: 2, passive_max_streak: 2, crowd_out_max_per_skill: 2,
  crowd_out_window: 5, stretch_cap_first_five: 1, daily_plan_target_minutes: 999,
  review_slot_share: 1, ai_pulse_slot_share: 1,
};

function item(overrides: Record<string, any>): any {
  return {
    position: 0, kind: 'ambient', ref: 'x', surface: 'today', type: 'blog', render_band: 'reading',
    card_id: null, title: 't', subtitle: null, description: null, image: null, video: null, blog: null,
    content: null, week: null, estimated_time: 10, status: null, interacted: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLifecycleMode.mockResolvedValue({ mode: 'foundation', days_since_last_activity: null, reasoning: 'x' });
  mockEnrichCard.mockResolvedValue({ why_this: 'x', level: 'Working', proof: 'Learn' });
  mockQuery.mockResolvedValue([{ enrollment_type: 'explorer' }] as any);
  mockGovernancePolicy.mockResolvedValue({ ...DEFAULT_PACING });
});

describe('getTodayPlan — happy path (typical mixed candidate set)', () => {
  it('fills all 5 slots with the right candidate type in each slot', async () => {
    const candidates = [
      item({ position: 0, kind: 'anchored', type: 'deep_dive', ref: 'a0' }),
      item({ position: 1, kind: 'anchored', type: 'deep_dive', ref: 'a1' }),
      item({ position: 2, kind: 'ambient', type: 'prompt_lab', ref: 'p0' }),
      item({ position: 3, kind: 'ambient', type: 'ai_news_flash', ref: 'n0' }),
      item({ position: 4, kind: 'ambient', type: 'community_discussion', ref: 'c0' }),
    ];
    mockGetTodayPage.mockResolvedValue({ items: candidates, nextCursor: 5, exhausted: false });

    const plan = await getTodayPlan('enr-1');
    expect(plan.items).toHaveLength(5);
    expect(plan.items.find((i) => i.slot === 'next_best')?.ref).toBe('a0');
    expect(plan.items.find((i) => i.slot === 'foundation')?.ref).toBe('a1');
    expect(plan.items.find((i) => i.slot === 'practice')?.ref).toBe('p0');
    expect(plan.items.find((i) => i.slot === 'ai_pulse')?.ref).toBe('n0');
    expect(plan.items.find((i) => i.slot === 'review')?.ref).toBe('c0');
    expect(plan.mode).toBe('foundation');
  });

  it('calls getTodayPage exactly once, with cursor 0 (Assumption 5 — the ONLY retrieval call)', async () => {
    mockGetTodayPage.mockResolvedValue({ items: [], nextCursor: 0, exhausted: true });
    await getTodayPlan('enr-1');
    expect(mockGetTodayPage).toHaveBeenCalledTimes(1);
    expect(mockGetTodayPage).toHaveBeenCalledWith('enr-1', 0, 30);
  });

  it('every item retains a real, unique, non-empty ref', async () => {
    const candidates = [
      item({ position: 0, kind: 'anchored', type: 'deep_dive', ref: 'a0' }),
      item({ position: 1, kind: 'ambient', type: 'ai_news_flash', ref: 'n0' }),
    ];
    mockGetTodayPage.mockResolvedValue({ items: candidates, nextCursor: 2, exhausted: false });
    const plan = await getTodayPlan('enr-1');
    const refs = plan.items.map((i) => i.ref);
    expect(refs.every((r) => typeof r === 'string' && r.length > 0)).toBe(true);
    expect(new Set(refs).size).toBe(refs.length);
  });
});

describe('getTodayPlan — boundary cases', () => {
  it('zero-evidence brand-new learner with a small candidate set -> valid plan, mode:foundation', async () => {
    mockGetTodayPage.mockResolvedValue({
      items: [item({ position: 0, kind: 'anchored', type: 'overview', ref: 'a0' })],
      nextCursor: 1, exhausted: true,
    });
    const plan = await getTodayPlan('enr-new');
    expect(plan.mode).toBe('foundation');
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items[0].slot).toBe('next_best');
  });

  it('learner who has completed everything (empty getTodayPage result) -> items: [], no throw', async () => {
    mockGetTodayPage.mockResolvedValue({ items: [], nextCursor: 0, exhausted: true });
    const plan = await getTodayPlan('enr-done');
    expect(plan.items).toEqual([]);
    expect(plan.estimated_total_minutes).toBe(0);
  });

  it('a slot with no qualifying candidate is OMITTED, not padded with a wrong-type item', async () => {
    // Only an anchored item and an ai_pulse item exist — no practice, no review candidate.
    const candidates = [
      item({ position: 0, kind: 'anchored', type: 'overview', ref: 'a0' }),
      item({ position: 1, kind: 'ambient', type: 'ai_news_flash', ref: 'n0' }),
    ];
    mockGetTodayPage.mockResolvedValue({ items: candidates, nextCursor: 2, exhausted: true });
    const plan = await getTodayPlan('enr-1');
    const slots = plan.items.map((i) => i.slot);
    expect(slots).not.toContain('practice');
    expect(slots).toContain('ai_pulse');
  });

  it('cohort (non-Explorer) learner: a 2nd/3rd anchored item fills foundation/review when no natural candidate exists', async () => {
    mockQuery.mockResolvedValue([{ enrollment_type: 'standard' }] as any);
    const candidates = [
      item({ position: 0, kind: 'anchored', type: 'overview', ref: 'a0' }),
      item({ position: 1, kind: 'anchored', type: 'overview', ref: 'a1' }),
      item({ position: 2, kind: 'anchored', type: 'overview', ref: 'a2' }),
    ];
    mockGetTodayPage.mockResolvedValue({ items: candidates, nextCursor: 3, exhausted: true });
    const plan = await getTodayPlan('enr-cohort');
    const slots = plan.items.map((i) => i.slot);
    expect(slots).toContain('foundation');
    expect(slots).toContain('review');
  });

  it('free/Explorer learner does NOT get the cohort fallback — foundation/review stay omitted when no natural candidate exists', async () => {
    mockQuery.mockResolvedValue([{ enrollment_type: 'explorer' }] as any);
    const candidates = [item({ position: 0, kind: 'anchored', type: 'overview', ref: 'a0' })];
    mockGetTodayPage.mockResolvedValue({ items: candidates, nextCursor: 1, exhausted: true });
    const plan = await getTodayPlan('enr-explorer');
    const slots = plan.items.map((i) => i.slot);
    expect(slots).toEqual(['next_best']);
  });

  it('estimated_total_minutes sums real item times, null estimated_time treated as 0', async () => {
    const candidates = [
      item({ position: 0, kind: 'anchored', type: 'overview', ref: 'a0', estimated_time: 15 }),
      item({ position: 1, kind: 'ambient', type: 'ai_news_flash', ref: 'n0', estimated_time: null }),
    ];
    mockGetTodayPage.mockResolvedValue({ items: candidates, nextCursor: 2, exhausted: true });
    const plan = await getTodayPlan('enr-1');
    expect(plan.estimated_total_minutes).toBe(15);
  });

  it('a real service output round-trips cleanly through todayPlanResponseSchema.safeParse', async () => {
    const candidates = [
      item({ position: 0, kind: 'anchored', type: 'overview', ref: 'a0' }),
      item({ position: 1, kind: 'anchored', type: 'overview', ref: 'a1' }),
      item({ position: 2, kind: 'ambient', type: 'prompt_lab', ref: 'p0' }),
      item({ position: 3, kind: 'ambient', type: 'ai_news_flash', ref: 'n0' }),
      item({ position: 4, kind: 'ambient', type: 'community_discussion', ref: 'c0' }),
    ];
    mockGetTodayPage.mockResolvedValue({ items: candidates, nextCursor: 5, exhausted: false });
    const plan = await getTodayPlan('enr-1');
    const parsed = todayPlanResponseSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
  });
});

describe('getTodayPlan — CAPE Phase 6 pacing knobs', () => {
  const fullCandidates = [
    item({ position: 0, kind: 'anchored', type: 'overview', ref: 'a0', estimated_time: 10 }),
    item({ position: 1, kind: 'anchored', type: 'overview', ref: 'a1', estimated_time: 10 }),
    item({ position: 2, kind: 'ambient', type: 'prompt_lab', ref: 'p0', estimated_time: 10 }),
    item({ position: 3, kind: 'ambient', type: 'ai_news_flash', ref: 'n0', estimated_time: 10 }),
    item({ position: 4, kind: 'ambient', type: 'community_discussion', ref: 'c0', estimated_time: 10 }),
  ];

  it('default policy (999 min target, shares=1) reproduces the exact prior 5-slot output — explicit identity check', async () => {
    mockGetTodayPage.mockResolvedValue({ items: fullCandidates, nextCursor: 5, exhausted: false });
    const plan = await getTodayPlan('enr-1');
    expect(plan.items.map((i) => i.slot)).toEqual(['next_best', 'foundation', 'practice', 'ai_pulse', 'review']);
    expect(plan.estimated_total_minutes).toBe(50);
  });

  it('review_slot_share = 0 deterministically omits the review slot, even when a qualifying candidate exists', async () => {
    mockGovernancePolicy.mockResolvedValue({ ...DEFAULT_PACING, review_slot_share: 0 });
    mockGetTodayPage.mockResolvedValue({ items: fullCandidates, nextCursor: 5, exhausted: false });
    const plan = await getTodayPlan('enr-1');
    expect(plan.items.map((i) => i.slot)).not.toContain('review');
    expect(plan.items.map((i) => i.slot)).toEqual(['next_best', 'foundation', 'practice', 'ai_pulse']);
  });

  it('ai_pulse_slot_share = 0 deterministically omits the ai_pulse slot, even when a qualifying candidate exists', async () => {
    mockGovernancePolicy.mockResolvedValue({ ...DEFAULT_PACING, ai_pulse_slot_share: 0 });
    mockGetTodayPage.mockResolvedValue({ items: fullCandidates, nextCursor: 5, exhausted: false });
    const plan = await getTodayPlan('enr-1');
    expect(plan.items.map((i) => i.slot)).not.toContain('ai_pulse');
  });

  it('review_slot_share = 0 also suppresses the cohort fallback for review (never re-fills a slot the admin explicitly disabled)', async () => {
    mockQuery.mockResolvedValue([{ enrollment_type: 'cohort' }] as any); // non-Explorer
    mockGovernancePolicy.mockResolvedValue({ ...DEFAULT_PACING, review_slot_share: 0 });
    const candidates = [
      item({ position: 0, kind: 'anchored', type: 'overview', ref: 'a0' }),
      item({ position: 1, kind: 'anchored', type: 'overview', ref: 'a1' }),
    ];
    mockGetTodayPage.mockResolvedValue({ items: candidates, nextCursor: 2, exhausted: true });
    const plan = await getTodayPlan('enr-cohort');
    expect(plan.items.map((i) => i.slot)).not.toContain('review');
  });

  it('daily_plan_target_minutes trims trailing slots in priority order (review, then ai_pulse, then practice) — next_best/foundation are NEVER dropped', async () => {
    // 5 slots x 10 min = 50 total. Target 25 -> must drop review (40) and
    // ai_pulse (30) to get to practice-inclusive 30... still over 25, so
    // practice also drops, landing at next_best+foundation = 20 (<= 25).
    mockGovernancePolicy.mockResolvedValue({ ...DEFAULT_PACING, daily_plan_target_minutes: 25 });
    mockGetTodayPage.mockResolvedValue({ items: fullCandidates, nextCursor: 5, exhausted: false });
    const plan = await getTodayPlan('enr-1');
    expect(plan.items.map((i) => i.slot)).toEqual(['next_best', 'foundation']);
    expect(plan.estimated_total_minutes).toBe(20);
  });

  it('daily_plan_target_minutes exactly at the assembled total is NOT trimmed (boundary: <= target, not < target)', async () => {
    mockGovernancePolicy.mockResolvedValue({ ...DEFAULT_PACING, daily_plan_target_minutes: 50 });
    mockGetTodayPage.mockResolvedValue({ items: fullCandidates, nextCursor: 5, exhausted: false });
    const plan = await getTodayPlan('enr-1');
    expect(plan.items).toHaveLength(5);
    expect(plan.estimated_total_minutes).toBe(50);
  });

  it('daily_plan_target_minutes never drops next_best or foundation even at an extremely low target', async () => {
    mockGovernancePolicy.mockResolvedValue({ ...DEFAULT_PACING, daily_plan_target_minutes: 1 });
    mockGetTodayPage.mockResolvedValue({ items: fullCandidates, nextCursor: 5, exhausted: false });
    const plan = await getTodayPlan('enr-1');
    expect(plan.items.map((i) => i.slot)).toEqual(['next_best', 'foundation']);
  });
});
