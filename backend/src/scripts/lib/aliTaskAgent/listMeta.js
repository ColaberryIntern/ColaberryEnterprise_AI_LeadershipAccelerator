/**
 * listMeta - what each "list" on the board actually is, asked of Basecamp rather than assumed.
 *
 * WHY THIS EXISTS (measured on production, 2026-11-11, 179 list ids on the board)
 *
 *   98 are real to-do lists (parent: the project's to-do set)
 *   79 are GROUPS inside a list (parent: another to-do list)
 *    2 no longer exist in Basecamp although the mirror still marks their tasks active
 *    4 were renamed in Basecamp; the mirror still carries the old name
 *
 * The mirror (ops_bc_todos) only has todolist_id and a possibly stale todolist_name, so the board
 * asks Basecamp, read-only, once per list. Nothing here writes.
 *
 * FAILURE MODES
 *   - each GET has a timeout (default 10s); a 429 is retried up to 3 times honouring Retry-After
 *     (capped 10s); a 5xx / timeout gets one retry. Default concurrency is 4, under the rate limit.
 *   - 404 is an answer, not a failure: the list is gone, and the board says so
 *   - anything else, or no token at all, degrades to the mirror's name and a link built from ids;
 *     the result says `checked: false` so the page can admit the names were not verified
 * NOT HANDLED: a list moved to another project (Basecamp redirects; we report what the API says).
 *
 * Pure apart from the injected fetch, so it is tested without the network.
 */

const DEFAULT_ACCOUNT = '3945211';

/**
 * The web link for a list or group. Deterministic, so it works even when the API does not. The
 * host matches the `app_url` Basecamp itself returns for these lists (app.basecamp.com).
 */
function listUrl(projectId, listId, accountId = DEFAULT_ACCOUNT) {
  return `https://app.basecamp.com/${accountId}/buckets/${projectId}/todolists/${listId}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getOnce(fetchImpl, url, token, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'colaberry-backlog-board' },
      signal: ctl.signal,
    });
    const ra = res.headers && typeof res.headers.get === 'function' ? Number(res.headers.get('Retry-After')) : NaN;
    return { status: res.status, body: res.status === 200 ? await res.json() : null,
      retryAfterMs: Number.isFinite(ra) && ra >= 0 ? ra * 1000 : null };
  } catch (e) {
    return { status: 0, error: e && e.name === 'AbortError' ? 'TimeoutError' : 'NetworkError' };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Retry policy, bounded:
 *   429 (rate limited)   up to 3 retries, waiting what Basecamp's Retry-After asks (capped at
 *                        10s), else the base delay doubling. Measured 2026-11-11: 177 GETs in ~7s
 *                        at concurrency 6 left 5 lists unchecked after a single 1s retry.
 *   5xx / timeout / net  one retry after the base delay.
 */
const MAX_429_RETRIES = 3;
const RETRY_AFTER_CAP_MS = 10000;
const retryable = (r) => r.status === 0 || r.status === 429 || r.status >= 500;

async function getWithRetry(fetchImpl, url, token, timeoutMs, baseDelayMs) {
  let r = await getOnce(fetchImpl, url, token, timeoutMs);
  let attempt = 0;
  while (retryable(r) && attempt < (r.status === 429 ? MAX_429_RETRIES : 1)) {
    const wait = r.status === 429 && r.retryAfterMs != null
      ? Math.min(r.retryAfterMs, RETRY_AFTER_CAP_MS)
      : Math.min(baseDelayMs * 2 ** attempt, RETRY_AFTER_CAP_MS);
    await sleep(wait);
    attempt += 1;
    r = await getOnce(fetchImpl, url, token, timeoutMs);
  }
  return r;
}

/**
 * @param {Array<{projectId:string,listId:string,name:string}>} lists
 * @param {{token?:string, fetchImpl?:Function, accountId?:string, timeoutMs?:number,
 *          concurrency?:number, retryDelayMs?:number}} opts
 * @returns {Promise<Map<string, object>>} keyed by "<projectId>/<listId>"
 */
async function fetchListMeta(lists, opts = {}) {
  const accountId = opts.accountId || DEFAULT_ACCOUNT;
  const timeoutMs = opts.timeoutMs || 10000;
  const retryDelayMs = opts.retryDelayMs == null ? 1000 : opts.retryDelayMs;
  const out = new Map();
  const fallback = (l, why) => ({
    checked: false, found: null, why, title: l.name, parentTitle: null, isGroup: null,
    url: listUrl(l.projectId, l.listId, accountId),
  });

  if (!opts.token || !opts.fetchImpl) {
    lists.forEach((l) => out.set(`${l.projectId}/${l.listId}`, fallback(l, 'no Basecamp token')));
    return out;
  }

  const queue = lists.slice();
  async function worker() {
    while (queue.length) {
      const l = queue.shift();
      const api = `https://3.basecampapi.com/${accountId}/buckets/${l.projectId}/todolists/${l.listId}.json`;
      const r = await getWithRetry(opts.fetchImpl, api, opts.token, timeoutMs, retryDelayMs);
      const key = `${l.projectId}/${l.listId}`;
      if (r.status === 200 && r.body) {
        const parent = r.body.parent || {};
        const isGroup = parent.type === 'Todolist';
        out.set(key, {
          checked: true, found: true, title: r.body.title || l.name,
          parentTitle: isGroup ? parent.title || null : null, isGroup,
          url: listUrl(l.projectId, l.listId, accountId),
        });
      } else if (r.status === 404) {
        out.set(key, { ...fallback(l, 'not found in Basecamp'), checked: true, found: false });
      } else {
        out.set(key, fallback(l, r.error || `HTTP ${r.status}`));
      }
    }
  }
  const n = Math.max(1, Math.min(opts.concurrency || 4, lists.length));
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

module.exports = { fetchListMeta, listUrl };
