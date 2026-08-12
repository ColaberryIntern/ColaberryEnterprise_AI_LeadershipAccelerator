/**
 * youtubeClient.getVideoDurationSeconds — the ground-truth duration lookup reused by
 * both authoring-time card creation and the timeline_cards duration backfill script.
 * Behavioural tests with a stubbed global fetch (no real network); mirrors the
 * jsonResponse-stub pattern in services/intel/sources/__tests__/keyedSources.test.ts.
 */
import { getVideoDurationSeconds } from '../youtubeClient';

function jsonResponse(payload: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => payload } as unknown as Response;
}

describe('getVideoDurationSeconds', () => {
  const savedKey = process.env.YOUTUBE_API_KEY;

  beforeEach(() => {
    process.env.YOUTUBE_API_KEY = 'test-key-do-not-log';
    jest.restoreAllMocks();
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = savedKey;
    jest.restoreAllMocks();
  });

  it('returns the real duration in seconds for a valid, embeddable video (happy path)', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ items: [{ id: 'abc123', status: { embeddable: true }, contentDetails: { duration: 'PT6M42S' } }] }),
    );
    await expect(getVideoDurationSeconds('abc123')).resolves.toBe(402);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('id=abc123');
  });

  it('returns null (never throws) when the video does not exist (empty items)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ items: [] }));
    await expect(getVideoDurationSeconds('deleted-video')).resolves.toBeNull();
  });

  it('returns null when the video is not embeddable', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ items: [{ id: 'x', status: { embeddable: false }, contentDetails: { duration: 'PT5M' } }] }),
    );
    await expect(getVideoDurationSeconds('x')).resolves.toBeNull();
  });

  it('returns null and never calls fetch when YOUTUBE_API_KEY is unset (no-key degrade)', async () => {
    delete process.env.YOUTUBE_API_KEY;
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(getVideoDurationSeconds('abc123')).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null for an empty/blank video id without calling fetch', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(getVideoDurationSeconds('')).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('degrades to null on quota-exceeded (non-retryable 403), not a throw', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ error: { errors: [{ reason: 'quotaExceeded' }] } }, false, 403),
    );
    await expect(getVideoDurationSeconds('abc123', { maxAttempts: 1 })).resolves.toBeNull();
  });

  it('degrades to null when the API is unreachable after retries are exhausted', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    await expect(getVideoDurationSeconds('abc123', { maxAttempts: 1 })).resolves.toBeNull();
  });
});
