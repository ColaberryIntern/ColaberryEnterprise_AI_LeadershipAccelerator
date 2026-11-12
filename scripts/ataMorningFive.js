#!/usr/bin/env node
/**
 * Render the morning report: five lists and five tasks ranked together by impact, the most
 * impactful framed in gold as the one move, each with an Open-in-Basecamp and a Copy-for-Claude-Code
 * button, and a guided tour of the same ten (Ali, 2026-11-12). Sent daily by sendMorningFive.js.
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
const { looksGenerated } = lib('listLens');
const { categoryOf } = lib('listCategories');
const { proposalFor } = lib('pressingLists');
const { verifiedPicks } = lib('verifiedPicks');
const { listUrl, fetchListMeta, fetchTodoState } = lib('listMeta');
const { buildFeed } = lib('morningFeed');
const { copyLink, tourLink } = lib('tourLinks');
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

  // Task views over EVERY task, for the list summaries ("decide a whole list" and the five lists).
  const views = rows.map((r) => ({
    id: `${r.project_id}/${r.bc_id}`, projectId: String(r.project_id), listId: r.todolist_id ? String(r.todolist_id) : null,
    title: r.title, list: r.todolist_name || '(no list)', dueOn: r.due_on, band: bandFor(r.due_on, now).key, // bandFor's dormant line is fixed at 60 days, matching --days' default
    generated: looksGenerated({ title: r.title, description: r.description }),
    humanOnly: String(r.description || '').includes('\u{1F9D1}'),
  }));

  // Pick from what is STILL LIVE in Basecamp (Ali, 2026-11-12: links opened trashed lists).
  // Read-only GETs; with no token every check is "unchecked" and the report says so.
  let token = null;
  try {
    const { refreshBcToken } = require('/app/dist/services/ops/basecampToken');
    token = await refreshBcToken();
  } catch (e) {
    log({ level: 'warn', event: 'bc_token_unavailable', error_class: (e && e.name) || 'Error' });
  }
  const bcOpts = { token, fetchImpl: typeof fetch === 'function' ? fetch : null, accountId: process.env.BASECAMP_ACCOUNT_ID || '3945211' };
  const v = await verifiedPicks({ orders, views, now,
    checkLists: (ls) => fetchListMeta(ls, bcOpts), checkTodos: (ts) => fetchTodoState(ts, bcOpts) });
  const { picks, qualified, listPick } = v;
  const verify = { deadLists: v.deadLists.size, deadTodos: v.deadTodos.size, unchecked: v.unchecked, rounds: v.rounds };
  log({ level: 'info', event: 'links_verified', ...verify,
    dead: [...v.deadLists.entries(), ...v.deadTodos.entries()].slice(0, 20) });

  // The five LISTS (Ali, 2026-11-12), ranked from the same task scores as the five tasks.
  const fiveLists = listPick.picks.map((l) => {
    const cat = categoryOf(l.key, l.projectId);
    return { id: l.id, key: l.key, projectId: l.projectId, listId: l.listId,
      url: l.listId && l.projectId ? listUrl(l.projectId, l.listId) : null,
      path: `${cat.label} / ${cat.sub.label}`, score: l.score, reasons: l.reasons,
      total: l.total, live: l.live, dormant: l.dormant, oldestDue: l.oldestDue,
      pressing: l.pressing.map((t) => ({ id: t.id, title: t.title, url: t.url, late: t.late, score: t.score })),
      // A decision list is decided; otherwise the list's own strongest suggestion (pressingLists.proposalFor).
      proposal: proposalFor(l) };
  });

  // ONE feed, lists and tasks ranked together by impact; #1 is the golden move (morningFeed).
  const day = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });
  const feed = buildFeed({ tasks: picks, lists: fiveLists, workOrderTextFor: (t) => renderWorkOrderText(t) })
    .map((it) => ({ ...it, copyHref: copyLink(it) }));
  const tourHref = tourLink(feed, day);

  const html = renderMorningFive({
    today: now, runId: `MORNING-FIVE-${now.toISOString().slice(0, 10)}`, items: feed, tourHref,
    counts: { tasks: rows.length, live: live.length, dormant: dormant.length, qualified, claimed: claimed.length,
      listsQualified: listPick.qualified },
    verify,
    boardNote: BOARD_NOTE,
  });
  fs.writeFileSync(OUT, html, 'utf8');
  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({
      generatedAt: new Date().toISOString(), // the real clock; `now` is the Central reading day
      counts: { tasks: rows.length, live: live.length, dormant: dormant.length, qualified, claimed: claimed.length,
        listsQualified: listPick.qualified },
      verify,
      tourHref,
      items: feed.map((it) => ({ rank: it.rank, kind: it.kind, golden: it.golden, id: it.id, title: it.title,
        url: it.url, path: it.path, when: it.when, score: it.score, tag: it.tag, copyHref: it.copyHref,
        copyChars: it.copyText.length })),
    }, null, 2), 'utf8');
  }

  log({ level: 'info', event: 'rendered', outcome: 'success', duration_ms: Date.now() - t0,
    tasks: rows.length, live: live.length, qualified, feed: feed.map((it) => `${it.kind}:${it.id}:${it.score}`),
    tourChars: tourHref.length, maxCopyChars: Math.max(0, ...feed.map((it) => it.copyHref.length)),
    bytes: Buffer.byteLength(html), out: OUT });
  await sequelize.close();
  process.exit(0);
})().catch((e) => {
  log({ level: 'error', event: 'failed', outcome: 'failure', error_class: (e && e.name) || 'Error', message: e && e.message });
  process.exit(1);
});
