/**
 * C107 (C98 recommendation 1): before the first win an Explorer's Today feed is five starter items.
 * The fixture below is the real first-14 lineup of a new Explorer on production (3 Nov 2026), reduced to the fields
 * the picker reads, so the test pins what a real learner gets rather than what the picker would like to see.
 */
const mockIsFreePreviewTier = jest.fn();
const mockHasFirstWin = jest.fn();
jest.mock('../../access/contentEntitlement', () => ({ isFreePreviewTier: (...a: unknown[]) => mockIsFreePreviewTier(...a) }));
jest.mock('../../explorerFirstWin', () => ({ hasFirstWin: (...a: unknown[]) => mockHasFirstWin(...a) }));

import { env } from '../../../config/env';
import { pickStarterItems, isStarterFeedLearner, STARTER_FEED_SIZE } from '../todayStarterFeed';
import type { TodayFeedItem } from '../todayFeedTypes';

function item(position: number, kind: 'anchored' | 'ambient', type: string, extra: Partial<TodayFeedItem> = {}): TodayFeedItem {
  const isCard = kind === 'anchored';
  return {
    position, kind, type, ref: isCard ? `card:c${position}` : `${type}:m${position}`, surface: 'today', render_band: 'x',
    card_id: isCard ? `c${position}` : null, title: `${type} ${position}`, subtitle: null, description: null, image: null,
    video: null, blog: null, content: null, week: isCard ? 0 : null, estimated_time: 5, status: isCard ? 'available' : null,
    points: isCard ? { learning: 10 } : null, interacted: false, ...extra,
  };
}

/** Production, 3 Nov 2026: positions 0-13 of a new Explorer's feed. */
const PROD_FIRST_14: TodayFeedItem[] = [
  item(0, 'anchored', 'announcement', { points: { learning: 0, builder: 0, community: 0 } }),
  item(1, 'anchored', 'knowledge_check', { points: { learning: 10, builder: 5 } }),
  item(2, 'ambient', 'blog', { points: { learning: 10 } }),
  item(3, 'anchored', 'warmup', { points: { learning: 10 } }),
  item(4, 'anchored', 'video', { points: { learning: 5 }, estimated_time: 4 }),
  item(5, 'ambient', 'testimonial'),
  item(6, 'anchored', 'deep_dive', { points: { learning: 15 } }),
  item(7, 'anchored', 'video', { points: { learning: 15 }, estimated_time: 12 }),
  item(8, 'ambient', 'podcast'),
  item(9, 'anchored', 'video', { estimated_time: 9 }),
  item(10, 'anchored', 'video', { estimated_time: 3 }),
  item(11, 'ambient', 'blog'),
  item(12, 'anchored', 'architect_mindset'),
  item(13, 'anchored', 'video', { estimated_time: null }),
];

describe('pickStarterItems', () => {
  it('turns a real 14-item first page into the five starter slots, in slot order', () => {
    const picked = pickStarterItems(PROD_FIRST_14);
    expect(picked.map((i) => `${i.type}@${i.position}`)).toEqual([
      'knowledge_check@1', // the first lesson: earliest point-bearing card, not the 0-point welcome announcement
      'warmup@3',
      'video@10', // the SHORTEST video (3 min), not the first one placed
      'testimonial@5',
      'blog@2',
    ]);
    expect(picked).toHaveLength(STARTER_FEED_SIZE);
  });

  it('gives the same lineup whatever order the visit shuffle served them in', () => {
    const shuffled = [...PROD_FIRST_14].reverse();
    expect(pickStarterItems(shuffled).map((i) => i.ref)).toEqual(pickStarterItems(PROD_FIRST_14).map((i) => i.ref));
  });

  it('prefers a lesson already in progress over the earliest one', () => {
    const feed = PROD_FIRST_14.map((i) => (i.position === 6 ? { ...i, status: 'in_progress' } : i));
    expect(pickStarterItems(feed)[0].position).toBe(6);
  });

  it('skips a slot it cannot fill instead of inventing an item', () => {
    const noAmbient = PROD_FIRST_14.filter((i) => i.kind === 'anchored');
    expect(pickStarterItems(noAmbient).map((i) => i.type)).toEqual(['knowledge_check', 'warmup', 'video']);
  });

  it('returns nothing for an empty feed', () => {
    expect(pickStarterItems([])).toEqual([]);
  });

  it('never offers a completed card, a podcast, or a 0-point card as a slot', () => {
    const feed = PROD_FIRST_14.map((i) => (i.position === 1 ? { ...i, status: 'completed' } : i));
    const picked = pickStarterItems(feed);
    expect(picked.map((i) => i.position)).not.toContain(1);
    expect(picked[0].type).toBe('deep_dive');
    expect(picked.map((i) => i.type)).not.toContain('podcast');
    expect(picked.map((i) => i.type)).not.toContain('announcement');
  });

  it('never returns the same ref twice and never more than five', () => {
    const doubled = [...PROD_FIRST_14, ...PROD_FIRST_14];
    const refs = pickStarterItems(doubled).map((i) => i.ref);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs.length).toBeLessThanOrEqual(STARTER_FEED_SIZE);
  });
});

describe('isStarterFeedLearner', () => {
  const original = env.todayExplorerStarterFeed;
  beforeEach(() => {
    mockIsFreePreviewTier.mockReset();
    mockHasFirstWin.mockReset();
    (env as { todayExplorerStarterFeed: boolean }).todayExplorerStarterFeed = true;
  });
  afterAll(() => { (env as { todayExplorerStarterFeed: boolean }).todayExplorerStarterFeed = original; });

  it('is true for an Explorer with no first win', async () => {
    mockIsFreePreviewTier.mockResolvedValue(true);
    mockHasFirstWin.mockResolvedValue(false);
    await expect(isStarterFeedLearner('e1')).resolves.toBe(true);
  });

  it('is false once the Explorer has a first win', async () => {
    mockIsFreePreviewTier.mockResolvedValue(true);
    mockHasFirstWin.mockResolvedValue(true);
    await expect(isStarterFeedLearner('e1')).resolves.toBe(false);
  });

  it('is false when the first-win read failed (null = unknown keeps the full feed)', async () => {
    mockIsFreePreviewTier.mockResolvedValue(true);
    mockHasFirstWin.mockResolvedValue(null);
    await expect(isStarterFeedLearner('e1')).resolves.toBe(false);
  });

  it('is false for a member who is not an Explorer', async () => {
    mockIsFreePreviewTier.mockResolvedValue(false);
    mockHasFirstWin.mockResolvedValue(false);
    await expect(isStarterFeedLearner('e1')).resolves.toBe(false);
  });

  it('is false with the kill switch off, without reading anything', async () => {
    (env as { todayExplorerStarterFeed: boolean }).todayExplorerStarterFeed = false;
    await expect(isStarterFeedLearner('e1')).resolves.toBe(false);
    expect(mockIsFreePreviewTier).not.toHaveBeenCalled();
    expect(mockHasFirstWin).not.toHaveBeenCalled();
  });
});
