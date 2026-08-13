/**
 * Today daily auto-refresh — flag-ON behavior. Complements
 * todayFeedComposer.dailyRefreshFlagOff.test.ts (proves inert when off); this file
 * proves the daily top-up actually fires, is bounded to
 * env.todayDailyRefreshTopupSize, is idempotent within the same Central day, and
 * never runs on the read-only "view as" path.
 */
// Slots round-robin across every variety key (each ambient provider + each
// evergreen type); giving every provider a generous, never-empty supply avoids
// the test being flaky/wrong depending on which key a given slot lands on.
let ambientCounter = 0;
jest.mock('../ambientPool', () => ({
  pickAmbientBatch: jest.fn((_eid: string, provider: string, n: number) =>
    Promise.resolve(Array.from({ length: n }, () => {
      const id = `${provider}-${ambientCounter++}`;
      return { provider, ref: `${provider}:${id}`, media_id: id, title: id, description: null, video: null, blog: null, image: null };
    }))),
  AMBIENT_PROVIDERS: ['blog', 'podcast', 'testimonial'],
  AMBIENT_REPEAT_COOLDOWN_DAYS: 30,
}));
jest.mock('../todayDailyRefreshService', () => ({
  isDailyRefreshDue: jest.fn(),
}));
jest.mock('../../../config/env', () => {
  const actual = jest.requireActual('../../../config/env');
  return { env: { ...actual.env, todayDailyRefreshEnabled: true, todayDailyRefreshTopupSize: 4 } };
});

function mkFixtureItem(i) {
  return {
    position: 0, kind: 'anchored', ref: `card:fixture-${i}`, surface: 'today', type: 'ai_news_flash',
    render_band: 'intel', card_id: `fixture-${i}`, title: `t${i}`, subtitle: null, description: null,
    image: null, video: null, blog: null, content: null, week: null, estimated_time: null, status: null, interacted: false,
  };
}
// A generous, non-week-bound (evergreen) supply so extendFeed's slot-filling never
// runs dry across multiple calls within one test.
const FIXTURE_POOL = Array.from({ length: 40 }, (_, i) => mkFixtureItem(i));

jest.mock('../todayAnchoredSources', () => ({
  gatherAnchored: jest.fn().mockResolvedValue({ weekBound: [], evergreenByType: new Map([['ai_news_flash', []]]) }),
  rehydrateCommunityItems: jest.fn().mockResolvedValue(undefined),
  rehydrateSessionItems: jest.fn().mockResolvedValue(undefined),
}));

import { getTodayPage } from '../todayFeedComposer';
import { isDailyRefreshDue } from '../todayDailyRefreshService';
import { gatherAnchored } from '../todayAnchoredSources';
import { sequelize } from '../../../config/database';

const mockIsDailyRefreshDue = isDailyRefreshDue as jest.Mock;
const mockGatherAnchored = gatherAnchored as jest.Mock;

let store: any[];
beforeEach(() => {
  jest.clearAllMocks();
  store = [];
  ambientCounter = 0;
  mockGatherAnchored.mockResolvedValue({ weekBound: [], evergreenByType: new Map([['ai_news_flash', [...FIXTURE_POOL]]]) });
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

function seedStore(n: number) {
  for (let i = 0; i < n; i++) {
    store.push({
      position: i, kind: 'ambient', ref: `blog:${i}`, provider: 'blog', card_id: null,
      item: { position: i, kind: 'ambient', ref: `blog:${i}`, surface: 'today', type: 'blog', render_band: 'media', card_id: null, title: `t${i}`, subtitle: null, description: null, image: null, video: null, blog: null, content: null, week: null, estimated_time: null, status: null, interacted: false },
      interacted_at: null, served_at: new Date(),
    });
  }
}

describe('getTodayPage — daily auto-refresh flag ON', () => {
  it('(a) an account whose top-up is due gets exactly one bounded extension (topupSize=4), even when the existing pool already satisfies the requested page on its own', async () => {
    seedStore(15); // >= targetEnd(10) -- the pre-existing while-loop alone would do nothing
    mockIsDailyRefreshDue.mockResolvedValue(true);

    await getTodayPage('enr-1', 0, 10);

    expect(mockIsDailyRefreshDue).toHaveBeenCalledWith('enr-1');
    expect(store.length).toBe(19); // 15 + the bounded top-up of 4, nothing more
  });

  it('(b) an account already topped up today gets no extra extension beyond what the existing loop would do anyway', async () => {
    seedStore(15);
    mockIsDailyRefreshDue.mockResolvedValue(false);

    await getTodayPage('enr-1', 0, 10);

    expect(mockIsDailyRefreshDue).toHaveBeenCalledWith('enr-1');
    expect(store.length).toBe(15); // untouched -- not due, and the existing loop needed nothing either
  });

  it('(c) readOnly calls never check or trigger a top-up', async () => {
    seedStore(15);
    mockIsDailyRefreshDue.mockResolvedValue(true);

    await getTodayPage('enr-1', 0, 10, { readOnly: true });

    expect(mockIsDailyRefreshDue).not.toHaveBeenCalled();
    expect(store.length).toBe(15); // read-only path never writes
  });

  it('(d) a brand-new account (zero prior impressions) does not error and produces a sensible page', async () => {
    mockIsDailyRefreshDue.mockResolvedValue(true);

    const page = await getTodayPage('enr-new', 0, 10);

    expect(mockIsDailyRefreshDue).toHaveBeenCalledWith('enr-new');
    expect(page.items.length).toBeGreaterThan(0);
    expect(store.length).toBeGreaterThan(0);
  });
});
