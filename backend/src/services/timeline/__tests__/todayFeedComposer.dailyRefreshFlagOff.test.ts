/**
 * Today daily auto-refresh — flag-off regression baseline. `env.todayDailyRefreshEnabled`
 * defaults false everywhere including production; this proves getTodayPage() is
 * byte-identical to before this feature existed, and that the new isDailyRefreshDue
 * check is never even called when the flag is off (matching the repo's established
 * flag-off-is-truly-inert convention, see todayAnchoredSources.suppressionFlagOff.test.ts).
 */
jest.mock('../ambientPool', () => ({
  pickAmbientBatch: jest.fn().mockResolvedValue([]),
  AMBIENT_PROVIDERS: ['blog', 'podcast', 'testimonial'],
  AMBIENT_REPEAT_COOLDOWN_DAYS: 30,
}));
jest.mock('../todayAnchoredSources', () => ({
  gatherAnchored: jest.fn().mockResolvedValue({ weekBound: [], evergreenByType: new Map() }),
  rehydrateCommunityItems: jest.fn().mockResolvedValue(undefined),
  rehydrateSessionItems: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../todayDailyRefreshService', () => ({
  isDailyRefreshDue: jest.fn(),
}));

import { getTodayPage } from '../todayFeedComposer';
import { isDailyRefreshDue } from '../todayDailyRefreshService';
import { sequelize } from '../../../config/database';

const mockIsDailyRefreshDue = isDailyRefreshDue as jest.Mock;

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
    return Promise.resolve([] as any);
  }) as any);
});

it('flag off: isDailyRefreshDue is never called, and no top-up extension happens even when a pre-seeded pool already satisfies the page', async () => {
  // Pre-seed 15 already-materialized impressions -- more than one page (10) --
  // so the EXISTING while-loop also does nothing on its own; any store growth
  // here could only come from the new daily-refresh code path.
  for (let i = 0; i < 15; i++) {
    store.push({ position: i, kind: 'ambient', ref: `blog:${i}`, provider: 'blog', card_id: null, item: { position: i, kind: 'ambient', ref: `blog:${i}`, surface: 'today', type: 'blog', render_band: 'media', card_id: null, title: `t${i}`, subtitle: null, description: null, image: null, video: null, blog: null, content: null, week: null, estimated_time: null, status: null, interacted: false }, interacted_at: null, served_at: new Date() });
  }

  const page = await getTodayPage('enr-1', 0, 10);

  expect(mockIsDailyRefreshDue).not.toHaveBeenCalled();
  expect(store.length).toBe(15); // untouched -- no top-up, no normal extension needed either
  expect(page.items).toHaveLength(10);
});

it('flag off: a brand-new account (zero impressions) behaves exactly as it did before this feature existed', async () => {
  const page = await getTodayPage('enr-new', 0, 10);
  expect(mockIsDailyRefreshDue).not.toHaveBeenCalled();
  expect(page.items).toEqual([]);
  expect(page.exhausted).toBe(true);
});
