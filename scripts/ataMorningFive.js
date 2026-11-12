#!/usr/bin/env node
/**
 * Render the morning report: the five most pressing tasks, walked through, plus the prompt for
 * the one move worth making today. PREVIEW (Ali, 2026-11-11: "let me see what that looks like to
 * finalize"); scheduling and delivery are decided after he has seen it.
 *
 * READ-ONLY. It queries the ops_bc_todos mirror and the claims table and writes one HTML file.
 * It sends nothing, posts nothing, and changes no ticket.
 *
 * Run inside accelerator-backend, where the database credentials live:
 *   node /tmp/mf/ataMorningFive.js --out /tmp/morning-five.html [--days 60]
 *
 * FAILURE MODES: if the claims table cannot be read, nothing is withheld (fail-open, logged), the
 * same rule as the board: a report that silently showed nothing would look like a quiet day.
 */
const fs = require('fs');
const path = require('path');
const { sequelize } = require('/app/dist/config/database');
const { QueryTypes } = require('/app/node_modules/sequelize');

const libDir = fs.existsSync(path.join(__dirname, 'pressingFive.js'))
  ? __dirname
  : path.join(__dirname, '../backend/src/scripts/lib/aliTaskAgent');
const lib = (m) => require(path.join(libDir, m));
const { partition, bandFor } = lib('ageBands');
const { buildWorkOrder, renderWorkOrderText } = lib('workOrder');
const { byList, looksGenerated } = lib('listLens');
const { categoryOf } = lib('listCategories');
const { pickFive, pickOneMove } = lib('pressingFive');
const { pickFiveLists, proposalFor } = lib('pressingLists');
const { listUrl } = lib('listMeta');
const { buildTaskPrompt, buildListPrompt } = lib('promptBuilder');
const { renderMorningFive } = lib('renderMorningFive');

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const OUT = arg('out', '/tmp/morning-five.html');
// --json writes a machine summary beside the HTML (the sender builds the subject and plain-text
// part from it); --board-note says where the interactive board is, which differs by delivery.
const JSON_OUT = arg('json', null);
const BOARD_NOTE = arg('board-note', 'The full interactive board is Downloads\\backlog-navigator.html.');
const DAYS = Number(arg('days', '60'));
const HOLDER = arg('holder', 'morning-five');
const ALI_BC_ID = 17454835;
const log = (o) => console.log(JSON.stringify({ service: 'morning-five', ...o }));

(async () => {
  const t0 = Date.now();
  const rows = await sequelize.query(`
    SELECT bc_id, project_id, title, description, category, status, due_on, urgency_score,
           bc_app_url, todolist_id, todolist_name, bc_updated_at
      FROM ops_bc_todos
     WHERE status = 'active' AND (is_dismissed IS NOT TRUE)
       AND (assignee_ids IS NULL OR assignee_ids::text LIKE $1)
     LIMIT 5000`,
  { type: QueryTypes.SELECT, bind: [`%${ALI_BC_ID}%`] });

  // Every day count is taken from the CENTRAL date Ali reads it on, pinned to noon UTC so that the
  // UTC-based helpers below land on that same calendar day. Using the raw clock made an evening
  // build count everything one day too late (found on the first test send, 2026-11-11 ~6pm CT).
  const { centralDate } = lib('morningFiveEmail');
  const now = new Date(`${centralDate(new Date())}T12:00:00Z`);
  const items = rows.map((r) => ({ todo: { id: r.bc_id, title: r.title, due_on: r.due_on }, __row: r }));
  const { live, dormant } = partition(items, now, { dormantAfterDays: DAYS });

  let orders = live.map((i) => {
    const r = i.__row;
    const wo = buildWorkOrder(r, now);
    const cat = categoryOf(r.todolist_name, r.project_id);
    return { ...wo, listId: r.todolist_id ? String(r.todolist_id) : null, cat: cat.key, generated: looksGenerated({ title: r.title, description: r.description }),
      path: `${cat.label} / ${cat.sub.label} / ${r.todolist_name || '(no list)'}` };
  });

  let claimed = [];
  try {
    const { partitionByClaim } = require('/app/dist/services/ops/taskClaims');
    const split = await partitionByClaim(orders, HOLDER);
    orders = split.available;
    claimed = split.claimed;
  } catch (e) {
    log({ level: 'warn', event: 'claims_unavailable', error_class: (e && e.name) || 'Error' });
  }

  const { picks, qualified, scored } = pickFive(orders, now);

  // List summaries over EVERY task, for the "decide a whole list" candidate.
  const lists = byList(rows.map((r) => ({
    id: `${r.project_id}/${r.bc_id}`, projectId: String(r.project_id), listId: r.todolist_id ? String(r.todolist_id) : null,
    title: r.title, list: r.todolist_name || '(no list)', dueOn: r.due_on, band: bandFor(r.due_on, now).key, // bandFor's dormant line is fixed at 60 days, matching --days' default
    generated: looksGenerated({ title: r.title, description: r.description }),
    humanOnly: String(r.description || '').includes('\u{1F9D1}'),
  })));

  // The five LISTS (Ali, 2026-11-12), ranked from the same task scores as the five tasks.
  const listPick = pickFiveLists(scored, lists);
  const fiveLists = listPick.picks.map((l) => {
    const cat = categoryOf(l.key, l.projectId);
    return { key: l.key, url: l.listId && l.projectId ? listUrl(l.projectId, l.listId) : null,
      path: `${cat.label} / ${cat.sub.label}`, score: l.score, reasons: l.reasons,
      total: l.total, live: l.live, dormant: l.dormant, oldestDue: l.oldestDue,
      pressing: l.pressing.map((t) => ({ id: t.id, title: t.title, url: t.url, late: t.late, score: t.score })),
      // A decision list is decided; otherwise the list's own strongest suggestion (pressingLists.proposalFor).
      proposal: proposalFor(l) };
  });

  const move = pickOneMove({ picks, lists });
  const movePrompt = move.kind === 'task'
    ? buildTaskPrompt(move.item, renderWorkOrderText(move.item))
    : move.kind === 'list'
      ? buildListPrompt(move.list, { category: { label: (() => { const c = categoryOf(move.list.key, move.list.projectId); return `${c.label} / ${c.sub.label}`; })() },
        totals: { tasks: rows.length, lists: lists.length, dormant: dormant.length } })
      : '';

  const html = renderMorningFive({
    today: now, runId: `MORNING-FIVE-${now.toISOString().slice(0, 10)}`, picks, lists: fiveLists, move, movePrompt,
    counts: { tasks: rows.length, live: live.length, dormant: dormant.length, qualified, claimed: claimed.length,
      listsQualified: listPick.qualified },
    boardNote: BOARD_NOTE,
  });
  fs.writeFileSync(OUT, html, 'utf8');
  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({
      generatedAt: new Date().toISOString(), // the real clock; `now` is the Central reading day
      counts: { tasks: rows.length, live: live.length, dormant: dormant.length, qualified, claimed: claimed.length },
      move: { kind: move.kind, rule: move.rule, why: move.why,
        title: move.kind === 'task' ? move.item.title : move.kind === 'list' ? `Decide the list "${move.list.key}"` : null },
      movePrompt,
      picks: picks.map((p) => ({ id: p.id, title: p.title, url: p.url, path: p.path, dueOn: p.dueOn,
        late: p.late, score: p.score, isDecision: p.isDecision })),
      lists: fiveLists.map((l) => ({ key: l.key, url: l.url, path: l.path, score: l.score, total: l.total,
        live: l.live, dormant: l.dormant, pressing: l.pressing.length, lead: l.pressing[0] || null,
        proposal: l.proposal ? l.proposal.label : null })),
    }, null, 2), 'utf8');
  }

  log({ level: 'info', event: 'rendered', outcome: 'success', duration_ms: Date.now() - t0,
    tasks: rows.length, live: live.length, qualified, picks: picks.map((p) => `${p.id}:${p.score}`),
    move: move.kind, rule: move.rule, bytes: Buffer.byteLength(html), out: OUT });
  await sequelize.close();
  process.exit(0);
})().catch((e) => {
  log({ level: 'error', event: 'failed', outcome: 'failure', error_class: (e && e.name) || 'Error', message: e && e.message });
  process.exit(1);
});
