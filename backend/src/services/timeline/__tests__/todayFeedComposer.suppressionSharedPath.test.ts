/**
 * Feed Control type suppression — proves the live (materialised) path and the
 * admin "view as" read-only path produce CONSISTENT results for the same
 * gatherAnchored() outcome, confirming both `extendFeed` and
 * `composeReadOnlyPage` really do route through the one shared function
 * suppression lives in (todayAnchoredSources.gatherAnchored), not two
 * independently-diverging candidate-gathering paths.
 *
 * gatherAnchored itself is mocked here (its suppression behavior is already
 * covered directly by todayAnchoredSources.suppressionFlagOn.test.ts) — this
 * file's only job is proving BOTH getTodayPage() call shapes (live vs
 * readOnly) faithfully carry gatherAnchored's decision through to the final
 * served items, with nothing in either path silently re-adding a candidate
 * gatherAnchored already dropped.
 */
jest.mock('../ambientPool', () => ({
  pickAmbientBatch: jest.fn().mockResolvedValue([]),
  AMBIENT_PROVIDERS: ['blog', 'podcast', 'testimonial'],
  AMBIENT_REPEAT_COOLDOWN_DAYS: 30,
}));
jest.mock('../todayAnchoredSources', () => ({
  gatherAnchored: jest.fn(),
  rehydrateCommunityItems: jest.fn().mockResolvedValue(undefined),
  rehydrateSessionItems: jest.fn().mockResolvedValue(undefined),
}));

import { getTodayPage, type TodayFeedItem } from '../todayFeedComposer';
import { gatherAnchored } from '../todayAnchoredSources';
import { sequelize } from '../../../config/database';

const mockGatherAnchored = gatherAnchored as jest.Mock;

function mkItem(ref: string): TodayFeedItem {
  return {
    position: 0, kind: 'anchored', ref, surface: 'today', type: 'implementation_task', render_band: 'task',
    card_id: ref.split(':')[1], title: ref, subtitle: null, description: null, image: null, video: null,
    blog: null, content: null, week: 1, estimated_time: 15, status: null, interacted: false,
  };
}

// A minimal fake `today_feed_impressions` table so the live path's
// write-then-read-back (persistImpression -> loadImpressions) actually
// round-trips, instead of a blanket-empty mock silently dropping every item
// the live path materialises.
let store: any[];
beforeEach(() => {
  jest.clearAllMocks();
  store = [];
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
    return Promise.resolve([] as any); // completedCardIds / collectedBlogRefs — nothing completed/collected
  }) as any);
});

it('the live (materialised) path and the read-only "view as" path both reflect the SAME gatherAnchored outcome for the same fixture', async () => {
  const survivor = mkItem('card:kept');
  // Simulate "gatherAnchored already suppressed a sibling candidate" by only
  // ever returning the one survivor — both call sites get this same fixture.
  mockGatherAnchored.mockResolvedValue({ weekBound: [survivor], evergreenByType: new Map() });

  const live = await getTodayPage('enr-1', 0, 1);
  const readOnly = await getTodayPage('enr-1', 0, 1, { readOnly: true });

  expect(live.items.map((i) => i.ref)).toEqual(['card:kept']);
  expect(readOnly.items.map((i) => i.ref)).toEqual(['card:kept']);
  expect(mockGatherAnchored).toHaveBeenCalled();
});

it('a candidate gatherAnchored suppressed (never present in its output) appears in NEITHER path', async () => {
  mockGatherAnchored.mockResolvedValue({ weekBound: [], evergreenByType: new Map() });

  const live = await getTodayPage('enr-1', 0, 1);
  const readOnly = await getTodayPage('enr-1', 0, 1, { readOnly: true });

  expect(live.items).toEqual([]);
  expect(readOnly.items).toEqual([]);
});
