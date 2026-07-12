#!/usr/bin/env node
/**
 * Ali Task Agent (ATA) - entrypoint.
 *
 * A scheduled "Chief of Staff" that finds the tasks addressed to Ali in
 * Basecamp, does the internal work it safely can (acting AS Ali, with an honest
 * AI sign-off), queues anything outward-facing for Ali to approve, and sends one
 * consolidated email + HTML report attached to Ali's home-base todo 10039770075.
 *
 * Sibling of CB System, not a clone: it triggers on work assigned to ALI (not
 * @CB), posts as Ali (not the CB persona), and DOES the work rather than only
 * replying. Every CB-flood lesson is reproduced on purpose - see the identity
 * halt, the sign-off self-loop guard, and the thread-level idempotency.
 *
 * SAFETY:
 *   - Live runs require ATA_ENABLED=true (fail-closed kill switch). Dry runs
 *     post nothing and ignore the switch.
 *   - Identity is asserted == Ali before any write; mismatch halts the run.
 *   - Outward-facing tasks can only be drafted+queued, never sent (the executor
 *     has no external-send primitive).
 *   - Thread-marker idempotency: a todo ATA already handled is skipped.
 *
 * Run:
 *   node backend/src/scripts/runAliTaskAgent.js --dry-run         # plan only, writes a local HTML file
 *   node backend/src/scripts/runAliTaskAgent.js --report-only     # emails Ali the digest, posts to NO tickets
 *   ATA_ENABLED=true node backend/src/scripts/runAliTaskAgent.js  # live (acts as Ali on tickets)
 * Flags: --dry-run  --report-only  --max=N (default 12)  --task-id=N  --force
 *        --allow-complete  --no-comment-filter  --comment-window=N (default 30)
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const ops = require('./lib/launchPmoOps');
const { buildQueue, buildQueueFromRows } = require('./lib/aliTaskAgent/queueBuilder');
const { fetchAssignedActiveRows } = require('./lib/aliTaskAgent/mirrorSource');
const { fetchAliCommentedTodoIds, DAY_MS } = require('./lib/aliTaskAgent/recentlyCommented');
const { alreadyHandled } = require('./lib/aliTaskAgent/ataIdempotency');
const { classifyTask } = require('./lib/aliTaskAgent/outwardFacing');
const { postComment, queueForApproval, completeTodo } = require('./lib/aliTaskAgent/executor');
const { generateDraft } = require('./lib/aliTaskAgent/draftDeliverable');
const { renderRunReport, renderRunReportText } = require('./lib/aliTaskAgent/renderRunReport');
const { assertAliIdentity, resolveIdentity, AtaIdentityHalt, ALI_BC_USER_ID } = require('./lib/aliTaskAgent/aliTokenSource');
const { sendWithBcAttach } = require('./lib/sendWithBcAttach');

// --- Report destination: Ali Personal home-base todo ---
const REPORT_BUCKET = 7463955;
const REPORT_TODO_ID = 10039770075;

// --- Flags ---
const argHas = (f) => process.argv.includes(f);
const argNum = (name, def) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.split('=')[1]) : def;
};
const argStr = (name, def) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : def;
};
const DRY = argHas('--dry-run');
const REPORT_ONLY = argHas('--report-only');
const FORCE = argHas('--force');
const ALLOW_COMPLETE = argHas('--allow-complete');
const NO_COMMENT_FILTER = argHas('--no-comment-filter');
const MAX = argNum('max', 12);
const TASK_ID = argNum('task-id', null);
const COMMENT_WINDOW_DAYS = argNum('comment-window', 30);
// When the Postgres mirror is not directly reachable (e.g. a host-side run where
// the DB lives on the compose network), feed pre-dumped ops_bc_todos rows as JSON.
const ROWS_FILE = argStr('rows-file', null);

const STATE_PATH = path.resolve(__dirname, '../../../tmp/ali-task-agent-state.json');
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return { tasks: {} }; } }
function saveState(s) { fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true }); fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); }
function stripHtml(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function taskHash(t) { return crypto.createHash('sha1').update(`${t.content}|${stripHtml(t.description)}|${t.due_on || ''}`).digest('hex').slice(0, 12); }
function todoUrl(item) { return item.todo.app_url || `https://3.basecamp.com/3945211/buckets/${item.projectId}/todos/${item.todo.id}`; }

function makeRunId() {
  // Deterministic-ish, human-readable; not security-sensitive.
  return 'ATA-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
}

async function processItem(item, runId, state) {
  const projectId = item.projectId;
  const todoId = item.todo.id;
  const label = `${item.projectName} / ${String(item.todo.content).slice(0, 60)}`;
  const kind = classifyTask(`${item.todo.content} ${stripHtml(item.todo.description)}`);

  // Report-only and dry: classify + summarize, never touch a ticket. No per-item
  // API calls, so a digest over the whole queue stays fast.
  if (DRY || REPORT_ONLY) {
    return { outcome: 'planned', kind, label, item };
  }

  // Live: idempotency (the thread is authoritative). Skip if ATA already acted
  // on this todo and its content is unchanged (unless --force).
  let threadComments = [];
  try {
    threadComments = await ops.bcGetAll(`/buckets/${projectId}/recordings/${todoId}/comments.json`);
  } catch (e) { /* read failure is non-fatal; treat as empty thread */ }
  const hash = taskHash(item.todo);
  const prior = state.tasks[todoId];
  if (!FORCE && alreadyHandled(threadComments, ALI_BC_USER_ID) && prior && prior.hash === hash) {
    return { outcome: 'skipped', label, item };
  }

  let draft;
  try {
    draft = await generateDraft({ task: item.todo, projectName: item.projectName, kind, threadComments });
  } catch (e) {
    return { outcome: 'failed', label, item, reason: `draft failed: ${e.message}` };
  }

  try {
    if (kind === 'outward') {
      await queueForApproval({ projectId, todoId, draftHtml: draft.html, reason: 'outward-facing', runId });
      state.tasks[todoId] = { at: new Date().toISOString(), hash, kind, action: 'queued' };
      saveState(state);
      return { outcome: 'queued', label, item, note: 'Drafted, waiting for you to review + send' };
    }
    await postComment({ projectId, todoId, html: draft.html, runId });
    if (ALLOW_COMPLETE) {
      await completeTodo({ projectId, todoId, runId });
    }
    state.tasks[todoId] = { at: new Date().toISOString(), hash, kind, action: ALLOW_COMPLETE ? 'done+completed' : 'done' };
    saveState(state);
    return { outcome: 'done', label, item, note: ALLOW_COMPLETE ? 'Deliverable posted + todo completed' : 'Deliverable posted' };
  } catch (e) {
    return { outcome: 'failed', label, item, reason: `post failed: ${e.message}` };
  }
}

async function main() {
  const runId = makeRunId();
  const mode = DRY ? '(DRY RUN)' : REPORT_ONLY ? '(REPORT-ONLY)' : '(LIVE)';
  console.log(`[ata] run ${runId} ${mode} max=${MAX}${TASK_ID ? ` task-id=${TASK_ID}` : ''}`);

  // --- Kill switch (fail-closed): only LIVE ticket-posting runs are gated. Dry
  // and report-only never post to a ticket, so they run without the flag. ---
  if (!DRY && !REPORT_ONLY && process.env.ATA_ENABLED !== 'true') {
    console.error('[ata] HALT: ATA_ENABLED is not "true". Live runs are disabled by default (fail-closed). Set ATA_ENABLED=true to enable, or use --dry-run / --report-only.');
    process.exit(2);
  }

  // --- Identity guard: a LIVE run must post as Ali (halt otherwise). Dry and
  // report-only only need the identity for the record (no acting-as-Ali). ---
  const readOnlyIdentity = DRY || REPORT_ONLY;
  let identity = { id: null };
  try {
    identity = readOnlyIdentity ? await resolveIdentity() : await assertAliIdentity();
    console.log(`[ata] identity: ${identity.id} ${identity.name || ''}`);
  } catch (e) {
    if (e instanceof AtaIdentityHalt) {
      console.error(`[ata] ${e.message}`);
      process.exit(3);
    }
    console.error(`[ata] identity resolve failed: ${e.message}`);
    if (!readOnlyIdentity) process.exit(3);
  }

  const state = loadState();

  // Relevance filter: only surface todos Ali personally commented on in the last
  // COMMENT_WINDOW_DAYS. Assignment alone is a weak signal (3k+ stale todos);
  // Ali's own recent comment means it is a live item he is working. Opt out with
  // --no-comment-filter.
  let commentedTodoIds = null;
  if (!NO_COMMENT_FILTER) {
    const sinceMs = Date.now() - COMMENT_WINDOW_DAYS * DAY_MS;
    try {
      const res = await fetchAliCommentedTodoIds({ aliId: ALI_BC_USER_ID, sinceMs, log: (m) => console.log(`  ${m}`) });
      commentedTodoIds = res.ids;
      console.log(`[ata] comment filter: ${commentedTodoIds.size} todo(s) Ali commented on in last ${COMMENT_WINDOW_DAYS}d (walked ${res.pages} feed page(s), reachedEdge=${res.reachedEdge})`);
    } catch (e) {
      console.error(`[ata] comment filter failed (${e.message}); proceeding UNFILTERED`);
    }
  }

  // Queue source: a fed rows-file, else the ops_bc_todos mirror (fast, scalable,
  // pre-scored), else the Basecamp API sweep fallback if the DB is unreachable.
  let queue;
  if (ROWS_FILE) {
    const rows = JSON.parse(fs.readFileSync(ROWS_FILE, 'utf8'));
    queue = buildQueueFromRows(rows, { commentedTodoIds, max: MAX });
    console.log(`[ata] queue source: rows-file ${ROWS_FILE} (${rows.length} rows)`);
  } else {
    try {
      const rows = await fetchAssignedActiveRows({ aliId: ALI_BC_USER_ID });
      queue = buildQueueFromRows(rows, { commentedTodoIds, max: MAX });
      console.log(`[ata] queue source: mirror (${rows.length} assigned+active rows)`);
    } catch (e) {
      console.error(`[ata] mirror unavailable (${e.message}); falling back to API sweep`);
      queue = await buildQueue({ aliId: ALI_BC_USER_ID, max: MAX, commentedTodoIds });
    }
  }
  if (TASK_ID) queue = queue.filter((it) => it.todo.id === TASK_ID);
  console.log(`[ata] ${queue.length} task(s) in scope after filters`);

  const results = [];
  for (const item of queue) {
    const r = await processItem(item, runId, state);
    console.log(`  [${r.outcome}] ${r.label}${r.reason ? ` :: ${r.reason}` : ''}`);
    results.push(r);
    await new Promise((res) => setTimeout(res, 400)); // gentle pacing
  }

  // --- Assemble the report summary ---
  const toRow = (r) => ({ projectName: r.item.projectName, title: r.item.todo.content, url: todoUrl(r.item) });
  const dueBit = (it) => (it.todo.due_on ? `, due ${it.todo.due_on}` : '');
  const done = results.filter((r) => r.outcome === 'done').map((r) => ({ ...toRow(r), note: r.note }));
  const needsApproval = results.filter((r) => r.outcome === 'queued').map((r) => ({ ...toRow(r), reason: r.note }));
  const couldntDo = results.filter((r) => r.outcome === 'failed').map((r) => ({ ...toRow(r), reason: r.reason }));
  const skipped = results.filter((r) => r.outcome === 'skipped').length;
  const plannedAll = results.filter((r) => r.outcome === 'planned');

  let summary;
  if (REPORT_ONLY) {
    // Digest: split the priority queue into "I can handle" (internal) and "needs
    // your decision" (outward). Nothing was posted.
    const canHandle = plannedAll.filter((r) => r.kind === 'internal').map((r) => ({ ...toRow(r), note: `urgency ${r.item.score}${dueBit(r.item)}` }));
    const needsYou = plannedAll.filter((r) => r.kind === 'outward').map((r) => ({ ...toRow(r), reason: `outward-facing${dueBit(r.item)} - urgency ${r.item.score}` }));
    summary = {
      mode: 'digest', runId, runAt: new Date().toISOString(), identity,
      counts: { scanned: queue.length, done: canHandle.length, queued: needsYou.length, failed: 0, skipped: 0 },
      done: canHandle, needsApproval: needsYou, couldntDo: [],
    };
  } else {
    const planned = plannedAll.map((r) => ({ ...toRow(r), note: `would ${r.kind === 'outward' ? 'queue for approval' : 'do + post'}` }));
    summary = {
      runId, runAt: new Date().toISOString(), dryRun: DRY, identity,
      counts: { scanned: queue.length, done: done.length, queued: needsApproval.length, failed: couldntDo.length, skipped },
      // In dry-run we surface the plan in the "Done" section so the report is useful.
      done: DRY ? planned : done,
      needsApproval, couldntDo,
    };
  }

  const reportHtml = renderRunReport(summary);
  const reportText = renderRunReportText(summary);

  // --- Deliver ---
  if (DRY) {
    const outDir = path.resolve(__dirname, '../../../docs/ata');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `ATA_run_${runId}.html`);
    fs.writeFileSync(outPath, reportHtml);
    console.log(`[ata] DRY RUN complete. Report written to ${outPath} (no email, no BC writes).`);
    console.log(`[ata] counts: ${JSON.stringify(summary.counts)}`);
    return;
  }

  const subject = REPORT_ONLY
    ? `Your priority queue: ${summary.counts.done + summary.counts.queued} tasks, ${summary.counts.queued} need your call (${summary.runAt.slice(0, 10)})`
    : `Ali Task Agent: ${done.length} done, ${needsApproval.length} need you (${summary.runAt.slice(0, 10)})`;
  try {
    const res = await sendWithBcAttach({
      bucketId: REPORT_BUCKET,
      ticketId: REPORT_TODO_ID,
      to: 'ali@colaberry.com',
      subject,
      html: reportHtml,
      text: reportText,
      vaultAttachments: [{
        filename: `ATA_run_${runId}.html`,
        content: Buffer.from(reportHtml, 'utf8'),
        contentType: 'text/html',
        vaultDescription: `Ali Task Agent run ${runId} - ${summary.runAt.slice(0, 10)}`,
      }],
      bcSummary: REPORT_ONLY
        ? `<div style="font-size:13px;color:#475569">ATA digest <code>${runId}</code>: ${summary.counts.scanned} in scope - ${summary.counts.done} I can handle, ${summary.counts.queued} need your call. Read-only, nothing posted to any ticket.</div>`
        : `<div style="font-size:13px;color:#475569">ATA run <code>${runId}</code>: ${done.length} done, ${needsApproval.length} need your approval, ${couldntDo.length} blocked, ${skipped} already handled.</div>`,
    });
    console.log(`[ata] report sent. mandrill=${res.mandrillId} comment=${res.commentUrl}`);
  } catch (e) {
    console.error(`[ata] report delivery failed: ${e.message}`);
    process.exit(4);
  }
  console.log(`[ata] ${mode} complete. counts: ${JSON.stringify(summary.counts)}`);
}

if (require.main === module) {
  main().catch((e) => { console.error('[ata] FATAL:', e.stack || e.message); process.exit(1); });
}

module.exports = { processItem, makeRunId, taskHash };
