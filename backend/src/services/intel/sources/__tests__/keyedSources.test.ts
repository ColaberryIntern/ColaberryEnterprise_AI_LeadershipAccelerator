/**
 * keyedSources.test.ts — behavioural tests for the two key/endpoint-gated intel
 * source adapters (ai_video_stream, market_intelligence).
 *
 * The single most important guarantee these adapters must uphold is DEGRADE-DARK:
 * when the required env var is missing, collect() must return [] WITHOUT throwing
 * and WITHOUT touching the network. These tests assert exactly that, plus the
 * happy-path normalization for the YouTube adapter (stubbed global fetch), plus a
 * non-2xx degrade and the Opportunity Pulse defensive mapping.
 *
 * Importing the modules self-registers them; we exercise their exported collect().
 */
import { collect as collectVideo } from '../aiVideoStreamSource';
import { collect as collectMarket } from '../marketIntelligenceSource';

/** Build a minimal Response-like object for a stubbed global fetch. */
function jsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

describe('keyed intel sources — degrade-dark when env is unset', () => {
  const envKeys = [
    'YOUTUBE_API_KEY',
    'OPPORTUNITY_PULSE_URL',
    'OPPORTUNITY_PULSE_TOKEN',
    'AI_VIDEO_STREAM_QUERY',
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of envKeys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    jest.restoreAllMocks();
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    jest.restoreAllMocks();
  });

  it('ai_video_stream returns [] (no throw, no fetch) when YOUTUBE_API_KEY is unset', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(collectVideo()).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('market_intelligence returns [] (no throw, no fetch) when OPPORTUNITY_PULSE_URL is unset', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(collectMarket()).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ai_video_stream maps a stubbed YouTube search payload to normalized items', async () => {
    process.env.YOUTUBE_API_KEY = 'test-key-do-not-log';
    const payload = {
      items: [
        {
          id: { kind: 'youtube#video', videoId: 'abc123' },
          snippet: {
            title: 'AI Systems Architecture 101',
            description: 'A deep dive into agentic architecture.',
            publishedAt: '2026-07-20T10:00:00Z',
          },
        },
        {
          id: { kind: 'youtube#video', videoId: 'def456' },
          snippet: { title: 'Second Video', description: '', publishedAt: 'not-a-date' },
        },
        // No videoId (a channel result) — must be skipped, not mapped.
        { id: { kind: 'youtube#channel' }, snippet: { title: 'Some Channel' } },
      ],
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(payload));

    const items = await collectVideo();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      guid: 'yt:abc123',
      source: 'YouTube',
      title: 'AI Systems Architecture 101',
      url: 'https://www.youtube.com/watch?v=abc123',
      excerpt: 'A deep dive into agentic architecture.',
      publishedAt: new Date('2026-07-20T10:00:00Z'),
    });
    // Empty description → null excerpt; invalid date string → null publishedAt.
    expect(items[1].guid).toBe('yt:def456');
    expect(items[1].excerpt).toBeNull();
    expect(items[1].publishedAt).toBeNull();
  });

  it('ai_video_stream degrades to [] on a non-2xx response (never throws)', async () => {
    process.env.YOUTUBE_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(
      { ok: false, status: 403, text: async () => '' } as unknown as Response,
    );
    await expect(collectVideo()).resolves.toEqual([]);
  });

  it('market_intelligence maps a bare array and tolerates missing/alt field names', async () => {
    process.env.OPPORTUNITY_PULSE_URL = 'https://pulse.internal/api';
    const payload = [
      { id: 42, name: 'RFP: Data Platform', link: 'https://pulse/op/42', description: 'summary text', created_at: '2026-07-18T00:00:00Z' },
      { url: 'https://pulse/op/nolabel-ok', title: 'Titled via url identity' },
      { title: 'No identity — skipped' }, // no id and no url → skipped
      { id: 7 }, // no title → skipped
    ];
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(payload));

    const items = await collectMarket();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      guid: 'op:42',
      source: 'Opportunity Pulse',
      title: 'RFP: Data Platform',
      url: 'https://pulse/op/42',
      excerpt: 'summary text',
      publishedAt: new Date('2026-07-18T00:00:00Z'),
    });
    expect(items[1].guid).toBe('op:https://pulse/op/nolabel-ok');
    expect(items[1].publishedAt).toBeNull();
  });

  it('market_intelligence degrades to [] on malformed JSON (never throws)', async () => {
    process.env.OPPORTUNITY_PULSE_URL = 'https://pulse.internal/api';
    jest.spyOn(global, 'fetch').mockResolvedValue(
      { ok: true, status: 200, text: async () => '<<not json>>' } as unknown as Response,
    );
    await expect(collectMarket()).resolves.toEqual([]);
  });
});
