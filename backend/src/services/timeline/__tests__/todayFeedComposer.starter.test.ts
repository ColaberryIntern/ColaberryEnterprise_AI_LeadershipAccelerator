/**
 * C107: getTodayPage serves an Explorer's five starter items before the first win, and the ordinary feed otherwise.
 * Serve-time only: the first page still materialises what it always did, and later pages materialise nothing more.
 * Harness as in todayFeedComposer.unpublishedCards.test.ts (an in-memory impression store behind sequelize.query).
 */
jest.mock('../../../models/index', () => ({}));
jest.mock('../../../models/TimelineCard', () => ({ __esModule: true, default: { findAll: jest.fn().mockResolvedValue([]) } }));
jest.mock('../ambientPool', () => ({
  pickAmbientBatch: jest.fn().mockResolvedValue([]),
  AMBIENT_PROVIDERS: ['blog', 'podcast', 'testimonial'],
  AMBIENT_REPEAT_COOLDOWN_DAYS: 30,
}));
jest.mock('../todayAnchoredSources', () => ({
  gatherAnchored: jest.fn().mockResolvedValue({ weekBound: [], evergreenByType: new Map() }),
  rehydrateCardItems: jest.fn().mockResolvedValue(undefined),
  rehydrateCommunityItems: jest.fn().mockResolvedValue(undefined),
  rehydrateProjectItems: jest.fn().mockResolvedValue(undefined),
  rehydrateSessionItems: jest.fn().mockResolvedValue(undefined),
}));
const mockIsStarter = jest.fn();
jest.mock('../todayStarterFeed', () => ({
  ...jest.requireActual('../todayStarterFeed'),
  isStarterFeedLearner: (...a: unknown[]) => mockIsStarter(...a),
}));

import { getTodayPage } from '../todayFeedComposer';
import { sequelize } from '../../../config/database';

const TYPES: Array<['anchored' | 'ambient', string]> = [
  ['anchored', 'announcement'], ['anchored', 'knowledge_check'], ['ambient', 'blog'], ['anchored', 'warmup'],
  ['anchored', 'video'], ['ambient', 'testimonial'], ['anchored', 'deep_dive'], ['anchored', 'video'],
  ['ambient', 'podcast'], ['anchored', 'video'], ['anchored', 'video'], ['ambient', 'blog'],
  ['anchored', 'architect_mindset'], ['anchored', 'video'],
];
let store: any[];
let inserts: number;

function seedProdLikeFeed() {
  TYPES.forEach(([kind, type], position) => {
    const card = kind === 'anchored';
    const ref = card ? `card:c${position}` : `${type}:m${position}`;
    store.push({
      position, kind, ref, provider: card ? null : type, card_id: card ? `c${position}` : null, interacted_at: null, served_at: new Date(),
      item: {
        position, kind, ref, surface: 'today', type, render_band: 'x', card_id: card ? `c${position}` : null, title: type,
        subtitle: null, description: null, image: null, video: null, blog: null, content: null, week: card ? 0 : null,
        estimated_time: 5, status: card ? 'available' : null, points: type === 'announcement' ? { learning: 0 } : { learning: 10 }, interacted: false,
      },
    });
  });
}

beforeEach(() => {
  store = [];
  inserts = 0;
  mockIsStarter.mockReset();
  jest.spyOn(sequelize, 'query').mockImplementation(((sql: unknown) => {
    const s = String(sql);
    if (s.includes('INSERT INTO today_feed_impressions')) { inserts++; return Promise.resolve([[], 0]); }
    if (s.includes('SELECT position, kind, ref, provider, card_id, item, interacted_at, served_at')) return Promise.resolve([...store]);
    return Promise.resolve([]);
  }) as never);
});

it('an Explorer before the first win gets the five starter items and no further pages', async () => {
  mockIsStarter.mockResolvedValue(true);
  seedProdLikeFeed();
  const page = await getTodayPage('enr-1', 0, 10, { seed: 12345 });
  expect(page.items.map((i) => i.type)).toEqual(['knowledge_check', 'warmup', 'video', 'testimonial', 'blog']);
  expect(page).toMatchObject({ exhausted: true, starter: true, nextCursor: 5 });
});

it('the next page is empty and materialises nothing', async () => {
  mockIsStarter.mockResolvedValue(true);
  seedProdLikeFeed();
  const page = await getTodayPage('enr-1', 5, 10);
  expect(page.items).toEqual([]);
  expect(page.exhausted).toBe(true);
  expect(inserts).toBe(0);
});

it('anyone else gets the ordinary page, unchanged', async () => {
  mockIsStarter.mockResolvedValue(false);
  seedProdLikeFeed();
  const page = await getTodayPage('enr-1', 0, 10);
  expect(page.items).toHaveLength(10);
  expect(page.items.map((i) => i.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(page.starter).toBeUndefined();
});

it('read-only "view as" shows an admin the same starter lineup the Explorer gets', async () => {
  mockIsStarter.mockResolvedValue(true);
  const page = await getTodayPage('enr-1', 0, 10, { readOnly: true });
  expect(page).toMatchObject({ starter: true, exhausted: true });
  expect(inserts).toBe(0);
});
