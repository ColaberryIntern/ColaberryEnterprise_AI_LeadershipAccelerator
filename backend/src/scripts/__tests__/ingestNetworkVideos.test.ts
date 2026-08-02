/**
 * Unit tests for the pure/network-isolated helpers in ingestNetworkVideos.js — the
 * duration-persistence fix (network_videos.duration_seconds was declared in the DDL
 * but never written on insert/upsert). Requiring the module does not touch
 * CCPP/Postgres (guarded by require.main === module, mirrors govContractsTurnWatcher).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ingest = require('../ingestNetworkVideos');
const { normalizeVideoUrl, parseIso8601DurationToSeconds, fetchYoutubeDurations } = ingest;

function jsonResponse(payload: unknown, ok = true): Response {
  return { ok, json: async () => payload } as unknown as Response;
}

describe('parseIso8601DurationToSeconds', () => {
  it('parses standard ISO-8601 durations', () => {
    expect(parseIso8601DurationToSeconds('PT6M42S')).toBe(402);
    expect(parseIso8601DurationToSeconds('PT10M')).toBe(600);
    expect(parseIso8601DurationToSeconds('PT1H2M3S')).toBe(3723);
  });
  it('returns null for malformed or zero-length input (never a false 0 that reads as "known")', () => {
    expect(parseIso8601DurationToSeconds('garbage')).toBeNull();
    expect(parseIso8601DurationToSeconds('')).toBeNull();
    expect(parseIso8601DurationToSeconds(null)).toBeNull();
    expect(parseIso8601DurationToSeconds('PT0S')).toBeNull();
  });
});

describe('fetchYoutubeDurations', () => {
  const savedKey = process.env.YOUTUBE_API_KEY;
  beforeEach(() => { process.env.YOUTUBE_API_KEY = 'test-key'; jest.restoreAllMocks(); });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = savedKey;
    jest.restoreAllMocks();
  });

  it('resolves a Map of id -> seconds for a batch of ids (happy path)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      items: [
        { id: 'aaaaaaaaaaa', contentDetails: { duration: 'PT5M0S' } },
        { id: 'bbbbbbbbbbb', contentDetails: { duration: 'PT2M30S' } },
      ],
    }));
    const out = await fetchYoutubeDurations(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
    expect(out.get('aaaaaaaaaaa')).toBe(300);
    expect(out.get('bbbbbbbbbbb')).toBe(150);
  });

  it('returns an empty Map and never calls fetch when no key is configured', async () => {
    delete process.env.YOUTUBE_API_KEY;
    const fetchSpy = jest.spyOn(global, 'fetch');
    const out = await fetchYoutubeDurations(['aaaaaaaaaaa']);
    expect(out.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('degrades to an empty Map (never throws) when the API is unreachable — batch is skipped, not fatal', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const out = await fetchYoutubeDurations(['aaaaaaaaaaa'], { maxAttempts: 1, timeoutMs: 500 });
    expect(out.size).toBe(0);
  });

  it('returns an empty Map for an empty id list without calling fetch', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const out = await fetchYoutubeDurations([]);
    expect(out.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('normalizeVideoUrl (regression guard — duration lookup only fires for youtube host)', () => {
  it('identifies a youtube watch URL and extracts its id', () => {
    const n = normalizeVideoUrl('https://youtu.be/aaaaaaaaaaa');
    expect(n.host).toBe('youtube');
    expect(n.providerId).toBe('aaaaaaaaaaa');
  });
  it('identifies vimeo as a distinct host (no duration API available for it)', () => {
    const n = normalizeVideoUrl('https://vimeo.com/123456');
    expect(n.host).toBe('vimeo');
  });
});
