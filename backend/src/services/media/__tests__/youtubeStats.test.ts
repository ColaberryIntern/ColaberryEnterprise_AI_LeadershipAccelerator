import {
  chunkIds,
  extractYouTubeId,
  fetchVideoStats,
  isRetryable,
  MAX_IDS_PER_CALL,
  parseCount,
  parseStatsResponse,
  scrubKey,
  YouTubeStatsError,
} from '../youtubeStats';

const KEY = 'test-key-not-a-real-credential';
const ok = (body: unknown) => ({
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});
const bad = (status: number, body = 'nope') => ({
  status,
  json: async () => ({}),
  text: async () => body,
});

afterEach(() => {
  delete (global as unknown as { fetch?: unknown }).fetch;
});

describe('extractYouTubeId', () => {
  it('reads every URL shape the library actually stores', () => {
    expect(extractYouTubeId('https://www.youtube.com/shorts/O5iftogeVHg')).toBe('O5iftogeVHg');
    expect(extractYouTubeId('https://www.youtube.com/watch?v=O5iftogeVHg')).toBe('O5iftogeVHg');
    expect(extractYouTubeId('https://youtu.be/O5iftogeVHg')).toBe('O5iftogeVHg');
    expect(extractYouTubeId('https://www.youtube.com/embed/O5iftogeVHg')).toBe('O5iftogeVHg');
    expect(extractYouTubeId('https://m.youtube.com/watch?v=O5iftogeVHg&t=30')).toBe('O5iftogeVHg');
  });

  it('returns null rather than a guess for anything else', () => {
    // A wrong id would attach another video's view count to our asset, which is worse
    // than showing no count at all.
    expect(extractYouTubeId('https://vimeo.com/12345')).toBeNull();
    expect(extractYouTubeId('https://www.youtube.com/@colaberry')).toBeNull();
    expect(extractYouTubeId('not a url')).toBeNull();
    expect(extractYouTubeId('')).toBeNull();
    expect(extractYouTubeId(null)).toBeNull();
    expect(extractYouTubeId('javascript:alert(1)')).toBeNull();
  });

  it('rejects an id of the wrong length', () => {
    expect(extractYouTubeId('https://youtu.be/tooshort')).toBeNull();
    expect(extractYouTubeId('https://youtu.be/waaaaaaaaaaytoolong')).toBeNull();
  });
});

describe('pure helpers', () => {
  it('parses counts and refuses nonsense', () => {
    expect(parseCount('1448')).toBe(1448);
    expect(parseCount(0)).toBe(0);
    expect(parseCount(undefined)).toBeNull();
    expect(parseCount('not a number')).toBeNull();
    expect(parseCount(-5)).toBeNull();
  });

  it('chunks to the API ceiling', () => {
    const ids = Array.from({ length: 120 }, (_, i) => `id${i}`);
    const chunks = chunkIds(ids);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(MAX_IDS_PER_CALL);
    expect(chunks[2]).toHaveLength(20);
    expect(chunkIds([])).toEqual([]);
  });

  it('retries only what could differ next time', () => {
    expect(isRetryable(429)).toBe(true);
    expect(isRetryable(503)).toBe(true);
    expect(isRetryable(403)).toBe(false);
    expect(isRetryable(404)).toBe(false);
  });

  it('never lets the key survive into a log line', () => {
    expect(scrubKey(`failed for key=${KEY}&part=statistics`, KEY)).not.toContain(KEY);
    expect(scrubKey(`url?key=something-else-entirely`, undefined)).toContain('key=<redacted>');
  });

  it('keeps an omitted video omitted instead of inventing a zero', () => {
    const parsed = parseStatsResponse({ items: [{ id: 'a', statistics: { viewCount: '7' } }] });
    expect(parsed).toEqual([{ videoId: 'a', viewCount: 7, likeCount: null }]);
  });

  it('treats a missing items array as a contract violation', () => {
    expect(() => parseStatsResponse({})).toThrow(YouTubeStatsError);
  });
});

describe('fetchVideoStats', () => {
  it('returns counts for the ids YouTube answered', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue(
      ok({ items: [{ id: 'O5iftogeVHg', statistics: { viewCount: '1448', likeCount: '64' } }] }),
    );
    const got = await fetchVideoStats(['O5iftogeVHg'], { apiKey: KEY });
    expect(got.get('O5iftogeVHg')).toEqual({ videoId: 'O5iftogeVHg', viewCount: 1448, likeCount: 64 });
  });

  it('omits a video YouTube did not answer for, and does not call it zero', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue(ok({ items: [] }));
    const got = await fetchVideoStats(['deletedvid1'], { apiKey: KEY });
    expect(got.has('deletedvid1')).toBe(false);
  });

  it('refuses to run with no key instead of calling YouTube anonymously', async () => {
    await expect(fetchVideoStats(['a'], { apiKey: '' })).rejects.toMatchObject({ errorClass: 'ConfigMissing' });
  });

  it('classifies a rejected key as AuthError and does not retry it', async () => {
    const f = jest.fn().mockResolvedValue(bad(403, 'forbidden'));
    (global as unknown as { fetch: jest.Mock }).fetch = f;
    await expect(fetchVideoStats(['a'], { apiKey: KEY, sleep: async () => {} }))
      .rejects.toMatchObject({ errorClass: 'AuthError' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries a rate limit, with a cap', async () => {
    const f = jest.fn().mockResolvedValue(bad(429, 'slow down'));
    (global as unknown as { fetch: jest.Mock }).fetch = f;
    await expect(fetchVideoStats(['a'], { apiKey: KEY, sleep: async () => {} }))
      .rejects.toMatchObject({ errorClass: 'RateLimitError' });
    // Capped: three attempts, never an unbounded loop.
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('recovers when a transient failure clears', async () => {
    const f = jest.fn()
      .mockResolvedValueOnce(bad(503))
      .mockResolvedValueOnce(ok({ items: [{ id: 'a', statistics: { viewCount: '3' } }] }));
    (global as unknown as { fetch: jest.Mock }).fetch = f;
    const got = await fetchVideoStats(['a'], { apiKey: KEY, sleep: async () => {} });
    expect(got.get('a')?.viewCount).toBe(3);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('never puts the key in the error it throws', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn()
      .mockResolvedValue(bad(500, `upstream said key=${KEY} is fine`));
    const err = await fetchVideoStats(['a'], { apiKey: KEY, sleep: async () => {} }).catch((e) => e);
    expect(String(err.message)).not.toContain(KEY);
  });

  it('spends one call for a whole library-sized batch', async () => {
    const f = jest.fn().mockResolvedValue(ok({ items: [] }));
    (global as unknown as { fetch: jest.Mock }).fetch = f;
    await fetchVideoStats(Array.from({ length: 17 }, (_, i) => `vid${i}`), { apiKey: KEY });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('does nothing, and spends nothing, for an empty list', async () => {
    const f = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = f;
    expect((await fetchVideoStats([], { apiKey: KEY })).size).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  it('asks about a duplicated id only once', async () => {
    const f = jest.fn().mockResolvedValue(ok({ items: [] }));
    (global as unknown as { fetch: jest.Mock }).fetch = f;
    await fetchVideoStats(['a', 'a', 'a'], { apiKey: KEY });
    expect(f.mock.calls[0][0]).toContain('id=a&');
  });
});
