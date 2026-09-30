/**
 * Feed Control type-level suppression — flag-off regression baseline.
 * `env.feedControlTypeSuppressionEnabled` defaults false everywhere including
 * production; this proves gatherAnchored() is byte-identical to
 * pre-suppression behavior even when the exposure/routing data would
 * suppress every candidate if the flag were honored, and that no exposure/
 * routing query is even issued when the flag is off (matching the repo's
 * flag-off-is-truly-inert convention, see todayFeedComposer.capeFlagOff.test.ts).
 */
jest.mock('../timelineService', () => ({ getFeed: jest.fn() }));
jest.mock('../feedTypeExposureService', () => ({ getTypeExposureMap: jest.fn() }));
jest.mock('../feedControlService', () => ({ getRoutingMap: jest.fn() }));

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

describe('gatherAnchored — Feed Control type suppression flag OFF (default)', () => {
  it('keeps every eligible candidate even when exposure/routing would suppress all of them if the flag were on, and never queries exposure/routing at all', async () => {
    mockGetFeed.mockResolvedValue({
      is_explorer: false,
      cards: [mkCard('c1', 'implementation_task', 1), mkCard('c2', 'ai_news_flash', null)],
    });
    mockGetTypeExposureMap.mockResolvedValue(new Map([
      ['implementation_task', { count: 99, lastShownAt: new Date() }],
      ['ai_news_flash', { count: 99, lastShownAt: new Date() }],
    ]));
    mockGetRoutingMap.mockResolvedValue({
      implementation_task: { feed_frequency_cap: 1 },
      ai_news_flash: { feed_frequency_cap: 1 },
    });

    const result = await gatherAnchored('enr-1', new Set());

    expect(result.weekBound).toHaveLength(1);
    expect(result.weekBound[0].ref).toBe('card:c1');
    expect(result.evergreenByType.get('ai_news_flash')).toHaveLength(1);
    expect(mockGetTypeExposureMap).not.toHaveBeenCalled();
    expect(mockGetRoutingMap).not.toHaveBeenCalled();
  });
});
