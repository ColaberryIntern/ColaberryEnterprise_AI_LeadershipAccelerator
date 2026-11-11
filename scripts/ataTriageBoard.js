#!/usr/bin/env node
/**
 * Render the backlog triage board from live data.
 *
 * READ-ONLY. It queries the ops_bc_todos mirror and writes an HTML file. It posts nothing, emails
 * nothing and changes no ticket, which is deliberate: the board exists to make a decision easier,
 * and a report that also acts is a report you have to audit before you can read it.
 *
 * Run inside accelerator-backend, where the database credentials live:
 *   node /tmp/ataTriageBoard.js --out /tmp/triage.html [--days 60] [--limit 400]
 *
 * --days sets where dormant begins. It is surfaced as a flag rather than fixed because the right
 * cut depends on the cadence of the work, and the whole point of the board is to argue about that
 * number rather than inherit it.
 */
const fs = require('fs');
const path = require('path');
const { sequelize } = require('/app/dist/config/database');
const { QueryTypes } = require('/app/node_modules/sequelize');

/**
 * The renderer is required RELATIVE to this file, not from /app/dist.
 *
 * These are plain .js modules under src/scripts/lib, and whether the image's build copies them
 * into dist is an assumption rather than a fact. Resolving relatively means the script runs
 * wherever its three modules sit beside it, including a scratch directory, which is how it was
 * first run against production.
 */
const libDir = fs.existsSync(path.join(__dirname, 'renderTriageBoard.js'))
  ? __dirname
  : path.join(__dirname, '../backend/src/scripts/lib/aliTaskAgent');
const { renderTriageBoard } = require(path.join(libDir, 'renderTriageBoard'));
const { summarize, daysOverdue } = require(path.join(libDir, 'ageBands'));
const { buildWorkOrder, runCommand } = require(path.join(libDir, 'workOrder'));

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};

const OUT = arg('out', '/tmp/triage.html');
const DAYS = Number(arg('days', '60'));
const LIMIT = Number(arg('limit', '400'));
const HOLDER = arg('holder', 'board');
const ALI_BC_ID = 17454835; // Ali's Basecamp person id. The 16988292 in older code is an OAuth id.

(async () => {
  const rows = await sequelize.query(`
    SELECT bc_id, project_id, title, description, category, status, due_on, urgency_score,
           bc_app_url, todolist_name, assignee_ids, bc_updated_at
      FROM ops_bc_todos
     WHERE status = 'active'
       AND (is_dismissed IS NOT TRUE)
       AND (assignee_ids IS NULL OR assignee_ids::text LIKE $1)
     ORDER BY urgency_score DESC NULLS LAST, due_on ASC NULLS LAST
     LIMIT $2`,
  { type: QueryTypes.SELECT, bind: [`%${ALI_BC_ID}%`, LIMIT] });

  // __row keeps the raw mirror row attached, so the work-order builder can read description,
  // category and the rest without a second query.
  const items = rows.map((r) => ({
    projectId: r.project_id,
    projectName: r.todolist_name || '',
    url: r.bc_app_url || '',
    score: r.urgency_score == null ? null : Number(r.urgency_score),
    todo: { id: r.bc_id, title: r.title, due_on: r.due_on, updated_at: r.bc_updated_at },
    __row: r,
  }));

  const now = new Date();
  const runId = `TRIAGE-${now.toISOString().slice(0, 10)}`;

  /**
   * Work orders are built for the LIVE set plus the most recently dormant, not for all 2,694.
   * A handoff bundle that contains the whole backlog is a bundle nobody opens, and the dormant
   * tail is a disposition exercise rather than a work queue.
   */
  const { partition } = require(path.join(libDir, 'ageBands'));
  const { live, dormant } = partition(items, now, { dormantAfterDays: DAYS });
  const recentDormant = dormant
    .slice()
    .sort((a, b) => String(b.todo.due_on || '').localeCompare(String(a.todo.due_on || '')))
    .slice(0, 20);

  const orderRows = [...live, ...recentDormant].map((i) => i.__row).filter(Boolean);
  let workOrders = orderRows.map((r) => buildWorkOrder(r, now));

  /**
   * Subtract what another worker already holds.
   *
   * Without this the board hands the same ticket to every tab that opens it, which is the exact
   * collision the claims table exists to prevent - and the board is the most likely place for it
   * to happen, because it is what people paste from.
   *
   * partitionByClaim is fail-open: if the claims table cannot be read, nothing is withheld. A
   * board that silently showed no work would look like a quiet day rather than a broken query.
   */
  let claimedOut = [];
  try {
    const { partitionByClaim } = require('/app/dist/services/ops/taskClaims');
    const split = await partitionByClaim(workOrders, HOLDER);
    workOrders = split.available;
    claimedOut = split.claimed;
  } catch (e) {
    console.warn(`[board] claims unavailable (${e && e.message}); showing all work orders`);
  }

  /**
   * The list lens is built over EVERY task, not over the work-order subset.
   *
   * That difference is the point of the lens: a list is only worth deciding as a whole if you can
   * see the whole of it, and the work orders deliberately cover only what is worth working now. A
   * list card built from the subset would report "3 tasks" for a list holding 39.
   */
  const { byList, withSiblings, looksGenerated } = require(path.join(libDir, 'listLens'));
  const { bandFor } = require(path.join(libDir, 'ageBands'));
  const taskViews = items.map((i) => {
    const r = i.__row || {};
    const desc = String(r.description || '');
    return {
      id: `${r.project_id}/${r.bc_id}`,
      title: r.title,
      list: r.todolist_name || '(no list)',
      url: r.bc_app_url || null,
      dueOn: r.due_on || null,
      daysOverdue: daysOverdue(r.due_on, now),
      band: bandFor(r.due_on, now).key,
      urgency: r.urgency_score == null ? null : Number(r.urgency_score),
      // The generated shape and the human marker, both measured rather than guessed: 1,386 of
      // 2,403 tasks in the main project carry "Type:" plus "Done when:", and the task split marks
      // human work with an emoji.
      generated: looksGenerated({ title: r.title, description: desc }),
      humanOnly: desc.includes('\u{1F9D1}'),
    };
  });
  const lists = withSiblings(byList(taskViews));

  const html = renderTriageBoard({
    items, today: now, runId, dormantAfterDays: DAYS, workOrders, lists, listLimit: 12,
  });
  fs.writeFileSync(OUT, html, 'utf8');

  /**
   * The bundle is the machine half of the same report. The HTML is what Ali reads; this is what a
   * session reads, so it carries every work order rather than the eight shown per group.
   */
  const bundlePath = OUT.replace(/\.html?$/i, '') + '.bundle.json';
  fs.writeFileSync(bundlePath, JSON.stringify({
    runId,
    generatedAt: now.toISOString(),
    dormantAfterDays: DAYS,
    command: runCommand(runId, { top: 5 }),
    counts: { total: items.length, live: live.length, dormant: dormant.length, lists: lists.length },
    lists: lists.map((l) => ({ key: l.key, name: l.name, position: l.position, total: l.total,
      live: l.live, dormant: l.dormant, generatedShare: l.generatedShare, humanShare: l.humanShare,
      oldestDue: l.oldestDue, lead: l.lead ? { id: l.lead.id, title: l.lead.title } : null,
      suggestions: l.suggestions, taskIds: l.tasks.map((t) => t.id) })),
    workOrders,
  }, null, 2), 'utf8');

  // A one-line summary to stdout so the run is auditable without opening the file.
  const s = summarize(items, new Date(), { dormantAfterDays: DAYS });
  console.log(`rows=${items.length} live=${s.liveCount} dormant=${s.dormantCount} `
    + `claimed=${claimedOut.length} `
    + `(${Math.round(s.dormantShare * 100)}%) oldest=${s.worst ? s.worst.days + 'd' : 'n/a'} -> ${OUT}`);

  await sequelize.close();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });
