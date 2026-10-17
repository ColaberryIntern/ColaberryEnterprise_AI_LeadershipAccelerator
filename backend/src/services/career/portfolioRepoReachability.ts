/**
 * portfolioRepoReachability - does a stranger actually get to see this repository?
 *
 * ## Why this exists, and why a stored flag was not enough
 *
 * C5.0 asks for evidence "checkable outside our database" that "survives a hostile reader".
 * Built on stored data alone it does not. Measured 2026-10-17 against production:
 *
 *   - `github_connections` has 18 columns and NOT ONE of them records whether the repository
 *     is public. The sync reads with the learner's own token, so a private repository syncs
 *     exactly as happily as a public one.
 *   - Of the 129 commit links the feature would publish, 128 returned 200 anonymously and one
 *     returned 404: `baidhani/HomeHub`, where the whole repository is gone or private. Its
 *     `last_sync_at` is 8 September while every other repository synced that morning.
 *
 * A link that 404s in front of a procurement officer is worse than no link, and a repository
 * NAME is itself a disclosure. So the question "is this public" is answered by asking the
 * outside world, which is the same thing the reader will do.
 *
 * ## Why this is safe to call while rendering a page
 *
 * It is the render path of a public endpoint, so the budget is strict.
 *
 *   - ONE HEAD request per distinct repository, at most `MAX_CONCURRENT` at a time. A page
 *     carries at most a handful of repositories; the largest in production carries six.
 *   - 2.5s timeout, and NO RETRY. A retry on a page render costs the reader more than a
 *     missing link saves them.
 *   - Results are cached in process: 6 hours for reachable, 15 minutes for not. So a warm
 *     container makes roughly one request per repository per six hours, not one per visitor.
 *   - Verified from the production container before this was written: node's own https client
 *     gets honest codes from github.com there (git/git 200, HomeHub 404, nonsense path 404),
 *     unlike openai.com where Cloudflare fingerprints the TLS handshake and blocks node
 *     outright. That check is why this uses https directly and not a shelled-out curl.
 *
 * ## The failure path, decided before the happy path
 *
 * | What happens | What this does |
 * |---|---|
 * | 200 | Reachable. The repository may be named and its commits linked. |
 * | 404 / 451 / any other status | NOT reachable. Named nowhere, linked nowhere, counted as private. |
 * | Timeout or transport error | Falls back to the LAST KNOWN answer for that repository at any age. With no prior answer, not reachable. |
 *
 * That last row is deliberate. Failing closed on a blip would silently strip a page of its
 * strongest evidence every time GitHub hiccups, and the reader would never know a section
 * had vanished. A stale "this was public twenty minutes ago" is the better of the two.
 *
 * The one thing this does NOT do is detect a repository that went private in the last six
 * hours; that link 404s until the cache expires. The permanent fix is to record reachability
 * on the sync, which needs a column and therefore a separate decision.
 */
import { request } from 'https';

/** How long an answer is trusted. Reachable is cached far longer: it changes rarely. */
const TTL_REACHABLE_MS = 6 * 60 * 60 * 1000;
const TTL_UNREACHABLE_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 2500;
const MAX_CONCURRENT = 4;

interface CacheEntry { ok: boolean; at: number }

/** Process-local. A cold container simply asks again; nothing here needs to survive a restart. */
const cache = new Map<string, CacheEntry>();

/** Exported for tests only, so one case cannot leak its answer into the next. */
export function __resetReachabilityCache(): void {
  cache.clear();
}

/**
 * The canonical form of a repository URL: lowercase host, no `.git`, no trailing slash.
 *
 * Returns null for anything that is not exactly `https://github.com/owner/name`, which is the
 * same guard `buildCommitUrl` and `composeFeatured` apply. A URL this refuses is never
 * reachable as far as the rest of the system is concerned.
 */
export function normalizeRepoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const base = raw.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(base)) return null;
  return base;
}

/** One HEAD. Injectable so the rule above can be tested without touching the network. */
export type HeadProbe = (url: string) => Promise<number | null>;

/** `null` means the request never produced a status: timeout, DNS, reset. Not the same as 404. */
export const httpHead: HeadProbe = (url) => new Promise((resolve) => {
  let done = false;
  const finish = (v: number | null) => { if (!done) { done = true; resolve(v); } };
  try {
    const req = request(url, { method: 'HEAD', timeout: TIMEOUT_MS }, (res) => {
      res.resume();
      finish(typeof res.statusCode === 'number' ? res.statusCode : null);
    });
    req.on('timeout', () => { req.destroy(); finish(null); });
    req.on('error', () => finish(null));
    req.end();
  } catch {
    finish(null);
  }
});

function fresh(entry: CacheEntry | undefined, now: number): boolean {
  if (!entry) return false;
  return now - entry.at < (entry.ok ? TTL_REACHABLE_MS : TTL_UNREACHABLE_MS);
}

/**
 * Which of these repositories a logged-out stranger can open.
 *
 * Input may be any mix of shapes and junk; the returned set contains normalized URLs only,
 * so a caller compares against `normalizeRepoUrl(x)` and nothing else.
 */
export async function reachablePublicRepos(
  urls: unknown[],
  probe: HeadProbe = httpHead,
  now: number = Date.now(),
): Promise<Set<string>> {
  const wanted = [...new Set(
    (Array.isArray(urls) ? urls : []).map(normalizeRepoUrl).filter((u): u is string => !!u),
  )];
  const reachable = new Set<string>();
  const toCheck: string[] = [];

  for (const url of wanted) {
    const entry = cache.get(url);
    if (fresh(entry, now)) {
      if (entry!.ok) reachable.add(url);
    } else {
      toCheck.push(url);
    }
  }

  // Bounded concurrency: a shared cursor rather than a chunked loop, so one slow repository
  // does not hold up the rest of its batch.
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= toCheck.length) return;
      const url = toCheck[i];
      const status = await probe(url);
      if (status === null) {
        // No answer. Reuse whatever we last knew, at any age, rather than deleting evidence
        // because of a blip. Absent any prior answer, it is not reachable.
        const prior = cache.get(url);
        if (prior?.ok) reachable.add(url);
        continue;
      }
      const ok = status === 200;
      cache.set(url, { ok, at: now });
      if (ok) reachable.add(url);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT, toCheck.length) }, () => worker()),
  );
  return reachable;
}
