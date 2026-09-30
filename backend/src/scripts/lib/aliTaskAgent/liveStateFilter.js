/**
 * Live-state guard for the Ali Task Agent (Layer 1 trust fix).
 *
 * The ATA queue comes from the ops_bc_todos mirror, which can be stale on
 * COMPLETION: Basecamp's feed sync stops surfacing a todo once it is completed,
 * so the mirror keeps a stale status='active'. Because such todos are old and
 * overdue, the urgency score floats them to the TOP of the queue - which is
 * exactly where a dead ticket does the most damage to trust (observed
 * 2026-07-10: the top 4 "needs your decision" items were all already completed).
 *
 * This guard re-checks each queued todo against LIVE Basecamp and drops the ones
 * already completed, so ATA never surfaces (or acts on) a closed ticket.
 *
 * Fail-open by design: a todo we cannot verify (network error, 401, timeout) is
 * KEPT, never silently hidden - we would rather show a maybe-open task than hide
 * a real one. Only a positive completed=true (or a 404 = trashed/gone) drops it.
 *
 * bcGet is injected, so this is a pure unit under test (no network).
 */

const DEFAULT_PACE_MS = 180;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolve the LIVE completion state of one queue item. Returns
// { completed:true, gone? } to drop, { error } to keep (fail-open), or
// { completed:false } to keep.
async function isCompletedLive(bcGet, item) {
  const pid = item && item.projectId;
  const id = item && item.todo && item.todo.id;
  if (id == null) return { error: 'missing todo id' }; // keep (fail-open)
  try {
    const todo = await bcGet(`/buckets/${pid}/todos/${id}.json`);
    return { completed: !!(todo && todo.completed) };
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (/->\s*404\b/.test(msg) || /\b404\b/.test(msg)) return { completed: true, gone: true }; // trashed/removed
    return { error: msg }; // unverifiable -> fail-open (keep)
  }
}

/**
 * Partition an ATA queue into still-open (live) and dropped (completed/gone).
 * @param {Array} queue  items shaped { projectId, todo:{ id, content }, ... }
 * @param {{ bcGet: Function, paceMs?: number }} deps
 * @returns {Promise<{ live: Array, dropped: Array<{id,content,reason}>, unverified: number }>}
 */
async function filterOutCompleted(queue, deps = {}) {
  const { bcGet } = deps;
  const paceMs = deps.paceMs == null ? DEFAULT_PACE_MS : deps.paceMs;
  const items = Array.isArray(queue) ? queue : [];
  if (typeof bcGet !== 'function') return { live: items, dropped: [], unverified: 0 };

  const live = [];
  const dropped = [];
  let unverified = 0;
  for (const item of items) {
    const r = await isCompletedLive(bcGet, item);
    if (r.completed) {
      dropped.push({ id: item.todo && item.todo.id, content: item.todo && item.todo.content, reason: r.gone ? 'not-found' : 'completed' });
    } else {
      if (r.error) unverified++;
      live.push(item); // open, or unverifiable (fail-open)
    }
    if (paceMs) await sleep(paceMs);
  }
  return { live, dropped, unverified };
}

module.exports = { filterOutCompleted, isCompletedLive };
