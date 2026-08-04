/**
 * feed_weight (2026-08-04) — the per-type weight slider's backend plumbing:
 * routeType() clamps (never rejects, unlike home_surface/bucket_default),
 * getTypeWeights() resolves the stored map for the composer, and getBoard()
 * computes PER-TYPE (not per-lane) weight_live. See execution-contract.md
 * (.loop-architect/runs/20260804-feed-control-weighted-lanes/) for the full
 * design rationale, including the `announcement` counterexample that ruled
 * out a per-lane flag.
 *
 * Same mocking convention as feedControlService.simulate.test.ts: the module
 * transitively loads real Sequelize models via settingsService/
 * CurriculumTypeDefinition/TimelineCard/Enrollment (Model.init at module
 * load), so `sequelize` itself is not wholesale-mocked — `sequelize.query`
 * is spied on instead. settingsService's getSetting/setSetting ARE mocked
 * directly (they're the actual persistence layer under test).
 */
import { sequelize } from '../../../config/database';
jest.spyOn(sequelize, 'query').mockResolvedValue([] as any);
jest.mock('../../settingsService', () => ({ getSetting: jest.fn(), setSetting: jest.fn() }));
jest.mock('../feedConfigService', () => ({
  getFeedPolicy: jest.fn().mockResolvedValue({ todayCadence: 2, ambientProviders: ['blog', 'podcast', 'testimonial'], defaultFrequencyCap: 0, defaultCooldownDays: 0, recencyHalfLifeDays: 21, explorationPct: 0.15, priorityWeight: 0.02 }),
  setFeedPolicy: jest.fn(),
}));
jest.mock('../feedRanker', () => ({ rankCandidates: jest.fn() }));
jest.mock('../timelineService', () => ({ getFeed: jest.fn() }));
jest.mock('../../cape/capeLearningValueRanker', () => ({ rankLearningValue: jest.fn() }));
jest.mock('../../../models/CurriculumTypeDefinition', () => ({ update: jest.fn().mockResolvedValue([0]) }));

const TYPE_DEFS: Record<string, any> = {
  ai_news_flash: { slug: 'ai_news_flash', label: 'AI News Flash', student_label: 'AI News Flash', home_surface: 'today', feed_mode: 'anchored', today_eligible: true, bucket: 'learn', system: false, event: false, render_band: 'news', difficulty: 'core' },
  announcement: { slug: 'announcement', label: 'Announcement', student_label: 'Announcement', home_surface: 'today', feed_mode: 'anchored', today_eligible: true, bucket: 'pre_class', system: false, event: false, render_band: 'announcement', difficulty: 'core' },
  blog: { slug: 'blog', label: 'Blog', student_label: 'Blog', home_surface: 'today', feed_mode: 'ambient', today_eligible: true, bucket: 'learn', system: false, event: false, render_band: 'media', difficulty: 'core' },
  community_discussion: { slug: 'community_discussion', label: 'Community Discussion', student_label: 'Community Ritual', home_surface: 'community', feed_mode: 'anchored', today_eligible: true, bucket: 'share', system: false, event: false, render_band: 'peer_wins', difficulty: 'core' },
};
jest.mock('../typeRegistry', () => ({
  resolve: jest.fn((slug: string) => TYPE_DEFS[slug] ?? null),
  register: jest.fn(),
  allTypes: jest.fn(() => Object.values(TYPE_DEFS)),
}));

import { routeType, getTypeWeights, getBoard } from '../feedControlService';
import { getSetting, setSetting } from '../../settingsService';

const mockGetSetting = getSetting as unknown as jest.Mock;
const mockSetSetting = setSetting as unknown as jest.Mock;
const mockSequelizeQuery = sequelize.query as unknown as jest.Mock;

let routingStore: Record<string, any>;

beforeEach(() => {
  jest.clearAllMocks();
  routingStore = {};
  mockGetSetting.mockImplementation(async () => routingStore);
  mockSetSetting.mockImplementation(async (_key: string, value: any) => { routingStore = value; });
  mockSequelizeQuery.mockResolvedValue([]);
});

describe('routeType — feed_weight clamping (never rejects, unlike home_surface/bucket_default)', () => {
  it('an in-range weight persists unchanged', async () => {
    const { routing } = await routeType('ai_news_flash', { feed_weight: 75 });
    expect(routing.feed_weight).toBe(75);
  });

  it('an out-of-range weight is clamped, not rejected (no throw, no 400)', async () => {
    const { routing } = await routeType('ai_news_flash', { feed_weight: 500 });
    expect(routing.feed_weight).toBe(100);
  });

  it('a negative weight clamps up to 1', async () => {
    const { routing } = await routeType('ai_news_flash', { feed_weight: -10 });
    expect(routing.feed_weight).toBe(1);
  });

  it('NaN clamps to the neutral default 50', async () => {
    const { routing } = await routeType('ai_news_flash', { feed_weight: NaN });
    expect(routing.feed_weight).toBe(50);
  });

  it('omitting feed_weight entirely leaves an existing stored value untouched', async () => {
    await routeType('ai_news_flash', { feed_weight: 80 });
    const { routing } = await routeType('ai_news_flash', { today_eligible: false });
    expect(routing.feed_weight).toBe(80);
    expect(routing.today_eligible).toBe(false);
  });

  it('explicit null clears a previously-set weight back to unset', async () => {
    await routeType('ai_news_flash', { feed_weight: 80 });
    const { routing } = await routeType('ai_news_flash', { feed_weight: null });
    expect(routing.feed_weight).toBeNull();
  });

  it('is idempotent: setting the same weight twice produces the same stored value, no drift', async () => {
    await routeType('ai_news_flash', { feed_weight: 65 });
    const { routing } = await routeType('ai_news_flash', { feed_weight: 65 });
    expect(routing.feed_weight).toBe(65);
  });

  it('an unknown slug still rejects (pre-existing behavior, unaffected by the weight clamp change)', async () => {
    await expect(routeType('not_a_real_type', { feed_weight: 50 })).rejects.toThrow();
  });
});

describe('getTypeWeights — what the composer reads', () => {
  it('returns a Map with only the types that have an explicit weight set', async () => {
    await routeType('ai_news_flash', { feed_weight: 90 });
    await routeType('blog', { today_eligible: true }); // no weight set
    const weights = await getTypeWeights();
    expect(weights.get('ai_news_flash')).toBe(90);
    expect(weights.has('blog')).toBe(false);
  });

  it('resolves through the same clamp as routeType (defensive double-clamp, values already clamped on write)', async () => {
    await routeType('ai_news_flash', { feed_weight: 77 });
    const weights = await getTypeWeights();
    expect(weights.get('ai_news_flash')).toBe(77);
  });

  it('an empty routing map returns an empty weight map (equal-weight behavior downstream)', async () => {
    const weights = await getTypeWeights();
    expect(weights.size).toBe(0);
  });
});

describe('getBoard — PER-TYPE weight_live (not per-lane)', () => {
  it('an ambient type (blog) is always weight_live regardless of published cards', async () => {
    mockSequelizeQuery.mockResolvedValue([]); // no evergreen published cards for anything
    const board = await getBoard();
    const todayLane = board.lanes.find((l: any) => l.surface.id === 'today');
    const blogEntry = todayLane.types.find((t: any) => t.slug === 'blog');
    expect(blogEntry.weight_live).toBe(true);
  });

  it('community_discussion is always weight_live (the dynamic community_posts stream, not a timeline_cards type)', async () => {
    mockSequelizeQuery.mockResolvedValue([]);
    const board = await getBoard();
    const communityLane = board.lanes.find((l: any) => l.surface.id === 'community');
    const entry = communityLane.types.find((t: any) => t.slug === 'community_discussion');
    expect(entry.weight_live).toBe(true);
  });

  it('the announcement counterexample: Today-lane but week-bound/one-shot — weight_live is FALSE when it has no published evergreen card', async () => {
    mockSequelizeQuery.mockResolvedValue([]); // no published week:null 'announcement' cards
    const board = await getBoard();
    const todayLane = board.lanes.find((l: any) => l.surface.id === 'today');
    const announcementEntry = todayLane.types.find((t: any) => t.slug === 'announcement');
    expect(announcementEntry.weight_live).toBe(false);
  });

  it('announcement flips to weight_live TRUE the moment it has a published evergreen card (dynamic, content-state-driven, not hardcoded)', async () => {
    mockSequelizeQuery.mockResolvedValue([{ type: 'announcement' }]);
    const board = await getBoard();
    const todayLane = board.lanes.find((l: any) => l.surface.id === 'today');
    const announcementEntry = todayLane.types.find((t: any) => t.slug === 'announcement');
    expect(announcementEntry.weight_live).toBe(true);
  });

  it('the weight_live DB query failing degrades soft (ambient + community still live, evergreen-detection just undercounts) rather than throwing', async () => {
    mockSequelizeQuery.mockRejectedValueOnce(new Error('transient db blip'));
    await expect(getBoard()).resolves.toBeDefined();
    const board = await getBoard();
    const todayLane = board.lanes.find((l: any) => l.surface.id === 'today');
    expect(todayLane.types.find((t: any) => t.slug === 'blog').weight_live).toBe(true);
  });

  it('board entries carry the stored weight (null when unset)', async () => {
    await routeType('ai_news_flash', { feed_weight: 42 });
    const board = await getBoard();
    const todayLane = board.lanes.find((l: any) => l.surface.id === 'today');
    expect(todayLane.types.find((t: any) => t.slug === 'ai_news_flash').weight).toBe(42);
    expect(todayLane.types.find((t: any) => t.slug === 'blog').weight).toBeNull();
  });
});
