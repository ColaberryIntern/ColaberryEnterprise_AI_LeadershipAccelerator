/**
 * queueBuilder — the "find my tasks" layer of the Ali Task Agent.
 *
 * Scans Basecamp for open to-dos ASSIGNED TO ALI across all active projects,
 * scores each one deterministically (no LLM), and returns a priority-sorted
 * work-list. This is the API-direct sibling of the bcSyncService `ops_bc_todos`
 * mirror: it reuses the proven project -> todoset -> todolists -> todos walk
 * from runCbAiTasksGeneric.js, but filters by assignee instead of AI-tier and
 * sweeps every project instead of one.
 *
 * Why API-direct instead of the DB mirror (a logged deviation from the plan):
 *   - matches the existing runner pattern exactly (one less moving part),
 *   - self-contained + unit-testable with a mocked `bc` client (no Sequelize
 *     bootstrap in a CLI script),
 *   - no staleness window between a new assignment and the next 2-min sync.
 * The mirror remains a valid Phase-2 optimization if project count grows.
 *
 * Scoring mirrors the deterministic priority engine inputs (due-date proximity,
 * staleness, title keyword tier). Pure functions are exported for unit tests.
 */
const ops = require('../launchPmoOps');
const { isAtaPost, stripHtml } = require('./signoff');
const { ALI_BC_USER_ID } = require('./aliTokenSource');

const DAY_MS = 86400000;

function startOfUtcDay(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Whole UTC days from `iso` until `today` (negative if iso is in the future). */
function daysSince(iso, today) {
  if (!iso) return null;
  const then = startOfUtcDay(new Date(iso));
  return Math.floor((startOfUtcDay(today).getTime() - then.getTime()) / DAY_MS);
}

/** True when the to-do's assignee list contains Ali. Null-safe. */
function isAssignedToAli(todo, aliId = ALI_BC_USER_ID) {
  return (todo && Array.isArray(todo.assignees) ? todo.assignees : []).some(
    (a) => a && Number(a.id) === Number(aliId),
  );
}

/**
 * Deterministic priority score (0-100). Mirrors the Ops priority-engine inputs.
 * Pure: same todo + same `today` -> same score.
 * @param {{ due_on?: string|null, updated_at?: string, content?: string }} todo
 * @param {Date} today
 */
function scoreTask(todo, today = new Date()) {
  let score = 0;

  // Due-date proximity (max 40)
  const dueIn = todo.due_on ? -daysSince(todo.due_on, today) : null; // days until due
  if (dueIn === null) score += 0;
  else if (dueIn < 0) score += 40;        // overdue
  else if (dueIn === 0) score += 35;      // due today
  else if (dueIn <= 2) score += 24;
  else if (dueIn <= 7) score += 12;

  // Staleness since last update (max 20)
  const stale = daysSince(todo.updated_at, today);
  if (stale !== null) {
    if (stale > 14) score += 20;
    else if (stale >= 7) score += 12;
  }

  // Title keyword tier (max 15)
  const title = (todo.content || '').toLowerCase();
  if (/\b(urgent|critical|asap|blocker|p0)\b/.test(title)) score += 15;
  else if (/\b(hot|important|priority|p1)\b/.test(title)) score += 8;
  else if (/\b(review|reply|respond|follow[- ]?up)\b/.test(title)) score += 5;

  return Math.min(100, score);
}

/**
 * Keep only items whose todo id is in `commentedTodoIds` (the set of todos Ali
 * commented on within the window). Pure. A null/undefined set is a no-op (filter
 * disabled), so callers can opt in.
 */
function filterByCommented(items, commentedTodoIds) {
  if (!commentedTodoIds) return items;
  return (items || []).filter((it) => commentedTodoIds.has(Number(it.todo.id)));
}

/** Map one ops_bc_todos mirror row to a queue item shape. */
function mirrorRowToItem(r, today = new Date()) {
  const todo = {
    id: Number(r.bc_id),
    content: r.title,
    description: r.description,
    due_on: r.due_on || null,
    updated_at: r.bc_updated_at,
    app_url: r.bc_app_url,
    assignees: [{ id: ALI_BC_USER_ID }],
  };
  // Prefer the priority engine's stored urgency; fall back to our own score.
  const score = r.urgency_score != null ? Number(r.urgency_score) : scoreTask(todo, today);
  return {
    projectId: Number(r.project_id),
    projectName: r.project_name || `project ${r.project_id}`,
    listName: r.todolist_name || '',
    todo,
    score,
  };
}

/**
 * Build the priority-sorted work-list from ops_bc_todos MIRROR rows (the fast,
 * scalable source — a single DB query vs a 66-project API sweep). Optionally
 * filters to todos Ali recently commented on. Pure: no I/O, unit-testable.
 *
 * @param {Array<object>} rows  ops_bc_todos rows (assigned + active)
 * @param {object} [opts]
 * @param {Set<number>} [opts.commentedTodoIds]  when set, keep only these todos
 * @param {Date} [opts.today]
 * @param {number} [opts.max]
 */
function buildQueueFromRows(rows, opts = {}) {
  const today = opts.today || new Date();
  const max = opts.max || 25;
  let items = (rows || []).map((r) => mirrorRowToItem(r, today));
  items = filterByCommented(items, opts.commentedTodoIds);
  items.sort(
    (a, b) => b.score - a.score || (a.todo.due_on || '9999').localeCompare(b.todo.due_on || '9999'),
  );
  return items.slice(0, max);
}

/**
 * Build the priority-sorted work-list of open todos assigned to Ali via the
 * Basecamp API sweep (fallback source when the DB mirror is unavailable).
 *
 * @param {object} [opts]
 * @param {number} [opts.aliId]
 * @param {Date}   [opts.today]
 * @param {number} [opts.max]      cap on returned items (default 25)
 * @param {object} [opts.bc]       Basecamp client (defaults to launchPmoOps)
 * @param {Set<number>} [opts.commentedTodoIds]  when set, keep only these todos
 * @returns {Promise<Array<{projectId:number, projectName:string, listName:string, todo:object, score:number}>>}
 */
async function buildQueue(opts = {}) {
  const aliId = Number(opts.aliId || ALI_BC_USER_ID);
  const today = opts.today || new Date();
  const max = opts.max || 25;
  const bc = opts.bc || ops;

  const projects = await bc.bcGetAll('/projects.json');
  let items = [];

  for (const p of projects || []) {
    let dock = p.dock;
    if (!Array.isArray(dock)) {
      // The list endpoint usually includes dock; fall back to the project fetch.
      try { dock = (await bc.bcGet(`/projects/${p.id}.json`)).dock; } catch { dock = []; }
    }
    const todoset = (dock || []).find((d) => d.name === 'todoset');
    if (!todoset) continue;

    let lists = [];
    try { lists = await bc.bcGetAll(`/buckets/${p.id}/todosets/${todoset.id}/todolists.json`); } catch { continue; }

    for (const list of lists || []) {
      if (list.completed) continue;
      let todos = [];
      try { todos = await bc.bcGetAll(`/buckets/${p.id}/todolists/${list.id}/todos.json?status=remaining`); } catch { continue; }
      for (const t of todos || []) {
        if (!isAssignedToAli(t, aliId)) continue;
        items.push({
          projectId: p.id,
          projectName: p.name,
          listName: list.name,
          todo: t,
          score: scoreTask(t, today),
        });
      }
    }
  }

  items = filterByCommented(items, opts.commentedTodoIds);
  items.sort(
    (a, b) => b.score - a.score || (a.todo.due_on || '9999').localeCompare(b.todo.due_on || '9999'),
  );
  return items.slice(0, max);
}

module.exports = {
  buildQueue,
  buildQueueFromRows,
  mirrorRowToItem,
  filterByCommented,
  scoreTask,
  isAssignedToAli,
  daysSince,
  // re-exported for callers that dedup against a fetched thread
  isAtaPost,
  stripHtml,
};
