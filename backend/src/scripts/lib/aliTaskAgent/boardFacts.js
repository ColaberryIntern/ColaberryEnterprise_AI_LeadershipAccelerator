/**
 * boardFacts - the board's fact table: one compact row per task, so the page can cross-filter on
 * any combination of dimensions exactly (see boardRuntime for why per-list totals cannot).
 *
 *   facts: [[listIndex, band, period, kind], ...]
 *   lists: [{ id, name, cat, sub, shape }, ...]
 *
 * Pure. Every value is derived from fields the list lens already measured; nothing is inferred.
 */

/** Calendar quarter a task is due in, "YYYY-Qn", or "none". Invalid dates are "none", not a guess. */
function periodOf(dueOn) {
  if (!dueOn) return 'none';
  const d = dueOn instanceof Date ? dueOn : new Date(`${String(dueOn).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return 'none';
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/**
 * Who does the work. A person-marked task is "person" even when it is also machine-generated,
 * because "needs a person" is the fact that decides whether a session can do it.
 */
function kindOf(t) {
  if (t && t.humanOnly) return 'person';
  if (t && t.generated) return 'generated';
  return 'hand';
}

/** What Basecamp says the list is. Unchecked is said, not assumed to be a list. */
function shapeOf(l) {
  if (l.found === false) return 'gone';
  if (l.isGroup === true) return 'group';
  if (l.isGroup === false) return 'list';
  return 'unknown';
}

/**
 * A list's task rows. Lists that arrive with band counts but no task views (older callers, tests)
 * are expanded from the counts, with period "none" and kind "hand", so the totals still add up.
 */
function taskRows(l) {
  if (Array.isArray(l.tasks) && l.tasks.length) return l.tasks;
  const rows = [];
  (l.bands || []).forEach((b) => { for (let i = 0; i < (b.n || 0); i += 1) rows.push({ band: b.band }); });
  return rows;
}

/**
 * @param {Array} lists list summaries (with tasks or bands)
 * @param {(l:object)=>{id:string,name:string,cat:string,sub:string}} describe the list's identity
 */
function buildFacts(lists, describe) {
  const outLists = [];
  const facts = [];
  (Array.isArray(lists) ? lists : []).forEach((l, i) => {
    outLists.push({ ...describe(l), shape: shapeOf(l) });
    taskRows(l).forEach((t) => facts.push([i, t.band || 'fresh', periodOf(t.dueOn), kindOf(t)]));
  });
  return { lists: outLists, facts };
}

module.exports = { buildFacts, periodOf, kindOf, shapeOf };
