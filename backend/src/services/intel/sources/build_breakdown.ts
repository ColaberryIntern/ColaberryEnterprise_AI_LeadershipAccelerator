/**
 * build_breakdown — source adapter for the "Build Breakdown" pipeline.
 *
 * Collects hands-on build / shipping writeups from two free, no-key feeds (each
 * item tagged with its source):
 *   - GitHub Blog RSS (source 'GitHub')
 *   - dev.to AI tag RSS (source 'dev.to')
 *
 * Registration is a module-load side effect (registerIntelSource), mirroring
 * aiNewsIngestionService. The generic engine (intelPipeline) owns
 * ingest/score/materialize; this file owns only COLLECT.
 *
 * FAIL-FIRST (CLAUDE.md non-negotiable): collect() NEVER throws. Each feed's
 * fetch+parse is wrapped in try/catch; a dead feed is logged and skipped so the
 * other feed still ingests. Worst case collect() returns [] and the engine keeps
 * prior state (re-runs dedup on (pipeline, guid); guids are stable +
 * source-namespaced by parseRssFeed).
 */
import { registerIntelSource, NormalizedIntelItem } from '../intelRegistry';
import { fetchWithTimeout } from '../intelHttp';
import { parseRssFeed } from '../rssParser';

const SLUG = 'build_breakdown';

/** One upstream feed and the sub-source label its items carry. */
interface FeedSource {
  source: string;
  url: string;
}

/** Free, no-key build/shipping feeds. */
const FEEDS: FeedSource[] = [
  { source: 'GitHub', url: 'https://github.blog/feed/' },
  { source: 'dev.to', url: 'https://dev.to/feed/tag/ai' },
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
      console.warn('[intel] build_breakdown feed failed:', feed.source, msg);
    }
  }
  return items;
}

registerIntelSource({
  slug: SLUG,
  label: 'Build Breakdown',
  enableEnv: 'BUILD_BREAKDOWN_INGEST_ENABLED',
  maxPerRunEnv: 'BUILD_BREAKDOWN_MAX_PER_RUN',
  collect,
});
