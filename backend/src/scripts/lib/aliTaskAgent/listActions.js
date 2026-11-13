/**
 * listActions - turn a strategic move on a list into an explicit, reversible PLAN.
 *
 * Nothing here writes. Each planner returns the exact set of changes, a one-line summary, and the
 * reversal, so the thing that executes can show all three before it does anything. A bulk action
 * over 39 tickets is precisely the case where "it seemed right" is not good enough.
 *
 * DISMISS DOES NOT CLOSE THE TICKET, AND THIS DISTINCTION MATTERS MORE THAN IT LOOKS.
 *
 * Dismissal writes `is_dismissed` on the local mirror. It removes the task from Ali's queue and
 * from every digest built on that mirror. It does NOT touch Basecamp: the ticket stays open, the
 * project still owns it, and anyone else assigned still sees it. That is deliberate. Most of the
 * backlog is scaffolding bulk-assigned to Ali from projects other people may still be running, and
 * "stop showing this to me" is a different decision from "this work is cancelled". Conflating them
 * would let a triage pass quietly close other people's projects.
 *
 * Re-dating and assignment DO have to reach Basecamp to be real, so those planners mark themselves
 * `writesToBasecamp` and the executor is expected to treat them differently.
 *
 * Pure: (tasks, options) -> plan. No I/O, clock injected.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function isWeekend(d) {
  const day = new Date(d).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Spread `count` tasks forward from a start date at `perWeek` a week, on working days only.
 *
 * Working days only because a due date landing on a Saturday is a due date nobody reads. The
 * spread is even rather than front-loaded: dumping all 26 on the first Monday reproduces exactly
 * the pile this whole exercise exists to undo.
 */
function scheduleDates(count, startDate, perWeek = 3) {
  const per = Math.max(1, Math.min(5, Math.floor(perWeek) || 3));
  const out = [];
  let cursor = new Date(`${iso(startDate)}T00:00:00Z`).getTime();
  let placedThisWeek = 0;
  let weekAnchor = null;

  while (out.length < count) {
    if (!isWeekend(cursor)) {
      if (weekAnchor === null) weekAnchor = cursor;
      // A new week resets the quota.
      if (cursor - weekAnchor >= 7 * DAY_MS) {
        weekAnchor = cursor;
        placedThisWeek = 0;
      }
      if (placedThisWeek < per) {
        out.push(iso(cursor));
        placedThisWeek += 1;
        // Space them out inside the week rather than on consecutive days, when the quota allows.
        const gap = per >= 5 ? 1 : Math.max(1, Math.floor(5 / per));
        cursor += gap * DAY_MS;
        continue;
      }
    }
    cursor += DAY_MS;
  }
  return out;
}

/** Order a list the way a person would work it: earliest promised first, then by title. */
function workingOrder(tasks) {
  return tasks.slice().sort((a, b) =>
    String(a.dueOn || '9999').localeCompare(String(b.dueOn || '9999'))
    || String(a.title || '').localeCompare(String(b.title || '')));
}

/**
 * Remove a list from Ali's queue without touching the project it belongs to.
 * @param {Array} tasks
 * @param {{reason:string, by?:string}} opts
 */
function planDismiss(tasks, opts = {}) {
  const reason = String(opts.reason || '').trim();
  const problems = [];
  if (!reason) problems.push('a reason is required: a dismissal nobody can explain later is a deletion');
  if (reason.length > REASON_MAX) {
    problems.push(`the reason is ${reason.length} characters; the column holds ${REASON_MAX}. Shorten it`);
  }

  const changes = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    field: 'is_dismissed',
    from: false,
    to: true,
    reason,
  }));

  return {
    action: 'dismiss',
    writesToBasecamp: false,
    problems,
    changes,
    summary: `Remove ${changes.length} task${changes.length === 1 ? '' : 's'} from the queue. `
      + 'The tickets stay OPEN in Basecamp and anyone else assigned still sees them.',
    reversal: `UPDATE ops_bc_todos SET is_dismissed = false, dismissed_at = NULL, `
      + `dismissed_by = NULL, dismissed_reason = NULL WHERE bc_id IN (...)`,
  };
}

/** ops_bc_todos.dismissed_reason is VARCHAR(40) (measured on prod 2026-11-12). */
const REASON_MAX = 40;

/**
 * The SQL that applies a dismiss plan, and the SQL that undoes it.
 *
 * bc_id and project_id are VARCHAR in ops_bc_todos. The first version compared bc_id to a
 * bigint[] and failed on prod with "operator does not exist: character varying = bigint" (probed
 * 2026-11-12), so every --apply would have errored. IDs stay TEXT end to end here, and each row is
 * matched on its (project_id, bc_id) pair, the same identity the board uses.
 * @param {{changes:Array<{id:string, reason:string}>}} plan  a planDismiss result
 * @param {string} by  recorded in dismissed_by
 * @returns {{sql:string, bind:Array, undo:string, pairs:number}}
 */
function dismissQuery(plan, by) {
  const pairs = (plan.changes || [])
    .map((c) => String(c.id || '').split('/'))
    .filter((p) => p.length === 2 && /^\d+$/.test(p[0]) && /^\d+$/.test(p[1]));
  const projects = pairs.map((p) => p[0]);
  const todos = pairs.map((p) => p[1]);
  const reason = (plan.changes[0] && plan.changes[0].reason) || '';
  const match = '(project_id, bc_id) IN (SELECT * FROM unnest($3::text[], $4::text[]))';
  // Undo is printed for a person to paste, so the ids are inlined; they are digits only (filtered above).
  const lit = (xs) => `ARRAY[${xs.map((x) => `'${x}'`).join(',')}]::text[]`;
  return {
    sql: `UPDATE ops_bc_todos
        SET is_dismissed = true, dismissed_at = now(), dismissed_by = $1, dismissed_reason = $2
      WHERE ${match} AND is_dismissed IS NOT TRUE`,
    bind: [by, reason, projects, todos],
    undo: 'UPDATE ops_bc_todos SET is_dismissed = false, dismissed_at = NULL, dismissed_by = NULL, '
      + `dismissed_reason = NULL WHERE dismissed_by = '${String(by).replace(/'/g, "''")}' AND (project_id, bc_id) IN `
      + `(SELECT * FROM unnest(${lit(projects)}, ${lit(todos)}));`,
    pairs: pairs.length,
  };
}

/**
 * Give a dormant but genuine list a schedule it can actually be worked to.
 * @param {Array} tasks
 * @param {{from:string, perWeek?:number}} opts
 */
function planRedate(tasks, opts = {}) {
  const problems = [];
  const from = String(opts.from || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    problems.push('a start date is required, as YYYY-MM-DD');
  }

  const ordered = workingOrder(tasks);
  const dates = problems.length ? [] : scheduleDates(ordered.length, from, opts.perWeek);
  const changes = ordered.map((t, i) => ({
    id: t.id,
    title: t.title,
    field: 'due_on',
    from: t.dueOn || null,
    to: dates[i] || null,
  }));

  const last = dates[dates.length - 1];
  return {
    action: 'redate',
    writesToBasecamp: true,
    problems,
    changes,
    summary: changes.length
      ? `Re-date ${changes.length} task${changes.length === 1 ? '' : 's'} from ${from} to ${last}, `
        + `${Math.max(1, Math.min(5, Math.floor(opts.perWeek || 3)))} a week on working days.`
      : 'Nothing to re-date.',
    reversal: 'Each change records its previous date; applying them in reverse restores the originals.',
  };
}

/**
 * Hand a list to one person.
 *
 * It does NOT remove the existing assignees. Replacing them would silently take work off whoever
 * is already on it, and a delegation that quietly unassigns someone is how a handover becomes an
 * outage. The executor adds; removing is a separate, deliberate call.
 */
function planAssign(tasks, opts = {}) {
  const problems = [];
  const to = String(opts.to || '').trim();
  if (!to) problems.push('name who it goes to');

  const changes = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    field: 'assignee_ids',
    op: 'add',
    to,
  }));

  return {
    action: 'assign',
    writesToBasecamp: true,
    problems,
    changes,
    summary: `Add ${to} to ${changes.length} task${changes.length === 1 ? '' : 's'}. `
      + 'Existing assignees are KEPT, so nobody loses work they already hold.',
    reversal: `Remove ${to} from the same ${changes.length} tasks.`,
  };
}

/** Render a plan for a human to approve, before anything happens. */
function renderPlan(plan, opts = {}) {
  const L = [];
  L.push(`PLAN: ${plan.action}`);
  L.push(`  ${plan.summary}`);
  if (plan.writesToBasecamp) L.push('  THIS WRITES TO BASECAMP. Other people see the result.');
  else L.push('  Local queue only. Basecamp is untouched.');
  if (plan.problems.length) {
    L.push('  CANNOT RUN:');
    plan.problems.forEach((p) => L.push(`    - ${p}`));
  }
  const show = plan.changes.slice(0, opts.limit || 8);
  show.forEach((c) => {
    const what = c.field === 'due_on' ? `${c.from || 'no date'} -> ${c.to}`
      : c.field === 'assignee_ids' ? `add ${c.to}`
        : `${c.field} -> ${c.to}`;
    L.push(`    ${String(c.id).padEnd(22)} ${what}   ${String(c.title || '').slice(0, 40)}`);
  });
  if (plan.changes.length > show.length) L.push(`    ... and ${plan.changes.length - show.length} more`);
  L.push(`  Reversal: ${plan.reversal}`);
  return L.join('\n');
}

module.exports = { planDismiss, dismissQuery, REASON_MAX, planRedate, planAssign, scheduleDates, workingOrder, renderPlan };
