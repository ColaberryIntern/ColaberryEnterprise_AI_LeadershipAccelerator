/**
 * ai_research_digest adapter tests — the source COLLECT contract for the generic
 * intelligence engine. No DB, no LLM: the adapter only fetches + parses, so a
 * mocked global.fetch fully exercises it.
 *
 * Covers the FAIL-FIRST guarantee (CLAUDE.md non-negotiable): collect() must
 * NEVER throw, must return normalized items for a healthy feed, must return []
 * (not throw) when every fetch rejects, and one dead feed must not sink the other.
 */
import { collect } from '../ai_research_digest';
import { getIntelSource } from '../../intelRegistry';

/** A minimal Response-like matching what intelHttp.fetchWithTimeout reads. */
const okResponse = (body: string) => ({ ok: true, status: 200, text: async () => body });

/** arXiv-style Atom entry — parseRssFeed reads <id>/<link>, so guid = the arXiv id. */
const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Reflection Improves Agent Reliability</title>
    <id>http://arxiv.org/abs/2407.00001v1</id>
    <link href="http://arxiv.org/abs/2407.00001v1"/>
    <summary>We study self-critique in autonomous agents.</summary>
    <published>2026-07-15T10:00:00Z</published>
  </entry>
</feed>`;

describe('ai_research_digest adapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('registers itself at module load with the exact slug + env contract', () => {
    const cfg = getIntelSource('ai_research_digest');
    expect(cfg).toBeDefined();
    expect(cfg?.label).toBe('AI Research Digest');
    expect(cfg?.enableEnv).toBe('AI_RESEARCH_DIGEST_INGEST_ENABLED');
    expect(cfg?.maxPerRunEnv).toBe('AI_RESEARCH_DIGEST_MAX_PER_RUN');
  });

  it('returns normalized, source-tagged, guid-namespaced items for healthy feeds', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse(ATOM) as any);

    const items = await collect();

    // Both feeds parse the same sample; parseRssFeed namespaces the guid by source
    // so the two survive as distinct items (arXiv:… and Papers with Code:…).
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const it of items) {
      expect(['arXiv', 'Papers with Code']).toContain(it.source);
      expect(it.guid.startsWith(`${it.source}:`)).toBe(true);
      expect(it.title).toBe('Reflection Improves Agent Reliability');
      expect(it.url).toBe('http://arxiv.org/abs/2407.00001v1');
      expect(it.publishedAt).toBeInstanceOf(Date);
    }
  });

  it('returns [] (never throws) when every feed fetch rejects', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    // Must resolve to [], not reject: one dead upstream cannot crash the caller/cron.
    await expect(collect()).resolves.toEqual([]);
  });

  it('keeps the survivor when one feed fails and the other succeeds', async () => {
    // arXiv times out on every attempt; Papers with Code answers.
    jest.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('arxiv.org')) return Promise.reject(new Error('timeout'));
      return Promise.resolve(okResponse(ATOM) as any);
    });

    const items = await collect();

    expect(items.length).toBeGreaterThanOrEqual(1);
    // Only the healthy feed's items come back; the dead one is skipped, not thrown.
    expect(items.every((it) => it.source === 'Papers with Code')).toBe(true);
  });
});
