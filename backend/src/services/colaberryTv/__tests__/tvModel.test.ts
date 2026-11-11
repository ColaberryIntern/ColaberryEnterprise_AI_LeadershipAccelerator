import { nextPositions, AddBody, audienceSees, displayTitle, OrderBody, parseYoutubeId, toViewerList, UpdateBody, type TvVideoRow } from '../tvModel';
import { fetchShortTitle } from '../tvOembed';

/** Campus v20 N3 (C134): which links are shorts, who sees which short, and the request shapes. */
const ID = 'Pa5J5T6MZok';

describe('parseYoutubeId', () => {
  it.each([
    `https://www.youtube.com/shorts/${ID}`,
    `https://youtube.com/shorts/${ID}?feature=share`,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?t=3&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}?rel=0`,
    `https://m.youtube.com/shorts/${ID}`,
    `youtube.com/shorts/${ID}`,
  ])('reads %s', (url) => { expect(parseYoutubeId(url)).toBe(ID); });

  it.each([
    ['empty', ''],
    ['another site', `https://vimeo.com/${ID}`],
    ['a lookalike host', `https://youtube.com.evil.test/shorts/${ID}`],
    ['a short id', 'https://www.youtube.com/shorts/abc'],
    ['a channel page', 'https://www.youtube.com/@colaberry'],
    ['an oversized string', `https://www.youtube.com/shorts/${ID}?x=${'a'.repeat(600)}`],
  ])('rejects %s', (_n, url) => { expect(parseYoutubeId(url)).toBeNull(); });
});

describe('who sees which short', () => {
  it('everyone sees "all"; explorers see explorers; members and business accounts see members; staff see everything', () => {
    expect(audienceSees('all', 'explorer')).toBe(true);
    expect(audienceSees('explorers', 'explorer')).toBe(true);
    expect(audienceSees('members', 'explorer')).toBe(false);
    expect(audienceSees('members', 'member')).toBe(true);
    expect(audienceSees('members', 'business')).toBe(true);
    expect(audienceSees('explorers', 'member')).toBe(false);
    expect(audienceSees('explorers', 'staff')).toBe(true);
    expect(audienceSees('members', 'staff')).toBe(true);
  });

  const row = (id: string, position: number, extra: Partial<TvVideoRow> = {}): TvVideoRow =>
    ({ id, youtube_id: ID, title: null, duration_s: null, audience: 'all', on_air: true, position, created_at: '2026-11-11T15:00:00Z', ...extra });

  it('the viewer list is on air only, in play order, with a neutral title when none is stored', () => {
    const list = toViewerList([row('b', 2), row('a', 1, { title: 'Week 1 recap' }), row('c', 3, { on_air: false }), row('d', 4, { audience: 'members' })], 'explorer');
    expect(list.map((v) => v.id)).toEqual(['a', 'b']);
    expect(list.map((v) => v.title)).toEqual(['Week 1 recap', 'Colaberry short']);
    expect(list[0].created_at).toBe('2026-11-11T15:00:00.000Z');
  });

  it('an empty or blank title is never shown as blank', () => {
    expect(displayTitle({ title: '   ' })).toBe('Colaberry short');
  });
});

it('nextPositions numbers the order from 1', () => {
  expect(nextPositions(['b', 'a'])).toEqual([{ id: 'b', position: 1 }, { id: 'a', position: 2 }]);
});

describe('request shapes', () => {
  it('add takes a url and nothing else', () => {
    expect(AddBody.safeParse({ url: 'x' }).success).toBe(true);
    expect(AddBody.safeParse({ url: '' }).success).toBe(false);
    expect(AddBody.safeParse({ url: 'x', position: 1 }).success).toBe(false);
  });
  it('an update must change something known', () => {
    expect(UpdateBody.safeParse({ on_air: false }).success).toBe(true);
    expect(UpdateBody.safeParse({}).success).toBe(false);
    expect(UpdateBody.safeParse({ audience: 'everyone' }).success).toBe(false);
    expect(UpdateBody.safeParse({ title: 'x'.repeat(121) }).success).toBe(false);
    expect(UpdateBody.safeParse({ youtube_id: ID }).success).toBe(false);
  });
  it('an order lists each short once, as uuids', () => {
    const a = '11111111-2222-4333-8444-000000000001';
    expect(OrderBody.safeParse({ ids: [a] }).success).toBe(true);
    expect(OrderBody.safeParse({ ids: [a, a] }).success).toBe(false);
    expect(OrderBody.safeParse({ ids: ['x'] }).success).toBe(false);
    expect(OrderBody.safeParse({ ids: [] }).success).toBe(false);
  });
});

describe('fetchShortTitle (oEmbed)', () => {
  beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('returns the title YouTube reports, asking with a timeout', async () => {
    const f = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ title: ' Colaberry: Week 1 ' }) });
    await expect(fetchShortTitle(ID, f as unknown as typeof fetch)).resolves.toBe('Colaberry: Week 1');
    expect(String(f.mock.calls[0][0])).toContain(encodeURIComponent(`https://www.youtube.com/shorts/${ID}`));
    expect(f.mock.calls[0][1].signal).toBeDefined();
  });
  it.each<[string, () => Promise<unknown>]>([
    ['a 404', () => Promise.resolve({ ok: false, status: 404, json: async () => ({}) })],
    ['a timeout', () => Promise.reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))],
    ['a body without a title', () => Promise.resolve({ ok: true, json: async () => ({ html: '<iframe>' }) })],
    ['malformed JSON', () => Promise.resolve({ ok: true, json: async () => { throw new SyntaxError('bad'); } })],
  ])('%s is null, logged, never thrown', async (_n, impl) => {
    await expect(fetchShortTitle(ID, jest.fn(impl) as unknown as typeof fetch)).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('colaberry_tv_oembed_failed'));
  });
});
