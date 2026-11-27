import { WeeklyLiveDemand } from '../../../../models/WeeklyLive';
import { ANGLES, channelMedian, isLesson, demandScore, latestDemand, measureWeek, runDemand } from '../demandJob';
import { channelUploads, isEnglish, median, searchIds, videosById, type ApiGet, type Video } from '../youtubeApi';

/** WL3.2: API replies, median math, thin flag, cache, and a failed week reported instead of guessed. */
const NOW = Date.parse('2026-11-25T12:00:00Z');
const item = (id: string, title: string, views: string | undefined, ageDays: number, duration = 'PT10M', channelId = 'UCchan') => ({ id,
  snippet: { title, channelTitle: 'Chan', channelId, publishedAt: new Date(NOW - ageDays * 86_400_000).toISOString() },
  statistics: views === undefined ? {} : { viewCount: views }, contentDetails: { duration } });
const vid = (views: number | null, ageDays: number): Video => ({ id: 'x', title: 't', channel: '', channelId: '', views, ageDays, seconds: 600, english: true });
/** A fake API over fixed videos: search returns `found`, the channel's uploads are `uploads`. */
const api = (found: ReturnType<typeof item>[], uploads: ReturnType<typeof item>[] = []): ApiGet => async (path, p) => {
  if (path === 'search') return { items: found.map((v) => ({ id: { videoId: v.id } })) };
  if (path === 'playlistItems') return { items: uploads.map((v) => ({ contentDetails: { videoId: v.id } })) };
  return { items: [...found, ...uploads].filter((v) => p.id.split(',').includes(v.id)) };
};
afterEach(() => jest.restoreAllMocks());

it('reads videos: exact views, age in days, Shorts dropped, a hidden count is null', async () => {
  const got = await videosById(['a', 's', 'h'], api([item('a', 'MCP Explained', '639144', 14), item('s', 'short', '9', 1, 'PT3M'), item('h', 'hidden', undefined, 1)]), NOW);
  expect(got.map((v) => [v.id, v.views, v.ageDays])).toEqual([['a', 639144, 14], ['h', null, 1]]);
});
it('asks for ids 50 at a time, and searches only the last 90 days', async () => {
  const get = jest.fn().mockResolvedValue({ items: [] });
  await videosById(Array.from({ length: 101 }, (_, i) => `v${i}`), get, NOW);
  expect(get).toHaveBeenCalledTimes(3);
  await searchIds(['mcp'], 90, get, NOW);
  expect(get).toHaveBeenLastCalledWith('search', expect.objectContaining({ publishedAfter: '2026-08-27T12:00:00.000Z', q: 'mcp' }));
});
it('reads the uploads playlist, newest first', async () => {
  const get = jest.fn(api([], [item('old', 'o', '1', 30), item('new', 'n', '2', 2)]));
  expect((await channelUploads('UCabc', get, NOW)).map((v) => v.id)).toEqual(['new', 'old']);
  expect(get.mock.calls[0][1].playlistId).toBe('UUabc');
});
it('a reply without a list is a failure, not an empty answer', async () => {
  await expect(searchIds(['mcp'], 90, async () => ({ error: 'x' }), NOW)).rejects.toMatchObject({ name: 'ContractViolation' });
});
it.each([[2, 'Everything You Know About Skills IS OUTDATED', true], [2, 'Make Shorts with Claude (Skill)', false], [10, 'Human in the Loop Is Not a Governance Strategy', true],
  [10, 'AI Governance: How Business Can Adopt AI Safely', false], [1, 'Fable 5.2 or Opus? When to use each model in Claude Code', false], [1, 'Claude Code for Beginners', true],
  [6, 'MCP Explained Simply', false], [6, 'Build an MCP Server', true]])('week %s: %s is on the exact angle: %s', (w, title, yes) => { expect(ANGLES[w as number].exact.test(title as string)).toBe(yes); });

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

it('measureWeek picks the most viewed video on the exact angle over a bigger one off it', async () => {
  const found = [item('v1', 'MCP Explained', '639144', 14), item('v2', 'Other thing', '700000', 7)];
  expect(await measureWeek(5, api(found, Array.from({ length: 10 }, (_, i) => item(`u${i}`, 'up', '84000', 21))), NOW))
    .toMatchObject({ week: 5, video_url: 'https://www.youtube.com/watch?v=v1', views: 639144, channel_median: 84000, multiple: 7.6, score: 5, thin_median: false });
});

it('a video another week uses, or one not in English, is not picked', async () => {
  const found = [item('v1', 'MCP Explained', '900000', 5), item('v2', 'MCP in Malayalam', '800000', 5), item('v3', 'MCP basics', '10000', 5)];
  const r = await measureWeek(5, api(found, Array.from({ length: 10 }, (_, i) => item(`u${i}`, 'up', '9000', 21))), NOW, new Set(['v1']));
  expect(r.video_url).toContain('v3');
});
it.each([[{ defaultAudioLanguage: 'ml' }, false], [{ defaultAudioLanguage: 'en-US' }, true], [{ defaultLanguage: 'hi' }, false], [{ defaultAudioLanguage: 'en', defaultLanguage: 'hi' }, true],
  [{}, true], [{ channelTitle: 'Brototype Malayalam' }, false], [{ title: 'MCP क्या है' }, false]])('%j in English: %s', (s, yes) => {
  expect(isEnglish({ title: 'MCP', channelTitle: 'C', ...(s as object) })).toBe(yes);
});

it('nothing found scores 1 with no video', async () => {
  expect(await measureWeek(5, api([]), NOW)).toMatchObject({ video_url: null, score: 1 });
});

describe('runDemand', () => {
  let upsert: jest.SpyInstance;
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined); jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    upsert = jest.spyOn(WeeklyLiveDemand, 'upsert').mockResolvedValue([] as never);
  });
  it('skips weeks measured in the last 7 days and spaces every request', async () => {
    const find = jest.spyOn(WeeklyLiveDemand, 'findAll').mockResolvedValue([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((week) => ({ week })) as never);
    const pause = jest.fn().mockResolvedValue(undefined); const get = jest.fn().mockResolvedValue({ items: [] });
    const r = await runDemand({ get, pause, today: '2026-11-24' });
    expect(r).toEqual({ measured: [12], cached: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], failed: [] });
    expect(get).toHaveBeenCalledTimes(2); // two queries, nothing found
    expect(pause).toHaveBeenCalledTimes(2);
    expect(JSON.stringify((find.mock.calls[0][0] as { where: { error: null } }).where.error)).toBe('null');
  });
  it('two weeks in one run never use the same video, and cached weeks keep theirs', async () => {
    jest.spyOn(WeeklyLiveDemand, 'findAll').mockResolvedValue([{ week: 1, video_url: 'https://www.youtube.com/watch?v=v1' }] as never);
    const at = (id: string, views: string) => ({ ...item(id, 'Claude agent MCP build', views, 0), snippet: { ...item(id, 'x', views, 0).snippet, title: 'Claude agent MCP build', publishedAt: new Date(Date.now() - 86_400_000).toISOString() } });
    await runDemand({ get: api([at('v1', '900'), at('v2', '800'), at('v3', '700')]), pause: async () => undefined, today: '2026-11-24' });
    const used = upsert.mock.calls.map((c) => (c[0] as { video_url: string | null }).video_url).filter(Boolean);
    expect(used.length).toBe(2);
    expect(new Set(used).size).toBe(2);
    expect(used.join()).not.toContain('v=v1');
  });
  it('a failed week is stored with its error and no score; the rest continue', async () => {
    jest.spyOn(WeeklyLiveDemand, 'findAll').mockResolvedValue([] as never);
    const get = jest.fn().mockRejectedValueOnce(Object.assign(new Error('YouTube API rejected: quotaExceeded'), { status: 403 })).mockResolvedValue({ items: [] });
    const r = await runDemand({ get, pause: async () => undefined, today: '2026-11-24' });
    expect(r.failed).toEqual([1]);
    expect(r.measured).toHaveLength(11);
    expect(upsert.mock.calls[0][0]).toMatchObject({ week: 1, score: null, views: null, error: expect.stringContaining('quotaExceeded') });
  });
});

it('latestDemand prefers the newest good row over a newer error', async () => {
  jest.spyOn(WeeklyLiveDemand, 'findAll').mockResolvedValue([{ week: 1, error: 'x', measured_at: '2026-11-24' }, { week: 1, error: null, measured_at: '2026-11-16' }, { week: 2, error: 'y', measured_at: '2026-11-24' }] as never);
  expect((await latestDemand()).map((r) => [r.week, r.error])).toEqual([[1, null], [2, 'y']]);
});

it('every one of the 12 weeks has an angle', () => { expect(Object.keys(ANGLES).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); });

it.each(['Human in the Loop - Claude Opus 5.5 Music Video', 'AI Song: Prompt Engineer (Official Video)', 'Claude Code reacts to my code', 'The AI Podcast Ep. 42', 'Agents trailer 2026', 'Funny AI fails compilation'])('not a lesson: %s', (t) => { expect(isLesson(t)).toBe(false); });
it.each(['Human in the Loop Is Not a Governance Strategy for Agentic AI', 'Stop Prompting Claude. Start Harness Engineering.', 'I Fully Automated My Video Editing Using Claude Code (Full Walkthrough)', 'Everything You Know About Skills IS OUTDATED', 'MCP Explained Simply', '2,000+ Hours of Learning Agentic AI System Design in 20 Minutes', 'Anthropic Says Delete Your Subagents', 'Build Your Own AI Software Factory with Claude Code'])('a lesson: %s', (t) => { expect(isLesson(t)).toBe(true); });
