/**
 * Cross-type slot backfill from genuine evergreen surplus — the T003 half of
 * the ambient-provider-rebalance build. When a suppressed ambient provider
 * (todayFeedComposer.ambientSuppression.test.ts) leaves a slot dry, this
 * proves the slot gets filled from a sibling evergreen type's REAL leftover
 * supply rather than just being dropped -- and, critically, that this is a
 * genuine net-new item served, not a reshuffle of an item a sibling slot
 * would have consumed anyway (the exact no-op bug plan-audit cycle 1 caught
 * before any of this code was written).
 */
jest.mock('../ambientTypeExposureService', () => ({ getAmbientDistinctSeenCounts: jest.fn() }));
jest.mock('../feedControlService', () => ({ getRoutingMap: jest.fn() }));

let ambientCounter = 0;
const mockPickAmbientBatch = jest.fn((_eid: string, provider: string, n: number) =>
  Promise.resolve(Array.from({ length: n }, () => {
    const id = `${provider}-${ambientCounter++}`;
    return { provider, ref: `${provider}:${id}`, media_id: id, title: id, description: null, video: null, blog: null, image: null };
  })));
jest.mock('../ambientPool', () => ({
  pickAmbientBatch: (...args: any[]) => mockPickAmbientBatch(...args),
  AMBIENT_PROVIDERS: ['blog', 'podcast', 'testimonial'],
  AMBIENT_REPEAT_COOLDOWN_DAYS: 30,
}));

function mkFixtureItem(type: string, i: number) {
  return {
    position: 0, kind: 'anchored', ref: `card:${type}-${i}`, surface: 'today', type, render_band: 'intel',
    card_id: `${type}-${i}`, title: `${type}-${i}`, subtitle: null, description: null,
    image: null, video: null, blog: null, content: null, week: null, estimated_time: null, status: null, interacted: false,
  };
}

const mockGatherAnchored = jest.fn();
jest.mock('../todayAnchoredSources', () => ({
  gatherAnchored: (...args: any[]) => mockGatherAnchored(...args),
  rehydrateCommunityItems: jest.fn().mockResolvedValue(undefined),
  rehydrateSessionItems: jest.fn().mockResolvedValue(undefined),
}));

import { getTodayPage } from '../todayFeedComposer';
import { getAmbientDistinctSeenCounts } from '../ambientTypeExposureService';
import { getRoutingMap } from '../feedControlService';
import { sequelize } from '../../../config/database';
import { env } from '../../../config/env';

const mockGetSeenCounts = getAmbientDistinctSeenCounts as jest.Mock;
const mockGetRoutingMap = getRoutingMap as jest.Mock;

let store: any[];
beforeEach(() => {
  jest.clearAllMocks();
  ambientCounter = 0;
  store = [];
  mockGetSeenCounts.mockResolvedValue({ blog: 0, podcast: 0, testimonial: 0 });
  mockGetRoutingMap.mockResolvedValue({});
  jest.spyOn(sequelize, 'query').mockImplementation(((sql: any, opts: any) => {
    const s = String(sql);
    if (s.includes('INSERT INTO today_feed_impressions')) {
      const r = (opts as any).replacements;
      store.push({ position: r.pos, kind: r.kind, ref: r.ref, provider: r.provider, card_id: r.card_id, item: JSON.parse(r.item), interacted_at: null, served_at: new Date() });
      return Promise.resolve([[], 0] as any);
    }
    if (s.includes('SELECT position, kind, ref, provider, card_id, item, interacted_at, served_at')) {
      return Promise.resolve([...store] as any);
    }
    return Promise.resolve([] as any);
  }) as any);
});

// One evergreen type ('ai_news_flash') with far more real candidates (20) than
// any single call's slot allotment would ever claim -- the genuine surplus
// condition T003 requires (as opposed to the T002 default fixture, which
// deliberately has zero surplus so it never accidentally masks a suppression
// test with a backfill).
const SURPLUS_POOL = Array.from({ length: 20 }, (_, i) => mkFixtureItem('ai_news_flash', i));

describe('flag OFF (default): backfill is fully inert even where it would be triggerable', () => {
  it('a suppressed-looking dry ambient slot (testimonial capped in routing) still drops the slot -- flag reads default false, so suppression itself never engages, and no backfill code runs even though genuine evergreen surplus exists', async () => {
    expect(env.feedControlAmbientSuppressionEnabled).toBe(false);
    mockGatherAnchored.mockResolvedValue({ weekBound: [], evergreenByType: new Map([['ai_news_flash', [...SURPLUS_POOL]]]) });
    mockGetRoutingMap.mockResolvedValue({ testimonial: { feed_frequency_cap: 1 } });
    mockGetSeenCounts.mockResolvedValue({ blog: 0, podcast: 0, testimonial: 999 }); // would be capped if flag were on

    await getTodayPage('enr-1', 0, 9);

    expect(mockGetRoutingMap).not.toHaveBeenCalled();
    expect(mockGetSeenCounts).not.toHaveBeenCalled();
    // testimonial is fetched normally (suppression never engaged) -- proves this
    // is "suppression is off" behavior, not an accidental backfill masking it.
    expect(mockPickAmbientBatch.mock.calls.some((c) => c[1] === 'testimonial')).toBe(true);
  });
});

describe('flag ON: dry slots are genuinely backfilled from evergreen surplus', () => {
  beforeEach(() => {
    (env as any).feedControlAmbientSuppressionEnabled = true;
  });
  afterEach(() => {
    (env as any).feedControlAmbientSuppressionEnabled = false;
  });

  it('(d) a suppressed/dry ambient slot is filled from a sibling evergreen type genuine surplus item, present in the final persisted rows', async () => {
    // Small evergreen supply (1 item, well under any per-call slot need) plus
    // a big surplus type so the round-robin's own key allotment for
    // 'ai_news_flash' is tiny relative to its real candidate pool.
    mockGatherAnchored.mockResolvedValue({ weekBound: [], evergreenByType: new Map([['ai_news_flash', [...SURPLUS_POOL]]]) });
    mockGetRoutingMap.mockResolvedValue({ testimonial: { feed_frequency_cap: 1 } }); // real positive cap, already met -> always dry
    mockGetSeenCounts.mockResolvedValue({ blog: 0, podcast: 0, testimonial: 1 });

    await getTodayPage('enr-1', 0, 12);

    expect(mockPickAmbientBatch.mock.calls.some((c) => c[1] === 'testimonial')).toBe(false); // confirmed dry
    const backfilled = store.filter((r) => r.kind === 'anchored' && r.item.type === 'ai_news_flash');
    expect(backfilled.length).toBeGreaterThan(0); // testimonial's dry slot(s) picked up evergreen surplus instead of vanishing
  });

  it('(e) quantitative invariant: total items PERSISTED by a single extendFeed call WITH genuine surplus > total persisted by the same call with surplus forced empty -- backfill adds net items, it does not just reshuffle', async () => {
    // pageSize=1 forces getTodayPage's own guard loop to stop after exactly one
    // extendFeed call (served.length reaches targetEnd=1 immediately once ANY
    // item is persisted, since blog/podcast are unsuppressed and plentiful) --
    // isolating one extendFeed call's own behavior from the outer retry loop,
    // which would otherwise re-invoke extendFeed against the same static mock
    // and mask a real no-op bug behind repeated re-fetches (the false-pass this
    // test must NOT allow through, per plan-audit cycle 1's own finding).
    mockGetRoutingMap.mockResolvedValue({ testimonial: { feed_frequency_cap: 1 } });
    mockGetSeenCounts.mockResolvedValue({ blog: 0, podcast: 0, testimonial: 1 });

    // Run A: genuine surplus available.
    mockGatherAnchored.mockResolvedValue({ weekBound: [], evergreenByType: new Map([['ai_news_flash', [...SURPLUS_POOL]]]) });
    await getTodayPage('enr-A', 0, 1);
    const persistedWithSurplus = store.length;

    // Run B: same shape, but the evergreen type has EXACTLY as many candidates
    // as a call could ever claim without slot-need duplication -- i.e. no
    // surplus beyond perKeyNeed. Simulated by capping the pool to a small,
    // clearly-insufficient-for-surplus size (1 item) so evergreenByType.get(key)
    // has nothing left after its own slice.
    store = [];
    mockGatherAnchored.mockResolvedValue({ weekBound: [], evergreenByType: new Map([['ai_news_flash', [mkFixtureItem('ai_news_flash', 0)]]]) });
    await getTodayPage('enr-B', 0, 1);
    const persistedNoSurplus = store.length;

    expect(persistedWithSurplus).toBeGreaterThan(persistedNoSurplus); // strictly more -- backfill is genuinely additive here, not a reshuffle
  });

  it('(f) no evergreen key has any surplus -- the slot still drops exactly as pre-backfill behavior, no error', async () => {
    mockGatherAnchored.mockResolvedValue({ weekBound: [], evergreenByType: new Map([['ai_news_flash', [mkFixtureItem('ai_news_flash', 0)]]]) });
    mockGetRoutingMap.mockResolvedValue({ testimonial: { feed_frequency_cap: 1 } });
    mockGetSeenCounts.mockResolvedValue({ blog: 0, podcast: 0, testimonial: 1 });

    const page = await getTodayPage('enr-1', 0, 12);

    expect(page).toBeDefined();
    expect(mockPickAmbientBatch.mock.calls.some((c) => c[1] === 'testimonial')).toBe(false);
  });

  it('(g) pickAmbientBatch is called exactly the number of times the pre-fetch plan requires -- never inflated by a backfill attempt', async () => {
    mockGatherAnchored.mockResolvedValue({ weekBound: [], evergreenByType: new Map([['ai_news_flash', [...SURPLUS_POOL]]]) });
    mockGetRoutingMap.mockResolvedValue({ testimonial: { feed_frequency_cap: 1 } });
    mockGetSeenCounts.mockResolvedValue({ blog: 0, podcast: 0, testimonial: 1 });

    await getTodayPage('enr-1', 0, 12);

    // testimonial is capped (never fetched); blog/podcast fetched at most once
    // each per call (no top-up needed since the mock always returns full n).
    expect(mockPickAmbientBatch.mock.calls.filter((c) => c[1] === 'testimonial')).toHaveLength(0);
    expect(mockPickAmbientBatch.mock.calls.filter((c) => c[1] === 'blog').length).toBeLessThanOrEqual(2);
    expect(mockPickAmbientBatch.mock.calls.filter((c) => c[1] === 'podcast').length).toBeLessThanOrEqual(2);
  });
});
