/**
 * Serve-time re-hydration of class curriculum (`card:`) items.
 *
 * Reproduces the defect found on prod 2026-08-13: the Self Study readings for
 * weeks 2-12 were re-authored directly in timeline_cards, and the card detail
 * view picked the new content up immediately (runtimeController →
 * ensureFreshContent loads live by id), but 14 already-placed
 * today_feed_impressions rows kept serving a frozen pre-rewrite snapshot. The
 * Today feed is an append-only snapshot store, and `card:` was the only anchored
 * kind with no serve-time refresh — community and session items already had one.
 *
 * These tests pin the behaviour that closes that split.
 */
// models/index wires every Sequelize association at import time, so it has to be
// cut before TimelineCard can be replaced with a stub (the import chain reaches
// it via timelineService → networkVideoService → variableService). The real
// contentFromMetadata is deliberately left unmocked so these tests exercise the
// actual content deriver rather than a copy of it.
jest.mock('../../../models/index', () => ({}));

const mockFindAll = jest.fn();
jest.mock('../../../models/TimelineCard', () => ({
  __esModule: true,
  default: { findAll: (...args: any[]) => mockFindAll(...args) },
}));

import { rehydrateCardItems, cardFieldsFromRow } from '../todayAnchoredSources';

function mkCardItem(overrides: Partial<any> = {}): any {
  return {
    position: 0, kind: 'anchored', ref: 'card:c1', surface: 'class', type: 'warmup',
    render_band: 'warmup', card_id: 'c1', title: 'Self Study', subtitle: null,
    description: null, image: null, video: null, blog: null,
    content: { title: 'OLD title', body_html: '<p>OLD body</p>' },
    week: 2, estimated_time: 5, status: null, interacted: false,
    ...overrides,
  };
}

function mkRow(id: string, overrides: Partial<any> = {}) {
  const plain = {
    id,
    title: 'Self Study',
    subtitle: null,
    description: null,
    estimated_time: 12,
    metadata: { content: { title: 'NEW title', body_html: '<p>NEW body</p>' }, locked: true },
    ...overrides,
  };
  return { get: () => plain };
}

beforeEach(() => jest.clearAllMocks());

describe('cardFieldsFromRow', () => {
  it('derives content from the row metadata blob', () => {
    const f = cardFieldsFromRow({
      title: 'T', subtitle: 'S', description: 'D', estimated_time: 9,
      metadata: { content: { title: 'CT', body_html: '<p>B</p>' } },
    });
    expect(f).toEqual({
      title: 'T', subtitle: 'S', description: 'D', estimated_time: 9,
      content: { title: 'CT', body_html: '<p>B</p>' },
    });
  });

  it('yields null content when the row has no saved content', () => {
    expect(cardFieldsFromRow({ title: 'T', metadata: {} }).content).toBeNull();
    expect(cardFieldsFromRow({ title: 'T', metadata: null }).content).toBeNull();
  });
});

describe('rehydrateCardItems', () => {
  it('replaces a stale snapshot body with the live row content', async () => {
    mockFindAll.mockResolvedValue([mkRow('c1')]);
    const items = [mkCardItem()];

    await rehydrateCardItems(items);

    expect(items[0].content).toEqual({ title: 'NEW title', body_html: '<p>NEW body</p>' });
    expect(items[0].estimated_time).toBe(12);
  });

  it('picks up a retitled card (the week 12 case)', async () => {
    mockFindAll.mockResolvedValue([
      mkRow('c1', { title: 'Self Study - Capstone + Architect Expo' }),
    ]);
    const items = [mkCardItem({ title: 'Self Study - Design AI That Scales' })];

    await rehydrateCardItems(items);

    expect(items[0].title).toBe('Self Study - Capstone + Architect Expo');
  });

  it('does not touch per-student or placement fields', async () => {
    mockFindAll.mockResolvedValue([mkRow('c1')]);
    const items = [mkCardItem({ status: 'in_progress', interacted: true, position: 7, week: 2 })];

    await rehydrateCardItems(items);

    expect(items[0].status).toBe('in_progress');
    expect(items[0].interacted).toBe(true);
    expect(items[0].position).toBe(7);
    expect(items[0].week).toBe(2);
    expect(items[0].card_id).toBe('c1');
  });

  it('batches one query for many items and dedupes repeated card ids', async () => {
    mockFindAll.mockResolvedValue([mkRow('c1'), mkRow('c2')]);
    const items = [
      mkCardItem({ ref: 'card:c1', card_id: 'c1' }),
      mkCardItem({ ref: 'card:c2', card_id: 'c2' }),
      mkCardItem({ ref: 'card:c1', card_id: 'c1', position: 3 }),
    ];

    await rehydrateCardItems(items);

    expect(mockFindAll).toHaveBeenCalledTimes(1);
    expect(mockFindAll.mock.calls[0][0].where.id.sort()).toEqual(['c1', 'c2']);
  });

  it('ignores non-card items and skips the query entirely when there are none', async () => {
    const items = [
      { ref: 'community:p1', card_id: null, content: null } as any,
      { ref: 'blog:b1', card_id: null, content: null } as any,
    ];

    await rehydrateCardItems(items);

    expect(mockFindAll).not.toHaveBeenCalled();
  });

  it('leaves an item untouched when its card row is gone', async () => {
    mockFindAll.mockResolvedValue([]);
    const items = [mkCardItem()];

    await rehydrateCardItems(items);

    expect(items[0].content).toEqual({ title: 'OLD title', body_html: '<p>OLD body</p>' });
  });

  it('is fail-soft: a DB error leaves the snapshot intact and does not throw', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFindAll.mockRejectedValue(new Error('connection lost'));
    const items = [mkCardItem()];

    await expect(rehydrateCardItems(items)).resolves.toBeUndefined();

    expect(items[0].content).toEqual({ title: 'OLD title', body_html: '<p>OLD body</p>' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is idempotent — a second pass over fresh items changes nothing', async () => {
    mockFindAll.mockResolvedValue([mkRow('c1')]);
    const items = [mkCardItem()];

    await rehydrateCardItems(items);
    const afterFirst = JSON.parse(JSON.stringify(items));
    await rehydrateCardItems(items);

    expect(items).toEqual(afterFirst);
  });
});
