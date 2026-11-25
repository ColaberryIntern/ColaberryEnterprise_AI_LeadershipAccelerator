import { WeeklyLiveDemand } from '../../../../models/WeeklyLive';
import { ANGLES, channelMedian, demandScore, latestDemand, measureWeek, runDemand } from '../demandJob';
import { median, parseAgeDays, parseVideos, parseViews, parseWatchViews, type Video } from '../youtubePages';

/** WL3.2: parser fixtures, median math, thin flag, cache, and a failed week reported instead of guessed. */
const wrap = (data: unknown) => `<script>var ytInitialData = ${JSON.stringify(data)};</script>`;
const hit = (id: string, title: string, views: string, age: string, handle = '@chan') => ({ videoRenderer: {
  videoId: id, title: { runs: [{ text: title }] }, viewCountText: { simpleText: views }, publishedTimeText: { simpleText: age },
  ownerText: { runs: [{ text: 'Chan', navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: `/${handle}` } } }] } } });
const upload = (id: string, label: string, age: string) => ({ lockupViewModel: { contentId: id, metadata: { lockupMetadataViewModel: { title: { content: `Upload ${id}` },
  metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: '1K' }, accessibilityLabel: label }, { text: { content: age } }] }] } } } } } });
const vid = (views: number | null, ageDays: number | null): Video => ({ id: 'x', title: 't', channel: '', handle: '', views, ageDays });
afterEach(() => jest.restoreAllMocks());

it('parses view counts and ages', () => {
  expect([parseViews('1.2M views'), parseViews('18 thousand views'), parseViews('134,322 views'), parseViews('No views'), parseViews('Live')]).toEqual([1_200_000, 18_000, 134_322, 0, null]);
  expect([parseAgeDays('12 days ago'), parseAgeDays('2w ago'), parseAgeDays('3 months ago'), parseAgeDays('5 minutes ago'), parseAgeDays('1mo ago'), parseAgeDays('')]).toEqual([12, 14, 90, 0, 30, null]);
  expect(parseWatchViews('"viewCount":"234461"')).toBe(234461);
});

it('parses search and channel pages, and throws when the page carries no data', () => {
  expect(parseVideos(wrap({ a: [hit('v1', 'MCP Explained', '639,144 views', '2 weeks ago')] }))).toEqual([{ id: 'v1', title: 'MCP Explained', channel: 'Chan', handle: '@chan', views: 639144, ageDays: 14 }]);
  expect(parseVideos(wrap({ a: [upload('u1', '84 thousand views', '3 weeks ago')] }))[0]).toMatchObject({ id: 'u1', views: 84000, ageDays: 21 });
  expect(() => parseVideos('<html>consent</html>')).toThrow(/no data/);
});

it('median of even, odd and empty lists', () => {
  expect([median([3, 1, 2]), median([4, 1, 3, 2]), median([]), median([null, 5])]).toEqual([2, 3, null, 5]);
});

it('the channel median uses the 10 latest uploads 14 or more days old, and flags fewer than 10', () => {
  const ten = Array.from({ length: 12 }, (_, i) => vid(100 + i, 20 + i));
  expect(channelMedian([vid(1, 2), vid(1, 13), ...ten])).toEqual({ value: 105, thin: false });
  expect(channelMedian(ten.slice(0, 6))).toEqual({ value: 103, thin: true });
  expect(channelMedian([vid(9, 1)])).toEqual({ value: null, thin: true });
});

it.each([[3, true, 5], [3, false, 4], [2.9, true, 3], [1, true, 3], [0.8, true, 1], [null, true, 2]])('score for %s exact=%s is %s', (m, e, s) => { expect(demandScore(m as number | null, e as boolean)).toBe(s); });

it('measureWeek picks the best video and uses the exact watch-page count', async () => {
  const get = async (url: string) => {
    if (url.includes('/results')) return wrap({ a: [hit('old', 'MCP old', '9M views', '5 months ago'), hit('v1', 'MCP Explained', '600K views', '2 weeks ago'), hit('v2', 'Other thing', '700K views', '1 week ago')] });
    if (url.includes('/watch')) return url.endsWith('v1') ? '"viewCount":"639144"' : '"viewCount":"700000"';
    return wrap({ a: Array.from({ length: 10 }, (_, i) => upload(`u${i}`, '84 thousand views', '3 weeks ago')) });
  };
  expect(await measureWeek(5, get)).toMatchObject({ week: 5, video_url: 'https://www.youtube.com/watch?v=v1', views: 639144, channel_median: 84000, multiple: 7.6, score: 5, thin_median: false });
});

it('nothing in 90 days scores 1 with no video', async () => {
  expect(await measureWeek(5, async () => wrap({ a: [hit('old', 'MCP', '9M views', '5 months ago')] }))).toMatchObject({ video_url: null, score: 1 });
});

describe('runDemand', () => {
  let upsert: jest.SpyInstance;
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined); jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    upsert = jest.spyOn(WeeklyLiveDemand, 'upsert').mockResolvedValue([] as never);
  });
  it('skips weeks measured in the last 7 days and spaces every request', async () => {
    const find = jest.spyOn(WeeklyLiveDemand, 'findAll').mockResolvedValue([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((week) => ({ week })) as never);
    const pause = jest.fn().mockResolvedValue(undefined); const get = jest.fn().mockResolvedValue(wrap({ a: [] }));
    const r = await runDemand({ get, pause, today: '2026-11-24' });
    expect(r).toEqual({ measured: [12], cached: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], failed: [] });
    expect(get).toHaveBeenCalledTimes(6); // two queries, each unfiltered, this month and this year
    expect(pause).toHaveBeenCalledTimes(6);
    expect(JSON.stringify((find.mock.calls[0][0] as { where: { error: null } }).where.error)).toBe('null');
  });
  it('a failed week is stored with its error and no score; the rest continue', async () => {
    jest.spyOn(WeeklyLiveDemand, 'findAll').mockResolvedValue([] as never);
    const get = jest.fn().mockRejectedValueOnce(Object.assign(new Error('YouTube HTTP 429'), { status: 429 })).mockResolvedValue(wrap({ a: [] }));
    const r = await runDemand({ get, pause: async () => undefined, today: '2026-11-24' });
    expect(r.failed).toEqual([1]);
    expect(r.measured).toHaveLength(11);
    expect(upsert.mock.calls[0][0]).toMatchObject({ week: 1, score: null, views: null, error: expect.stringContaining('429') });
  });
});

it('latestDemand prefers the newest good row over a newer error', async () => {
  jest.spyOn(WeeklyLiveDemand, 'findAll').mockResolvedValue([{ week: 1, error: 'x', measured_at: '2026-11-24' }, { week: 1, error: null, measured_at: '2026-11-16' }, { week: 2, error: 'y', measured_at: '2026-11-24' }] as never);
  expect((await latestDemand()).map((r) => [r.week, r.error])).toEqual([[1, null], [2, 'y']]);
});

it('every one of the 12 weeks has an angle', () => { expect(Object.keys(ANGLES).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); });
