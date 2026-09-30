/**
 * recentlyCommented — "only surface todos Ali has personally commented on in the
 * last month" filter source.
 *
 * WHY: the mirror holds 3,314 active todos assigned to Ali. Assignment alone is
 * a weak relevance signal (much of it is stale or never-touched). A far stronger
 * signal is Ali's own recent engagement: if he commented on a todo in the last
 * ~30 days, it is a live item he is actually working. This module produces the
 * set of todo ids Ali commented on within a window, which the queue builder
 * intersects with the assigned set.
 *
 * HOW (efficiently): there is no "todos I commented on" endpoint and no comment
 * table in the mirror, and `bc_updated_at` is bumped en masse so it cannot
 * pre-narrow. But the account-wide recordings feed
 * (`/projects/recordings.json?type=Comment`) returns comments newest-first with
 * `creator` + `parent` (the todo). Walking that feed until the window edge is
 * bounded by Ali's comment volume in the window (dozens-hundreds), NOT by the
 * 3,314 todos. That is the cheap direction.
 *
 * The page collector is pure + null-safe for unit testing; the walker is the
 * thin network loop around it.
 */
const ops = require('../launchPmoOps');
const { ALI_BC_USER_ID } = require('./aliTokenSource');

const DAY_MS = 86400000;

/**
 * Collect Ali-authored parent Todo ids from one page of Comment recordings,
 * accumulating into `acc`. Returns { ids, oldest } where `oldest` is the oldest
 * comment timestamp (ms) seen on the page, used to decide whether to keep paging.
 * @param {Array<{creator?:{id?:number}, created_at?:string, parent?:{id?:number,type?:string}}>} recordings
 * @param {number} aliId
 * @param {number} sinceMs epoch ms; comments older than this are ignored
 * @param {Set<number>} [acc]
 */
function collectAliParents(recordings, aliId, sinceMs, acc) {
  const ids = acc || new Set();
  let oldest = null;
  for (const r of Array.isArray(recordings) ? recordings : []) {
    const ts = r && r.created_at ? Date.parse(r.created_at) : NaN;
    if (!Number.isNaN(ts)) oldest = oldest == null ? ts : Math.min(oldest, ts);
    if (!r || !r.creator || Number(r.creator.id) !== Number(aliId)) continue;
    if (!Number.isNaN(ts) && ts < sinceMs) continue;
    const p = r.parent;
    if (p && p.type === 'Todo' && p.id != null) ids.add(Number(p.id));
  }
  return { ids, oldest };
}

/**
 * Walk the account Comment feed newest-first and return the Set of Todo ids Ali
 * commented on since `sinceMs`. Stops at the window edge (a page whose oldest
 * comment predates the window) or at `maxPages` (a safety cap on a busy account).
 *
 * @param {object} [opts]
 * @param {number} [opts.aliId]
 * @param {number} [opts.sinceMs]   default: now - 30 days
 * @param {number} [opts.maxPages]  default: 600
 * @param {object} [opts.bc]        Basecamp client (defaults to launchPmoOps)
 * @param {(msg:string)=>void} [opts.log]
 * @returns {Promise<{ ids:Set<number>, pages:number, reachedEdge:boolean, oldestIso:string|null }>}
 */
async function fetchAliCommentedTodoIds(opts = {}) {
  const aliId = Number(opts.aliId || ALI_BC_USER_ID);
  const sinceMs = opts.sinceMs || Date.now() - 30 * DAY_MS;
  const maxPages = opts.maxPages || 600;
  const bc = opts.bc || ops;
  const log = opts.log || (() => {});

  const ids = new Set();
  let page = 1;
  let reachedEdge = false;
  let oldest = null;

  while (page <= maxPages) {
    let batch;
    try {
      batch = await bc.bcGet(`/projects/recordings.json?type=Comment&sort=created_at&direction=desc&page=${page}`);
    } catch (e) {
      log(`recordings feed page ${page} failed: ${e.message}`);
      break;
    }
    if (!Array.isArray(batch) || batch.length === 0) { reachedEdge = true; break; }
    const res = collectAliParents(batch, aliId, sinceMs, ids);
    if (res.oldest != null) oldest = oldest == null ? res.oldest : Math.min(oldest, res.oldest);
    if (res.oldest != null && res.oldest < sinceMs) { reachedEdge = true; break; }
    page++;
  }

  return {
    ids,
    pages: page,
    reachedEdge,
    oldestIso: oldest != null ? new Date(oldest).toISOString() : null,
  };
}

module.exports = { collectAliParents, fetchAliCommentedTodoIds, DAY_MS };
