#!/usr/bin/env node
/**
 * Task Prompt Worker - REPORT-ONLY.
 *
 * Sibling of the Ali Task Agent (ATA). Instead of drafting a Basecamp comment,
 * it turns each AI-doable task in Ali's queue into a complete, ready-to-run
 * Claude Code prompt and emails Ali the pack. It EXECUTES nothing and POSTS
 * nothing to task tickets - the prompts are for a human (or, later, a scheduled
 * Claude Code agent) to run.
 *
 * The "back half" - actually running the prompts and opening PRs - is future
 * work and must be added behind TASK_WORKER_EXECUTE_ENABLED (fail-closed). It is
 * not implemented here, so this worker is safe by construction.
 *
 * Reuses ATA's queue plumbing (mirror source, comment-recency filter, priority
 * scoring) so the two agents see the same queue.
 *
 * Run:
 *   node backend/src/scripts/runTaskPromptWorker.js --dry-run       # write local HTML, no email
 *   node backend/src/scripts/runTaskPromptWorker.js --report-only   # email Ali the pack
 * Flags: --dry-run --report-only --max=N --rows-file=PATH --no-comment-filter --comment-window=N
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { buildQueue, buildQueueFromRows } = require('./lib/aliTaskAgent/queueBuilder');
const { fetchAssignedActiveRows } = require('./lib/aliTaskAgent/mirrorSource');
const { fetchAliCommentedTodoIds, DAY_MS } = require('./lib/aliTaskAgent/recentlyCommented');
const { resolveIdentity, ALI_BC_USER_ID } = require('./lib/aliTaskAgent/aliTokenSource');
const { sendWithBcAttach } = require('./lib/sendWithBcAttach');
const { classifyWorkable } = require('./lib/taskPromptWorker/classifyWorkable');
const { buildPrompt } = require('./lib/taskPromptWorker/promptBuilder');
const { renderDigest } = require('./lib/taskPromptWorker/renderPromptDigest');

// Report destination: Ali's home-base tracking todo (his own, not a task ticket).
const REPORT_BUCKET = 7463955;
const REPORT_TODO_ID = 10039770075;

const argHas = (f) => process.argv.includes(f);
const argNum = (name, def) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? Number(a.split('=')[1]) : def; };
const argStr = (name, def) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : def; };

const DRY = argHas('--dry-run');
const REPORT_ONLY = argHas('--report-only');
const NO_COMMENT_FILTER = argHas('--no-comment-filter');
const MAX = argNum('max', 15);
const COMMENT_WINDOW_DAYS = argNum('comment-window', 30);
const ROWS_FILE = argStr('rows-file', null);

function stripHtml(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function makeRunId() { return 'TPW-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12); }

function toTask(item) {
  const id = item.todo.id;
  return {
    title: item.todo.content,
    url: item.todo.app_url || `https://app.basecamp.com/3945211/buckets/${item.projectId}/todos/${id}`,
    project: item.projectName,
    list: item.todo.todolist_name || '',
    due: item.todo.due_on || null,
    description: item.todo.description || '',
    summary: stripHtml(item.todo.description),
    score: item.score,
  };
}

async function main() {
  const runId = makeRunId();
  const mode = DRY ? '(DRY RUN)' : REPORT_ONLY ? '(REPORT-ONLY)' : '(FILE-ONLY)';
  console.log(`[tpw] run ${runId} ${mode} max=${MAX}`);

  // This worker never acts on a ticket. A future execute mode must be gated.
  if (process.env.TASK_WORKER_EXECUTE_ENABLED === 'true') {
    console.warn('[tpw] TASK_WORKER_EXECUTE_ENABLED is set but execute mode is NOT implemented; running report-only.');
  }

  let identity = { id: null };
  try { identity = await resolveIdentity(); console.log(`[tpw] identity: ${identity.id} ${identity.name || ''}`); }
  catch (e) { console.error(`[tpw] identity resolve failed (non-fatal): ${e.message}`); }

  let commentedTodoIds = null;
  if (!NO_COMMENT_FILTER) {
    try {
      const sinceMs = Date.now() - COMMENT_WINDOW_DAYS * DAY_MS;
      const res = await fetchAliCommentedTodoIds({ aliId: ALI_BC_USER_ID, sinceMs, log: () => {} });
      commentedTodoIds = res.ids;
      console.log(`[tpw] comment filter: ${commentedTodoIds.size} todo(s) in last ${COMMENT_WINDOW_DAYS}d`);
    } catch (e) { console.error(`[tpw] comment filter failed (${e.message}); proceeding UNFILTERED`); }
  }

  let queue;
  if (ROWS_FILE) {
    const rows = JSON.parse(fs.readFileSync(ROWS_FILE, 'utf8'));
    queue = buildQueueFromRows(rows, { commentedTodoIds, max: MAX });
    console.log(`[tpw] queue source: rows-file (${rows.length} rows)`);
  } else {
    try {
      const rows = await fetchAssignedActiveRows({ aliId: ALI_BC_USER_ID });
      queue = buildQueueFromRows(rows, { commentedTodoIds, max: MAX });
    } catch (e) {
      console.error(`[tpw] mirror unavailable (${e.message}); API sweep`);
      queue = await buildQueue({ aliId: ALI_BC_USER_ID, max: MAX, commentedTodoIds });
    }
  }
  console.log(`[tpw] ${queue.length} task(s) in scope`);

  const code = [];
  const needsYou = [];
  for (const item of queue) {
    const task = toTask(item);
    const kind = classifyWorkable(task);
    if (kind === 'code') code.push({ task, prompt: buildPrompt(task) });
    else needsYou.push({ task, kind });
  }
  console.log(`[tpw] ${code.length} code prompt(s), ${needsYou.length} need-you`);

  const dateStr = new Date().toISOString().slice(0, 10);
  const { subject, html, text } = renderDigest({ runId, dateStr, code, needsYou });

  // Always write a local artifact (auditable, safe).
  const outDir = path.resolve(__dirname, '../../../docs/task-worker/runs');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `TPW_${runId}.html`);
  fs.writeFileSync(outPath, html);
  console.log(`[tpw] wrote ${outPath}`);

  if (!REPORT_ONLY) {
    console.log(`[tpw] ${DRY ? 'DRY RUN' : 'FILE-ONLY'} - no email sent. Pass --report-only to email Ali.`);
    console.log(`[tpw] counts: ${JSON.stringify({ scanned: queue.length, code: code.length, needsYou: needsYou.length })}`);
    return;
  }

  try {
    const res = await sendWithBcAttach({
      bucketId: REPORT_BUCKET,
      ticketId: REPORT_TODO_ID,
      to: 'ali@colaberry.com',
      subject,
      html,
      text,
      vaultAttachments: [{
        filename: `TPW_${runId}.html`,
        content: Buffer.from(html, 'utf8'),
        contentType: 'text/html',
        vaultDescription: `Task Prompt Worker ${runId} - ${dateStr}`,
      }],
      bcSummary: `<div style="font-size:13px;color:#475569">Task worker <code>${runId}</code>: ${code.length} ready-to-run prompt(s), ${needsYou.length} need you. Nothing executed or posted to any task ticket.</div>`,
    });
    console.log(`[tpw] report sent. mandrill=${res.mandrillId} comment=${res.commentUrl || ''}`);
  } catch (e) {
    console.error(`[tpw] delivery failed: ${e.message}`);
    process.exit(4);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('[tpw] FATAL:', e.stack || e.message); process.exit(1); });
}

module.exports = { toTask, makeRunId };
