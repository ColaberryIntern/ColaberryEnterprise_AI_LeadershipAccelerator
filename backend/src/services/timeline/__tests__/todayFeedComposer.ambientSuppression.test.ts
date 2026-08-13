/**
 * Feed Control ambient suppression (Freq cap / Cooldown for blog/podcast/
 * testimonial) — env.feedControlAmbientSuppressionEnabled, default false
 * everywhere including production. Complements
 * todayFeedComposer.ambientBackfill.test.ts (proves the dry slots this file
 * creates get genuinely filled from evergreen surplus, not just dropped).
 */
jest.mock('../ambientTypeExposureService', () => ({ getAmbientDistinctSeenCounts: jest.fn() }));
jest.mock('../feedControlService', () => ({ getRoutingMap: jest.fn() }));
jest.mock('../todayAnchoredSources', () => ({
  gatherAnchored: jest.fn().mockResolvedValue({ weekBound: [], evergreenByType: new Map() }),
  rehydrateCommunityItems: jest.fn().mockResolvedValue(undefined),
  rehydrateSessionItems: jest.fn().mockResolvedValue(undefined),
}));

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

function seedAmbient(provider: string, n: number, servedAt: Date) {
  for (let i = 0; i < n; i++) {
    store.push({
      position: i, kind: 'ambient', ref: `${provider}:seed-${provider}-${i}`, provider, card_id: null,
      item: { position: i, kind: 'ambient', ref: `${provider}:seed-${provider}-${i}`, surface: 'today', type: provider, render_band: 'media', card_id: null, title: `t${i}`, subtitle: null, description: null, image: null, video: null, blog: null, content: null, week: null, estimated_time: null, status: null, interacted: false },
      interacted_at: null, served_at: servedAt,
    });
  }
}

describe('flag OFF (default): ambient suppression is fully inert', () => {
  it('getRoutingMap and getAmbientDistinctSeenCounts are never called, and a routing table with a matching cap has zero effect', async () => {
    expect(env.feedControlAmbientSuppressionEnabled).toBe(false);
    mockGetRoutingMap.mockResolvedValue({ blog: { feed_frequency_cap: 0, feed_cooldown_days: 0 } });
    mockGetSeenCounts.mockResolvedValue({ blog: 999, podcast: 999, testimonial: 999 });

    const page = await getTodayPage('enr-1', 0, 6);

    expect(mockGetRoutingMap).not.toHaveBeenCalled();
    expect(mockGetSeenCounts).not.toHaveBeenCalled();
    expect(mockPickAmbientBatch).toHaveBeenCalled(); // ambient still served normally
    expect(page.items.length).toBeGreaterThan(0);
  });

  it('a global-cooldown-eligible-for-reshow ambient item still uses the single AMBIENT_REPEAT_COOLDOWN_DAYS constant, not a per-provider override', async () => {
    // Seeded 40 days ago -- outside the global 30-day cooldown, so it's excluded
    // from placedMedia's exclusion list regardless of any routing entry.
    seedAmbient('blog', 1, new Date(Date.now() - 40 * 24 * 60 * 60 * 1000));
    mockGetRoutingMap.mockResolvedValue({ blog: { feed_cooldown_days: 400 } }); // would matter if flag were on

    await getTodayPage('enr-1', 0, 2);

    expect(mockGetRoutingMap).not.toHaveBeenCalled();
  });
});

describe('flag ON: per-provider Freq cap suppresses fetching, per-provider Cooldown overrides the global default', () => {
  beforeEach(() => {
    (env as any).feedControlAmbientSuppressionEnabled = true;
  });
  afterEach(() => {
    (env as any).feedControlAmbientSuppressionEnabled = false;
  });

  it('(a) a provider at/over its routing cap is never fetched via pickAmbientBatch for that call', async () => {
    mockGetRoutingMap.mockResolvedValue({ testimonial: { feed_frequency_cap: 5 } });
    mockGetSeenCounts.mockResolvedValue({ blog: 0, podcast: 0, testimonial: 5 });

    await getTodayPage('enr-1', 0, 9);

    const testimonialCalls = mockPickAmbientBatch.mock.calls.filter((c) => c[1] === 'testimonial');
    expect(testimonialCalls).toHaveLength(0);
    const blogCalls = mockPickAmbientBatch.mock.calls.filter((c) => c[1] === 'blog');
    expect(blogCalls.length).toBeGreaterThan(0); // unaffected sibling still fetched
  });

  it('(b) a routing-overridden cooldown actually takes effect, discriminating from the mocked global default (30 days, set at the top of this file) rather than coincidentally matching it -- an item served 10 days ago is EXCLUDED under a 30-day global default (would still be cooling down) but the routing override (5 days) makes it eligible again, proving the override path is genuinely taken', async () => {
    seedAmbient('podcast', 1, new Date(Date.now() - 10 * 24 * 60 * 60 * 1000));
    mockGetRoutingMap.mockResolvedValue({ podcast: { feed_cooldown_days: 5 } });

    await getTodayPage('enr-1', 0, 4);

    expect(mockGetRoutingMap).toHaveBeenCalledTimes(1);
    const podcastCall = mockPickAmbientBatch.mock.calls.find((c) => c[1] === 'podcast');
    expect(podcastCall).toBeDefined();
    const excludeIds = podcastCall![3] as string[];
    // If the implementation silently fell back to the global 30-day default
    // (ignoring the routing override), this item (10 days old) would still be
    // excluded -- so a false pass here would be exactly the "not just proving
    // the global default still works" failure mode this test must rule out.
    expect(excludeIds).not.toContain('seed-podcast-0'); // 10 days > 5-day override -> no longer cooling down, eligible again
  });

  it('(c) a provider with no routing entry behaves exactly as flag-off for that provider', async () => {
    mockGetRoutingMap.mockResolvedValue({}); // no entries at all
    mockGetSeenCounts.mockResolvedValue({ blog: 500, podcast: 500, testimonial: 500 });

    await getTodayPage('enr-1', 0, 9);

    expect(mockPickAmbientBatch.mock.calls.filter((c) => c[1] === 'blog').length).toBeGreaterThan(0);
    expect(mockPickAmbientBatch.mock.calls.filter((c) => c[1] === 'podcast').length).toBeGreaterThan(0);
    expect(mockPickAmbientBatch.mock.calls.filter((c) => c[1] === 'testimonial').length).toBeGreaterThan(0);
  });

  it('(d) getRoutingMap and getAmbientDistinctSeenCounts are each called at most once per extendFeed invocation, even across many slots/providers', async () => {
    mockGetRoutingMap.mockResolvedValue({ blog: { feed_frequency_cap: 100 } });

    await getTodayPage('enr-1', 0, 12);

    expect(mockGetRoutingMap).toHaveBeenCalledTimes(1);
    expect(mockGetSeenCounts).toHaveBeenCalledTimes(1);
  });
});
