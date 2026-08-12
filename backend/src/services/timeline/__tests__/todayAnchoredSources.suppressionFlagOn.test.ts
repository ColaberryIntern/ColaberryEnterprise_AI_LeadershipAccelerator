/**
 * Feed Control type-level suppression — flag-ON behavior. Complements
 * todayAnchoredSources.suppressionFlagOff.test.ts (proves inert when off);
 * this file proves the suppression actually fires, correctly, for both the
 * `weekBound` and `evergreenByType` tiers, and that the in-batch running
 * counter (not just pre-existing history) caps same-type candidates within
 * one generation run.
 */
jest.mock('../timelineService', () => ({ getFeed: jest.fn() }));
jest.mock('../feedTypeExposureService', () => ({ getTypeExposureMap: jest.fn() }));
jest.mock('../feedControlService', () => ({ getRoutingMap: jest.fn() }));
jest.mock('../../../config/env', () => {
  const actual = jest.requireActual('../../../config/env');
  return { env: { ...actual.env, feedControlTypeSuppressionEnabled: true } };
});

import { gatherAnchored } from '../todayAnchoredSources';
import { getFeed } from '../timelineService';
import { getTypeExposureMap } from '../feedTypeExposureService';
import { getRoutingMap } from '../feedControlService';

const mockGetFeed = getFeed as jest.Mock;
const mockGetTypeExposureMap = getTypeExposureMap as jest.Mock;
const mockGetRoutingMap = getRoutingMap as jest.Mock;

function mkCard(id: string, type: string, week: number | null) {
  return {
    id, type, week, status: 'available', title: `t-${id}`, subtitle: null, description: null,
    image: null, type_thumbnail: null, video: null, blog: null, content: null, estimated_time: null, points: null,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('gatherAnchored — Feed Control type suppression flag ON', () => {
  it('(a) a type at its frequency cap is suppressed', async () => {
    mockGetFeed.mockResolvedValue({ is_explorer: false, cards: [mkCard('c1', 'implementation_task', 1)] });
    mockGetTypeExposureMap.mockResolvedValue(new Map([['implementation_task', { count: 3, lastShownAt: null }]]));
    mockGetRoutingMap.mockResolvedValue({ implementation_task: { feed_frequency_cap: 3 } });

    const result = await gatherAnchored('enr-1', new Set());

    expect(result.weekBound).toHaveLength(0);
  });

  it('(b) a type within its cooldown window is suppressed', async () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    mockGetFeed.mockResolvedValue({ is_explorer: false, cards: [mkCard('c1', 'implementation_task', 1)] });
    mockGetTypeExposureMap.mockResolvedValue(new Map([['implementation_task', { count: 1, lastShownAt: oneDayAgo }]]));
    mockGetRoutingMap.mockResolvedValue({ implementation_task: { feed_cooldown_days: 7 } });

    const result = await gatherAnchored('enr-1', new Set());

    expect(result.weekBound).toHaveLength(0);
  });

  it('(c) a type with no cap/cooldown routing entry is unaffected, regardless of exposure history', async () => {
    mockGetFeed.mockResolvedValue({ is_explorer: false, cards: [mkCard('c1', 'implementation_task', 1)] });
    mockGetTypeExposureMap.mockResolvedValue(new Map([['implementation_task', { count: 500, lastShownAt: new Date() }]]));
    mockGetRoutingMap.mockResolvedValue({}); // no routing entry for this type at all

    const result = await gatherAnchored('enr-1', new Set());

    expect(result.weekBound).toHaveLength(1);
  });

  it('(d) three never-before-shown same-type candidates with feed_frequency_cap: 1 yields exactly one survivor (in-batch running counter, not just pre-existing history)', async () => {
    mockGetFeed.mockResolvedValue({
      is_explorer: false,
      cards: [mkCard('c1', 'implementation_task', 1), mkCard('c2', 'implementation_task', 1), mkCard('c3', 'implementation_task', 1)],
    });
    mockGetTypeExposureMap.mockResolvedValue(new Map()); // never shown before — a stateless check alone would let all 3 through
    mockGetRoutingMap.mockResolvedValue({ implementation_task: { feed_frequency_cap: 1 } });

    const result = await gatherAnchored('enr-1', new Set());

    expect(result.weekBound).toHaveLength(1);
    expect(result.weekBound[0].ref).toBe('card:c1'); // first-eligible wins, order preserved
  });

  it('(e) an evergreenByType entry is suppressed the same way as a weekBound entry', async () => {
    mockGetFeed.mockResolvedValue({
      is_explorer: false,
      cards: [mkCard('c1', 'implementation_task', 1), mkCard('c2', 'ai_news_flash', null)],
    });
    mockGetTypeExposureMap.mockResolvedValue(new Map([
      ['implementation_task', { count: 1, lastShownAt: null }],
      ['ai_news_flash', { count: 1, lastShownAt: null }],
    ]));
    mockGetRoutingMap.mockResolvedValue({
      implementation_task: { feed_frequency_cap: 1 },
      ai_news_flash: { feed_frequency_cap: 1 },
    });

    const result = await gatherAnchored('enr-1', new Set());

    expect(result.weekBound).toHaveLength(0);
    expect(result.evergreenByType.has('ai_news_flash')).toBe(false);
  });

  it('queries exposure and routing exactly once per gatherAnchored call (no N+1)', async () => {
    mockGetFeed.mockResolvedValue({
      is_explorer: false,
      cards: [mkCard('c1', 'implementation_task', 1), mkCard('c2', 'ai_news_flash', null)],
    });
    mockGetTypeExposureMap.mockResolvedValue(new Map());
    mockGetRoutingMap.mockResolvedValue({});

    await gatherAnchored('enr-1', new Set());

    expect(mockGetTypeExposureMap).toHaveBeenCalledTimes(1);
    expect(mockGetRoutingMap).toHaveBeenCalledTimes(1);
  });
});
