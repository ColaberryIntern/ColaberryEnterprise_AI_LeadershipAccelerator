/**
 * Today feed — a COLLECTED podcast or testimonial leaves the timeline for ever.
 *
 * Ali, 2026-09-11, answering the open question on #2456: "collected podcast
 * should be removed from the timeline for ever."
 *
 * THE DEFECT THIS PINS. The feed is an append-only snapshot; serve-time filters
 * decide what a frozen impression row still shows. Before this change those
 * filters knew three things: completed CARDS (progress rows), collected BLOGS
 * (`collectedBlogRefs`, keyed on the `blog:<id>` points event), and snapshots
 * marked completed. Nothing looked at `podcast:<id>` / `testimonial:<id>` — so a
 * collected episode vanished for the session (the tile removes itself) and came
 * straight back on the next page load, badge and Collect button intact.
 *
 * Two changes, both read-side:
 *   1. The serve filter covers every ref-keyed collectible (blog, podcast,
 *      testimonial) — the points event and the impression share the exact string.
 *   2. Generation excludes collected media ids for good, so the pool's
 *      least-recently-seen recycling stops re-placing episodes the serve filter
 *      would only drop again (a slot nobody can see).
 */
jest.mock('../../../models/index', () => ({}));

const mockFindAll = jest.fn();
jest.mock('../../../models/TimelineCard', () => ({
  __esModule: true,
  default: { findAll: (...args: any[]) => mockFindAll(...args) },
}));

let ambientCounter = 0;
let ambientSupplyOn = false;
const mockPick = jest.fn((_eid: string, provider: string, n: number, _exclude: string[]) =>
  Promise.resolve(ambientSupplyOn
    ? Array.from({ length: n }, () => {
      const id = `${provider}-${ambientCounter++}`;
      return { provider, ref: `${provider}:${id}`, media_id: id, title: id, description: null, video: null, blog: null, image: null };
    })
    : []));
jest.mock('../ambientPool', () => ({
  pickAmbientBatch: (...args: any[]) => (mockPick as any)(...args),
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

import { getTodayPage } from '../todayFeedComposer';
import { sequelize } from '../../../config/database';

let store: any[];
/** Points-event keys on record for the enrollment — what a collect writes. */
let collected: string[];
let pointsLookupThrows = false;

const DAY = 86_400_000;

/** Seed one already-materialised ambient impression. */
function seedAmbient(position: number, provider: 'blog' | 'podcast' | 'testimonial', id: string, servedAt = new Date()) {
  const ref = `${provider}:${id}`;
  store.push({
    position, kind: 'ambient', ref, provider, card_id: null,
    item: {
      position, kind: 'ambient', ref, surface: 'today', type: provider, render_band: 'media', card_id: null,
      title: id, subtitle: null, description: null, image: null, video: null, blog: null, content: null,
      week: null, estimated_time: null, status: null, points: null, interacted: false,
    },
    interacted_at: null, served_at: servedAt,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  store = [];
  collected = [];
  pointsLookupThrows = false;
  ambientCounter = 0;
  ambientSupplyOn = false;
  mockFindAll.mockResolvedValue([]);
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
    if (s.includes('FROM student_points_events')) {
      if (pointsLookupThrows) return Promise.reject(new Error('connection terminated'));
      const keys: string[] | undefined = (opts as any).replacements?.keys;
      // Serve-time form restricts to the placed refs (IN); generation form asks
      // for every collected ref by prefix (LIKE). Both read the same table.
      const rows = keys ? collected.filter((k) => keys.includes(k)) : collected;
      return Promise.resolve(rows.map((event_key) => ({ event_key })) as any);
    }
    return Promise.resolve([] as any);   // timeline_card_progress etc.
  }) as any);
});

it('drops a COLLECTED podcast from the served feed and keeps the uncollected one', async () => {
  seedAmbient(0, 'podcast', 'ep-collected');
  seedAmbient(1, 'podcast', 'ep-fresh');
  collected = ['podcast:ep-collected'];

  const page = await getTodayPage('enr-1', 0, 10);

  expect(page.items.map((i) => i.ref)).toEqual(['podcast:ep-fresh']);
});

it('drops a collected TESTIMONIAL the same way, and still drops a collected BLOG (no regression)', async () => {
  seedAmbient(0, 'testimonial', 't-collected');
  seedAmbient(1, 'testimonial', 't-fresh');
  seedAmbient(2, 'blog', 'b-collected');
  seedAmbient(3, 'blog', 'b-fresh');
  collected = ['testimonial:t-collected', 'blog:b-collected'];

  const page = await getTodayPage('enr-1', 0, 10);

  expect(page.items.map((i) => i.ref)).toEqual(['testimonial:t-fresh', 'blog:b-fresh']);
});

it('stays gone on the NEXT page load — the frozen impression row is filtered every serve, not just once', async () => {
  seedAmbient(0, 'podcast', 'ep-collected');
  seedAmbient(1, 'podcast', 'ep-fresh');
  collected = ['podcast:ep-collected'];

  const first = await getTodayPage('enr-1', 0, 10);
  const second = await getTodayPage('enr-1', 0, 10);

  expect(first.items.map((i) => i.ref)).toEqual(['podcast:ep-fresh']);
  expect(second.items.map((i) => i.ref)).toEqual(['podcast:ep-fresh']);
  // The row itself is untouched: read-side only, the append-only log is never rewritten.
  expect(store.map((r) => r.ref)).toContain('podcast:ep-collected');
});

it('never re-PLACES a collected episode, even after the repeat cooldown has expired', async () => {
  // Served 40 days ago — outside the 30-day cooldown — so the old logic would
  // have let the least-recently-seen picker hand it straight back.
  seedAmbient(0, 'podcast', 'ep-collected', new Date(Date.now() - 40 * DAY));
  collected = ['podcast:ep-collected'];
  ambientSupplyOn = true;

  const page = await getTodayPage('enr-1', 0, 10);

  const podcastPicks = mockPick.mock.calls.filter((c) => c[1] === 'podcast');
  expect(podcastPicks.length).toBeGreaterThan(0);
  for (const call of podcastPicks) expect(call[3]).toContain('ep-collected');   // exclusion list handed to the pool
  expect(page.items.map((i) => i.ref)).not.toContain('podcast:ep-collected');
});

it('FAILS SOFT: if the points lookup throws, nothing is dropped rather than the feed emptying', async () => {
  seedAmbient(0, 'podcast', 'ep-a');
  seedAmbient(1, 'testimonial', 't-a');
  collected = ['podcast:ep-a'];
  pointsLookupThrows = true;

  const page = await getTodayPage('enr-1', 0, 10);

  // A database blip degrades to the old behaviour (a collected item shows once
  // more, its Collect is idempotent and pays nothing) — never to an empty page.
  expect(page.items.map((i) => i.ref)).toEqual(['podcast:ep-a', 'testimonial:t-a']);
});

it('ignores points events that are not ref-keyed ambient collects (card completions, streaks)', async () => {
  seedAmbient(0, 'podcast', 'ep-a');
  collected = ['card:ep-a', 'streak:2026-09-11', 'ep-a'];   // none of these is the impression ref

  const page = await getTodayPage('enr-1', 0, 10);

  expect(page.items.map((i) => i.ref)).toEqual(['podcast:ep-a']);
});
