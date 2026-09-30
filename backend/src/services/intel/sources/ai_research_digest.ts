/**
 * ai_research_digest — source adapter for the "AI Research Digest" pipeline.
 *
 * Collects freshly-published AI/ML research from two free, no-key feeds:
 *   - arXiv Atom API (cs.AI + cs.LG, newest first) — Atom XML, parseRssFeed
 *     reads <entry>/<id>/<link>, so guid = the arXiv id.
 *   - Papers with Code "latest" RSS — guid = the PwC link/guid.
 *
 * Registration is a module-load side effect (registerIntelSource), mirroring how
 * aiNewsIngestionService wires the AI News Flash feeds. The generic engine
 * (intelPipeline) owns ingest/score/materialize; this file owns only COLLECT.
 *
 * FAIL-FIRST (CLAUDE.md non-negotiable): collect() NEVER throws. Each feed's
 * fetch+parse is wrapped in try/catch; a dead feed is logged and skipped so the
 * other feed still ingests. Worst case collect() returns [] and the engine keeps
 * prior state for the next run — no partial commit, safe to re-run (guids are
 * stable + source-namespaced by parseRssFeed, so re-runs dedup on (pipeline, guid)).
 */
import { registerIntelSource, NormalizedIntelItem } from '../intelRegistry';
import { fetchWithTimeout } from '../intelHttp';
import { parseRssFeed } from '../rssParser';

const SLUG = 'ai_research_digest';

/** One upstream feed and the sub-source label its items carry. */
interface FeedSource {
  source: string;
  url: string;
}

/** Free, no-key research feeds. arXiv served over http per the export API; kept
 *  verbatim (the API answers on http and does not force https). */
const FEEDS: FeedSource[] = [
  {
    source: 'arXiv',
    url: 'http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=40',
  },
  { source: 'Papers with Code', url: 'https://paperswithcode.com/latest.rss' },
];

/**
 * Fetch + parse every feed and concat the normalized items. Throw-safe: one feed
 * failing (timeout, non-2xx, malformed XML) is logged and skipped; the survivors
 * still return. parseRssFeed already yields a stable, source-namespaced guid.
 */
export async function collect(): Promise<NormalizedIntelItem[]> {
  const items: NormalizedIntelItem[] = [];
  for (const feed of FEEDS) {
    try {
      const xml = await fetchWithTimeout(feed.url);
      const parsed = parseRssFeed(xml, feed.source);
      for (const it of parsed) {
        // RssItem lacks `source`; stamp it here so the engine records the sub-source.
        items.push({ ...it, source: feed.source });
      }
    } catch (err) {
      // any-free: the caught value is unknown; we only read a short message.
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      console.warn('[intel] ai_research_digest feed failed:', feed.source, msg);
    }
  }
  return items;
}

registerIntelSource({
  slug: SLUG,
  label: 'AI Research Digest',
  enableEnv: 'AI_RESEARCH_DIGEST_INGEST_ENABLED',
  maxPerRunEnv: 'AI_RESEARCH_DIGEST_MAX_PER_RUN',
  collect,
});
