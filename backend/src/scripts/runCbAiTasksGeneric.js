#!/usr/bin/env node
/**
 * Project-agnostic CB AI auto-runner. Same pattern as runCbAiTasks.js
 * (launch project) but works for ANY Basecamp project ID.
 *
 * For each task in the target project where:
 *   - assignee includes "CB System" OR content matches AI-tier patterns
 *   - the task is not already drafted (per state file)
 *   - due_on is within --due-window days (default 30)
 *
 * CB:
 *   1. Posts a "CB starting now" status comment
 *   2. Calls gpt-4o with task content + project description + assignee
 *      context + recent thread comments
 *   3. Posts the first-pass deliverable as a follow-up comment
 *   4. Records state at tmp/cb-ai-runner-state-<projectId>.json
 *
 * Per Ali's "anything outside-facing needs human approval" rule:
 *   - CB only DRAFTS in BC comments
 *   - The human reviewer (BC assignee or area-mapped reviewer) marks the
 *     task complete only after reviewing + sending any external comms
 *   - CB never sends email/social/calendar invites for client work
 *
 * Run: node backend/src/scripts/runCbAiTasksGeneric.js --project=46699826
 *      Optional: --dry-run --max=20 --due-window=30 --force --task-id=N
 *
 * Per-project cron: configure separate entries with different --project= args
 * or use a wrapper that iterates a list.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const ops = require('./lib/launchPmoOps');

const projectArg = process.argv.find((a) => a.startsWith('--project='));
const PROJECT_ID = projectArg ? Number(projectArg.split('=')[1]) : null;
if (!PROJECT_ID) { console.error('--project=<id> required'); process.exit(1); }

const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const MAX = Number((process.argv.find((a) => a.startsWith('--max=')) || '--max=15').split('=')[1]);
const WINDOW = Number((process.argv.find((a) => a.startsWith('--due-window=')) || '--due-window=30').split('=')[1]);
const taskIdArg = process.argv.find((a) => a.startsWith('--task-id='));
const TASK_ID = taskIdArg ? Number(taskIdArg.split('=')[1]) : null;

const STATE_PATH = path.resolve(__dirname, `../../../tmp/cb-ai-runner-state-${PROJECT_ID}.json`);

function loadState() { try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return { tasks: {} }; } }
function saveState(s) { fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true }); fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); }
function stripHtml(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function stripEm(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

// AI-tier classifier (same patterns as dailyClientProjectsReport).
const AI_RES = [/draft|generate|write|compile|summarize|extract/i, /build|code|implement|develop|deploy/i, /test|qa|validate.*data/i, /analyze|analysis|score|rank|rate/i, /research|investigate|find/i, /design|wireframe|prototype|mock/i, /pull|fetch|retrieve|sync|migrate/i, /document|update.*docs|create.*spec/i];
const HUMAN_RES = [/meeting|sync|call|demo|review with|present to/i, /decide|approval|approve|sign.off|authorize/i, /negotiate|relationship|escalate|client (call|response)/i, /pay|invoice|wire|contract|legal|sow|nda/i];
function isAi(content, description, assignees) {
  const text = ((content || '') + ' ' + stripHtml(description || '')).toLowerCase();
  if (HUMAN_RES.some((r) => r.test(text))) return false;
  if (AI_RES.some((r) => r.test(text))) return true;
  return (assignees || []).some((n) => /CB System/i.test(n));
}

const APPROVE_VERBS_RE = /^(review and approve|review|approve|finalize|sign[- ]?off|conduct (final )?review)\s+/i;

async function generateDeliverable({ task, projectName, projectDescription, reviewerName, threadComments }) {
  const OpenAI = require(path.resolve(__dirname, '../../../node_modules/openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const systemPrompt = `You are CB System, the AI execution arm for Colaberry's project portfolio.

You are taking the FIRST PASS on this AI-tier task for project "${projectName}". Your output is a DRAFT deliverable that the human reviewer (${reviewerName}) reviews + refines + sends if it's an outbound communication.

CRITICAL RULES:
- You DO NOT send emails, post to social, book meetings, or make any external commitment. You DRAFT. The human sends.
- For any outside-facing content (client email, social post, presentation), explicitly mark the draft "[DRAFT - ${reviewerName} reviews + sends]" at the top.
- Output ONLY the deliverable in clean GitHub-flavored Markdown. Use real H2/H3, real bullets, real tables.
- No em-dashes anywhere (use commas or hyphens).
- No fluff phrases ("make sure to", "be sure that").
- Code/spec tasks: give actual code or pseudo-code.
- Copy/draft tasks: write the copy.
- Research tasks: summarize findings with sources.
- 400-1800 words depending on task complexity.

The reviewer mark this task complete only when they're happy with the draft AND have sent any external communications.`;

  const userPrompt = `# Task
**Title:** ${task.content}
**Due:** ${task.due_on || 'unset'}
**Reviewer:** ${reviewerName}

**Task description:**
${stripHtml(task.description).slice(0, 2000)}

# Project context
**Project:** ${projectName}
${projectDescription ? `**Description:** ${projectDescription.slice(0, 1500)}` : ''}

${threadComments?.length ? `# Recent thread comments
${threadComments.slice(0, 5).map((c) => `- [${(c.created_at || '').slice(0, 10)}] ${c.creator?.name || 'unknown'}: ${stripHtml(c.content || '').slice(0, 300)}`).join('\n')}` : ''}

Produce the first-pass deliverable now.`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  return { content: stripEm(resp.choices?.[0]?.message?.content || ''), tokens: resp.usage };
}

function mdToHtml(md) {
  let s = (md || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^\* (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>(\n<li>.*?<\/li>)*)/gs, '<ul>$1</ul>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return `<div><p>${s}</p></div>`;
}

(async () => {
  if (!process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY required'); process.exit(1); }
  const project = await ops.bcGet(`/projects/${PROJECT_ID}.json`);
  const projectName = project.name;
  const projectDescription = stripHtml(project.description || '');
  console.log(`[cb-runner] project=${PROJECT_ID} "${projectName}" max=${MAX} window=${WINDOW}d`);

  const state = loadState();
  const dock = project.dock || [];
  const todoset = dock.find((d) => d.name === 'todoset');
  if (!todoset) { console.error('no todoset'); process.exit(1); }
  const lists = await ops.bcGetAll(`/buckets/${PROJECT_ID}/todosets/${todoset.id}/todolists.json`);

  const allOpen = [];
  for (const list of lists) {
    if (list.completed) continue;
    const todos = await ops.bcGetAll(`/buckets/${PROJECT_ID}/todolists/${list.id}/todos.json?status=remaining`);
    for (const t of (todos || [])) allOpen.push({ ...t, listName: list.name });
  }
  console.log(`Loaded ${allOpen.length} open tasks`);

  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(today.getTime() + WINDOW * 86400000);
  const candidates = allOpen
    .filter((t) => isAi(t.content, t.description, (t.assignees || []).map((a) => a.name)))
    .filter((t) => !APPROVE_VERBS_RE.test(t.content || ''))
    .filter((t) => t.due_on ? new Date(t.due_on + 'T00:00:00Z') <= windowEnd : true)
    .filter((t) => TASK_ID ? t.id === TASK_ID : true)
    .filter((t) => FORCE || !state.tasks[t.id])
    .sort((a, b) => (a.due_on || '9999').localeCompare(b.due_on || '9999'))
    .slice(0, TASK_ID ? 1 : MAX);

  console.log(`${candidates.length} AI-tier unprocessed candidates`);

  for (const t of candidates) {
    console.log(`\n--- ${t.id} [${t.due_on || 'no-due'}] ${t.listName} / ${t.content.slice(0, 70)} ---`);
    const reviewer = (t.assignees || []).find((a) => !/CB System/i.test(a.name))?.name || 'Ali Muwwakkil';
    const reviewerName = reviewer.replace('Ali Muwwakkil', 'Ali');

    if (DRY) { console.log(`  [dry] would draft, reviewer=${reviewerName}`); continue; }

    // Pull thread context
    let threadComments = [];
    try {
      const cmts = await ops.bcGetAll(`/buckets/${PROJECT_ID}/recordings/${t.id}/comments.json`);
      threadComments = (cmts || []).slice(-5);
    } catch (_e) {}

    // Step 1: "CB starting" status comment
    try {
      await ops.bcPost(`/buckets/${PROJECT_ID}/recordings/${t.id}/comments.json`, {
        content: `<div><strong>CB System is starting this task now.</strong></div>
<div>Drafting a first-pass deliverable for ${reviewerName} to review. Anything outbound (client email, social post, etc.) is marked "[DRAFT - ${reviewerName} reviews + sends]" - CB never sends external communications, only drafts them.</div>
<div>Output will land here as a follow-up comment within ~2 minutes.</div>`,
      });
    } catch (e) { console.error(`  starting-comment fail: ${e.message}`); }

    // Step 2: generate
    let deliverable;
    try {
      const r = await generateDeliverable({ task: t, projectName, projectDescription, reviewerName, threadComments });
      deliverable = r.content;
      console.log(`  generated ${deliverable.length} chars (tokens=${r.tokens?.total_tokens || '?'})`);
    } catch (e) {
      console.error(`  gen fail: ${e.message}`);
      await ops.bcPost(`/buckets/${PROJECT_ID}/recordings/${t.id}/comments.json`, {
        content: `<div><strong>CB System hit an error drafting this.</strong></div><div>${e.message.replace(/</g, '&lt;')}</div>`,
      }).catch(() => {});
      continue;
    }

    // Step 3: post deliverable
    try {
      const html = `<div><strong>CB System first-pass deliverable</strong> (${reviewerName} reviews + refines + marks complete)</div>
<div style="background:#f8fafc;border-left:3px solid #1a365d;padding:10px 14px;margin-top:8px">${mdToHtml(deliverable).slice(0, 100000)}</div>
<div style="margin-top:10px;font-size:11px;color:#64748b">Drafted by CB System on ${new Date().toISOString().slice(0,10)} for ${projectName}. Reviewer: ${reviewerName}. For outbound communications, the reviewer sends - CB never does that automatically. Reply to revise or tag <code>@CB System</code> to ask for changes.</div>`;
      await ops.bcPost(`/buckets/${PROJECT_ID}/recordings/${t.id}/comments.json`, { content: html });
    } catch (e) { console.error(`  posting deliverable fail: ${e.message}`); }

    state.tasks[t.id] = { at: new Date().toISOString(), reviewer: reviewerName, chars: deliverable.length, list: t.listName };
    saveState(state);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n=== Done === Processed: ${candidates.length}`);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
