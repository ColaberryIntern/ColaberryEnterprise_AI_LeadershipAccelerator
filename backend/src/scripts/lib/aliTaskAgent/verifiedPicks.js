/**
 * verifiedPicks - choose the five tasks and the five lists from work that is STILL LIVE in
 * Basecamp, so every link in the Morning Five opens something real.
 *
 * WHY: the ops_bc_todos mirror does not see trashing. On 2026-11-12 the email ranked
 * "Path to Profitability - decisions for Ram" as the #1 list and linked five of its to-dos; the
 * whole list was in the Basecamp trash (Ali clicked through and found it). Basecamp answers 200
 * for a trashed list or to-do, with status "trashed", so "not found" alone never caught it.
 *
 * HOW, in order:
 *   1. score everything (pickFive), then ask Basecamp about every LIST holding a pressing task;
 *      drop every task in a list that is trashed, archived or gone
 *   2. pick the five tasks and the five lists from what is left
 *   3. ask Basecamp about every TO-DO the email will link (the five, and the top three of each
 *      list); if any is dead (trashed, archived, completed, gone), drop it and pick again
 *   Bounded: at most `maxRounds` (3) rounds of step 3; nothing loops forever.
 *
 * FAIL-OPEN: a list or to-do Basecamp could not answer for (no token, timeouts after retries) is
 * kept, never hidden, and counted in `unchecked` so the report can say so plainly.
 *
 * The Basecamp calls are injected (listMeta.fetchListMeta / fetchTodoState), so this is tested
 * without the network.
 */

const { pickFive } = require('./pressingFive');
const { pickFiveLists } = require('./pressingLists');
const { byList } = require('./listLens');

/** "<projectId>/<bcId>" -> { projectId, bcId } */
const splitId = (id) => { const [projectId, bcId] = String(id).split('/'); return { projectId, bcId }; };

/**
 * @param {{orders:Array, views:Array, now:Date, checkLists:Function, checkTodos:Function, maxRounds?:number}} input
 *   orders  work orders (with listId, cat, generated) for the live tasks
 *   views   task views for listLens.byList over EVERY active task
 *   checkLists(lists[{projectId,listId,name}]) -> Map("<p>/<l>" -> {checked, found, why})
 *   checkTodos(todos[{projectId,bcId}])        -> Map("<p>/<id>" -> {checked, live, why})
 */
async function verifiedPicks({ orders, views, now, checkLists, checkTodos, maxRounds = 3 }) {
  const deadLists = new Map();   // "<p>/<l>" -> why
  const deadTodos = new Map();   // "<p>/<id>" -> why
  let unchecked = 0;

  // 1. Lists holding a pressing task.
  const first = pickFive(orders, now);
  const listKeys = new Map();
  for (const t of first.scored) {
    if (t.listId) listKeys.set(`${t.projectId}/${t.listId}`, { projectId: String(t.projectId), listId: String(t.listId), name: t.list });
  }
  // ...and every big dormant pile, which "the one move" can name (pressingFive.pickOneMove rule 2).
  for (const s of byList(views)) {
    if (s.listId && s.dormant >= 20) listKeys.set(s.id, { projectId: String(s.projectId), listId: String(s.listId), name: s.key });
  }
  const listState = await checkLists([...listKeys.values()]);
  for (const [k, m] of listState) {
    if (m.checked && m.found === false) deadLists.set(k, m.why);
    else if (!m.checked) unchecked += 1;
  }

  const inDeadList = (x) => x.listId && deadLists.has(`${x.projectId}/${x.listId}`);
  const verifiedTodo = new Set();
  let result = null;
  for (let round = 1; round <= maxRounds; round += 1) {
    const alive = orders.filter((o) => !inDeadList(o) && !deadTodos.has(o.id));
    const aliveViews = views.filter((v) => !inDeadList(v) && !deadTodos.has(v.id));
    const five = pickFive(alive, now);
    const summaries = byList(aliveViews);
    const lists = pickFiveLists(five.scored, summaries);
    result = { ...five, summaries, listPick: lists, rounds: round };

    // 3. Every to-do the email will link.
    const linked = new Set(five.picks.map((p) => p.id));
    lists.picks.forEach((l) => l.pressing.slice(0, 3).forEach((t) => linked.add(t.id)));
    const toCheck = [...linked].filter((id) => !verifiedTodo.has(id));
    if (!toCheck.length) break;
    const state = await checkTodos(toCheck.map(splitId));
    let newlyDead = 0;
    for (const id of toCheck) {
      verifiedTodo.add(id);
      const s = state.get(id);
      if (s && s.checked && s.live === false) { deadTodos.set(id, s.why); newlyDead += 1; }
      else if (!s || !s.checked) unchecked += 1;
    }
    if (!newlyDead) break;
  }
  // If the last round still found a dead link, strip it rather than ship it (fewer than five is
  // honest; a dead link is not).
  const live = (t) => !deadTodos.has(t.id);
  const picks = result.picks.filter(live);
  const listPicks = result.listPick.picks
    .map((l) => ({ ...l, pressing: l.pressing.filter(live) }))
    .filter((l) => l.pressing.length);
  return { ...result, picks, listPick: { ...result.listPick, picks: listPicks }, deadLists, deadTodos, unchecked };
}

module.exports = { verifiedPicks };
