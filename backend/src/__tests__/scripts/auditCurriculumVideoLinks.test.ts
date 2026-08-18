/**
 * Guards the curriculum video link audit.
 *
 * The distinction that matters here is DEAD vs UNKNOWN. A 404 from oEmbed means
 * the video is really gone and a student will hit a wall. Anything else — a
 * timeout, a 429, a 5xx — is inconclusive, and calling it DEAD would send people
 * chasing videos that are fine. These tests pin that boundary.
 */

import { youtubeId, probe, probeAll } from '../../scripts/auditCurriculumVideoLinks';

describe('youtubeId', () => {
  it('extracts the id from every URL shape the curriculum uses', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=6wkFb2_cUik')).toBe('6wkFb2_cUik');
    expect(youtubeId('https://youtu.be/6wkFb2_cUik')).toBe('6wkFb2_cUik');
    expect(youtubeId('https://www.youtube.com/embed/6wkFb2_cUik')).toBe('6wkFb2_cUik');
    expect(youtubeId('https://www.youtube.com/shorts/6wkFb2_cUik')).toBe('6wkFb2_cUik');
    expect(youtubeId('https://www.youtube.com/watch?t=30&v=6wkFb2_cUik')).toBe('6wkFb2_cUik');
  });

  it('returns null rather than guessing at a non-YouTube or empty URL', () => {
    expect(youtubeId('https://vimeo.com/12345')).toBeNull();
    expect(youtubeId('')).toBeNull();
    expect(youtubeId(null)).toBeNull();
    expect(youtubeId(undefined)).toBeNull();
  });
});

describe('probe', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks(); });

  it('reports OK with the owning channel on 200', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ author_name: 'Anthropic', title: 'Tool use with the Claude 3 model family' }),
    }) as unknown as typeof fetch;

    await expect(probe('6wkFb2_cUik')).resolves.toEqual({
      state: 'OK',
      channel: 'Anthropic',
      video_title: 'Tool use with the Claude 3 model family',
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('reports DEAD immediately on 404 without burning retries', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 404 }) as unknown as typeof fetch;

    await expect(probe('Yjfh5jtaLx4')).resolves.toEqual({ state: 'DEAD', httpStatus: 404 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a rate limit and reports UNKNOWN, never DEAD', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 429 }) as unknown as typeof fetch;

    const result = await probe('6wkFb2_cUik');
    expect(result.state).toBe('UNKNOWN');
    expect(result.error).toBe('HTTP 429');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('treats a network failure as UNKNOWN, not DEAD', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      Object.assign(new Error('socket hang up'), { name: 'FetchError' })
    ) as unknown as typeof fetch;

    const result = await probe('6wkFb2_cUik');
    expect(result.state).toBe('UNKNOWN');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('recovers when a transient failure clears on a later attempt', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 200, json: async () => ({ author_name: 'IBM Technology', title: 'What is Tool Calling?' }) }) as unknown as typeof fetch;

    await expect(probe('h8gMhXYAv1k')).resolves.toEqual({
      state: 'OK',
      channel: 'IBM Technology',
      video_title: 'What is Tool Calling?',
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('probeAll', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks(); });

  it('marks a non-YouTube URL SKIPPED without probing it', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;

    const results = await probeAll([
      { id: 'card-1', week: 3, bucket: 'learn', type: 'video', subtitle: null, visibility: 'published', title: 'Self-hosted clip', video_url: 'https://cdn.colaberry.com/a.mp4' },
    ]);

    expect(results[0].state).toBe('SKIPPED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps results aligned with their input cards under concurrency', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      const dead = url.includes('DEADID');
      return Promise.resolve(
        dead ? { status: 404 } : { status: 200, json: async () => ({ author_name: 'Anthropic', title: 'ok' }) }
      );
    }) as unknown as typeof fetch;

    const base = { bucket: 'learn', type: 'video', subtitle: null, visibility: 'published' };
    const cards = [
      { ...base, id: 'a', week: 1, title: 'A', video_url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' },
      { ...base, id: 'b', week: 2, title: 'B', video_url: 'https://www.youtube.com/watch?v=DEADIDxxxxx' },
      { ...base, id: 'c', week: 3, title: 'C', video_url: 'https://www.youtube.com/watch?v=CCCCCCCCCCC' },
    ];

    const results = await probeAll(cards);

    expect(results.map((r: { id: string }) => r.id)).toEqual(['a', 'b', 'c']);
    expect(results[1].state).toBe('DEAD');
    expect(results[0].state).toBe('OK');
    expect(results[2].state).toBe('OK');
  });

  it('handles an empty card list without hanging', async () => {
    await expect(probeAll([])).resolves.toEqual([]);
  });
});
