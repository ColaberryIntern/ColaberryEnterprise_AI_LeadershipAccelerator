/**
 * Today feed — an UNPUBLISHED card must not reach a student.
 *
 * THE DEFECT THIS PINS (items 1, 2 and 5 of Swati Raman's 2026-08-24 report, all
 * one cause). The Today feed is an append-only snapshot: `today_feed_impressions`
 * freezes a copy of each item and replays it forever, never re-consulting the
 * live `timeline_cards` row. Meanwhile `generatedContentRetention` flips cards
 * from `published` to `archived` on an 18-day cycle, on the assumption — written
 * into its own header comment — that "getFeed only returns visibility='published'
 * … so flipping visibility -> 'archived' is the discard". True of the Classroom,
 * which reads through `getFeed`. Never true here.
 *
 * What the student saw: the card renders, `POST /cards/:id/content` returns 200,
 * and then `dwell`, `watch` and `openCard` all 404 "Card not available" against
 * the same id in the same second. So Collect Points sat frozen at "0s of 120s"
 * through 140 seconds and fifteen heartbeats — the dwell gate could never be
 * satisfied and the button never appeared — Enter Workspace 404'd, and an
 * unpublished video card simply would not open. A read-only sweep of 40 real
 * feed items found 20 dead this way.
 *
 * The fix is on the READ side only: nothing is deleted, nothing is unpublished,
 * no impression row is removed, and no student progress or points row is touched.
 * The dead card is simply no longer SERVED, and the composer's existing backfill
 * loop replaces it with a live one.
 */
// models/index wires every Sequelize association at import time, so it has to be
// cut before TimelineCard can be replaced with a stub (same reason as
// todayAnchoredSources.cardRehydrate.test.ts).
jest.mock('../../../models/index', () => ({}));

const mockFindAll = jest.fn();
jest.mock('../../../models/TimelineCard', () => ({
  __esModule: true,
  default: { findAll: (...args: any[]) => mockFindAll(...args) },
}));

// Ambient supply is empty by default (so most tests see exactly the impressions
// they seeded) but is switchable per-test, for the backfill case below.
let ambientCounter = 0;
let ambientSupplyOn = false;
jest.mock('../ambientPool', () => ({
  pickAmbientBatch: jest.fn((_eid: string, provider: string, n: number) =>
    Promise.resolve(ambientSupplyOn
      ? Array.from({ length: n }, () => {
        const id = `${provider}-${ambientCounter++}`;
        return { provider, ref: `${provider}:${id}`, media_id: id, title: id, description: null, video: null, blog: null, image: null };
      })
      : [])),
  AMBIENT_PROVIDERS: ['blog', 'podcast', 'testimonial'],
  AMBIENT_REPEAT_COOLDOWN_DAYS: 30,
}));
jest.mock('../todayAnchoredSources', () => ({
  gatherAnchored: jest.fn().mockResolvedValue({ weekBound: [], evergreenByType: new Map() }),
  rehydrateCardItems: jest.fn().mockResolvedValue(undefined),
  rehydrateCommunityItems: jest.fn().mockResolvedValue(undefined),
  rehydrateSessionItems: jest.fn().mockResolvedValue(undefined),
}));

import { getTodayPage } from '../todayFeedComposer';
import { sequelize } from '../../../config/database';

/** A Sequelize-shaped row: the composer reads it via `.get({ plain: true })`. */
function mkCardRow(id: string, visibility: string) {
  return { get: () => ({ id, visibility }) };
}

let store: any[];

/** Seed one already-materialised, card-backed impression. */
function seedCard(position: number, cardId: string) {
  store.push({
    position,
    kind: 'anchored',
    ref: `card:${cardId}`,
    provider: null,
    card_id: cardId,
    item: {
      position, kind: 'anchored', ref: `card:${cardId}`, surface: 'class', type: 'warmup',
      render_band: 'warmup', card_id: cardId, title: `Card ${cardId}`, subtitle: null,
      description: null, image: null, video: null, blog: null, content: null,
      week: 1, estimated_time: 5, status: null, interacted: false,
    },
    interacted_at: null,
    served_at: new Date(),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  store = [];
  ambientCounter = 0;
  ambientSupplyOn = false;
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
    // timeline_card_progress (completed) and student_points_events (collected blogs)
    return Promise.resolve([] as any);
  }) as any);
});

it('drops an ARCHIVED card from the served feed while keeping the published ones', async () => {
  seedCard(0, 'card-published-a');
  seedCard(1, 'card-archived');       // what the 18-day retention job produces
  seedCard(2, 'card-published-b');
  mockFindAll.mockResolvedValue([
    mkCardRow('card-published-a', 'published'),
    mkCardRow('card-archived', 'archived'),
    mkCardRow('card-published-b', 'published'),
  ]);

  const page = await getTodayPage('enr-1', 0, 10);

  const refs = page.items.map((i) => i.ref);
  expect(refs).toEqual(['card:card-published-a', 'card:card-published-b']);
  expect(refs).not.toContain('card:card-archived');
});

it('drops draft and scheduled cards too — the rule is an allow-list, not just "not archived"', async () => {
  seedCard(0, 'card-draft');
  seedCard(1, 'card-scheduled');
  seedCard(2, 'card-live');
  mockFindAll.mockResolvedValue([
    mkCardRow('card-draft', 'draft'),
    mkCardRow('card-scheduled', 'scheduled'),
    mkCardRow('card-live', 'published'),
  ]);

  const page = await getTodayPage('enr-1', 0, 10);

  expect(page.items.map((i) => i.ref)).toEqual(['card:card-live']);
});

it('KEEPS a card whose row is absent from the lookup — absence is unknown, never a verdict', async () => {
  seedCard(0, 'card-live');
  seedCard(1, 'card-absent');
  mockFindAll.mockResolvedValue([mkCardRow('card-live', 'published')]); // 'card-absent' simply not returned

  const page = await getTodayPage('enr-1', 0, 10);

  // Deliberate, and the safer of the two readings. An earlier cut inferred
  // "missing row ⇒ unservable"; because Model.findAll routes through
  // sequelize.query, anything that perturbs that layer returns an empty set and
  // the inference wiped the whole feed — it turned todayFeedComposer.
  // suppressionSharedPath's ["card:kept"] into []. Keeping a vanished card costs
  // a 404 the student already gets; dropping a live one costs them real content.
  // Only a row that positively says "not published" may remove anything.
  expect(page.items.map((i) => i.ref)).toEqual(['card:card-live', 'card:card-absent']);
});

it('drops NOTHING when the lookup returns no rows at all, rather than emptying the feed', async () => {
  seedCard(0, 'card-a');
  seedCard(1, 'card-b');
  mockFindAll.mockResolvedValue([]);

  const page = await getTodayPage('enr-1', 0, 10);

  expect(page.items.map((i) => i.ref)).toEqual(['card:card-a', 'card:card-b']);
});

it('does NOT touch non-card items — ambient blog/podcast refs have no card_id and are unaffected', async () => {
  store.push({
    position: 0, kind: 'ambient', ref: 'blog:b1', provider: 'blog', card_id: null,
    item: { position: 0, kind: 'ambient', ref: 'blog:b1', surface: 'today', type: 'blog', render_band: 'media', card_id: null, title: 'A blog', subtitle: null, description: null, image: null, video: null, blog: null, content: null, week: null, estimated_time: null, status: null, interacted: false },
    interacted_at: null, served_at: new Date(),
  });
  seedCard(1, 'card-archived');
  mockFindAll.mockResolvedValue([mkCardRow('card-archived', 'archived')]);

  const page = await getTodayPage('enr-1', 0, 10);

  expect(page.items.map((i) => i.ref)).toEqual(['blog:b1']);
});

it('FAILS SOFT in the safe direction: if the visibility lookup throws, nothing is dropped rather than the feed emptying', async () => {
  seedCard(0, 'card-a');
  seedCard(1, 'card-b');
  mockFindAll.mockRejectedValue(new Error('connection terminated'));

  const page = await getTodayPage('enr-1', 0, 10);

  // A database blip must degrade to the OLD behaviour (possibly serving a dead
  // card), never to an empty Today page. Dropping everything on error would turn
  // a transient fault into a total outage of the student's landing surface.
  expect(page.items.map((i) => i.ref)).toEqual(['card:card-a', 'card:card-b']);
});

it('asks for visibility in ONE batched query, not per card', async () => {
  seedCard(0, 'c1'); seedCard(1, 'c2'); seedCard(2, 'c3');
  mockFindAll.mockResolvedValue([mkCardRow('c1', 'published'), mkCardRow('c2', 'published'), mkCardRow('c3', 'published')]);

  await getTodayPage('enr-1', 0, 10);

  expect(mockFindAll).toHaveBeenCalledTimes(1);
  const arg = mockFindAll.mock.calls[0][0];
  expect(arg.where.id.sort()).toEqual(['c1', 'c2', 'c3']);
  expect(arg.attributes).toContain('visibility');
});

it('BACKFILLS the gap: dropping dead cards must not hand the student a shorter page', async () => {
  // The half-fixed version of this change is arguably worse than the bug: if
  // dropping 20 dead items just made the feed 20 items shorter, we would have
  // traded a broken card for a thinner Today page. buildServed runs BEFORE the
  // composer's top-up loop, whose condition is on the count of SURVIVING items,
  // so the gap refills from live content.
  for (let i = 0; i < 12; i++) seedCard(i, `card-dead-${i}`);
  mockFindAll.mockImplementation(({ where }: any) =>
    Promise.resolve((where.id as string[]).map((id) => mkCardRow(id, 'archived'))));
  ambientSupplyOn = true;

  const page = await getTodayPage('enr-1', 0, 10);

  expect(page.items).toHaveLength(10);                                  // a full page, not 0
  expect(page.items.every((i) => !i.ref.startsWith('card:card-dead'))).toBe(true);
});

it('leaves the impression rows themselves ALONE — the append-only log is never rewritten or deleted', async () => {
  seedCard(0, 'card-archived');
  seedCard(1, 'card-live');
  mockFindAll.mockResolvedValue([mkCardRow('card-archived', 'archived'), mkCardRow('card-live', 'published')]);
  const before = JSON.stringify(store);

  await getTodayPage('enr-1', 0, 10);

  // The fix is read-side only. Nothing is unpublished, deleted, or migrated;
  // if a card is re-published it reappears on the next page load by itself.
  expect(JSON.stringify(store)).toBe(before);
});
