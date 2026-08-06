/**
 * keyedSources.test.ts — behavioural tests for the key/endpoint-gated intel source
 * adapter (ai_video_stream).
 *
 * The single most important guarantee this adapter must uphold is DEGRADE-DARK:
 * when the required env var is missing, collect() must return [] WITHOUT throwing
 * and WITHOUT touching the network. These tests assert exactly that, plus the
 * happy-path normalization for the YouTube adapter (stubbed global fetch), plus a
 * non-2xx degrade.
 *
 * market_intelligence used to live in this file too (it was also endpoint-gated,
 * over an internal "Opportunity Pulse" REST API). It has since been rewritten as a
 * CURATED source (no live fetch, no external dependency) matching the pattern of
 * ai_quote_of_the_day / ai_tool_of_the_day / claude_code_technique — its coverage
 * now lives in curatedSources.test.ts alongside those siblings.
 *
 * Importing the module self-registers it; we exercise its exported collect().
 */
import { collect as collectVideo } from '../aiVideoStreamSource';

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

  it('ai_video_stream maps a stubbed YouTube search payload to normalized items, dropping non-English candidates', async () => {
    process.env.YOUTUBE_API_KEY = 'test-key-do-not-log';
    const searchPayload = {
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
        // Non-Latin script title — must be dropped by the text heuristic.
        {
          id: { kind: 'youtube#video', videoId: 'zh789' },
          snippet: { title: 'Prompt 没用了？复杂 Agent 开发的三层控制架构拆解', description: '', publishedAt: '2026-07-20T10:00:00Z' },
        },
        // English-scripted title, but German audio per videos.list metadata below.
        {
          id: { kind: 'youtube#video', videoId: 'de999' },
          snippet: { title: 'Architecture Decisions', description: '', publishedAt: '2026-07-20T10:00:00Z' },
        },
      ],
    };
    const videosPayload = {
      items: [
        { id: 'abc123', snippet: { defaultAudioLanguage: 'en' } },
        { id: 'de999', snippet: { defaultAudioLanguage: 'de' } },
      ],
    };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(searchPayload))
      .mockResolvedValueOnce(jsonResponse(videosPayload));

    const items = await collectVideo();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
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
    // zh789 (non-Latin script) and de999 (defaultAudioLanguage=de) are both dropped.
    expect(items.map((i) => i.guid)).not.toContain('yt:zh789');
    expect(items.map((i) => i.guid)).not.toContain('yt:de999');
  });

  it('ai_video_stream degrades to [] on a non-2xx response (never throws)', async () => {
    process.env.YOUTUBE_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(
      { ok: false, status: 403, text: async () => '' } as unknown as Response,
    );
    await expect(collectVideo()).resolves.toEqual([]);
  });

  it('ai_video_stream falls back to the text heuristic (never throws) when videos.list fails', async () => {
    process.env.YOUTUBE_API_KEY = 'test-key';
    const searchPayload = {
      items: [
        { id: { kind: 'youtube#video', videoId: 'ok111' }, snippet: { title: 'English Title', description: '' } },
      ],
    };
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(searchPayload))
      .mockResolvedValue({ ok: false, status: 500, text: async () => '' } as unknown as Response);

    const items = await collectVideo();
    expect(items).toHaveLength(1);
    expect(items[0].guid).toBe('yt:ok111');
  });
});
