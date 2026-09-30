#!/usr/bin/env node
/**
 * CB AI auto-runner. For every UNBLOCKED AI-tier task in the launch project
 * that is due in the next N days (default 5), CB drafts a first-pass
 * deliverable via gpt-4o using the task description + relevant briefs +
 * locked assumptions as context, then posts:
 *   1. A "CB starting now" status comment on the task
 *   2. The deliverable as either an inline comment, a PDF attachment, or
 *      both (depending on task tier + length)
 *
 * Idempotent: state file at tmp/launch-pmo-ai-runner-state.json tracks which
 * tasks CB has already attempted this week so we don't redo the same draft.
 *
 * Run: node backend/src/scripts/runCbAiTasks.js
 *      --dry-run               preview without writing
 *      --max=N                 process at most N tasks (default 12)
 *      --due-window=N          consider tasks due in next N days (default 5)
 *      --task-id=N             run on one specific task id (for testing)
 *      --force                 ignore the state file (re-run already-handled tasks)
 *
 * Designed for nightly cron (India team works overnight per Ali's directive):
 *   0 2 * * 1-5  (Mon-Fri 2am UTC = 7am IST)
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const ops = require('./lib/launchPmoOps');
const { alreadyDrafted } = require('./lib/cbDraftIdempotency');
const { LAUNCH, provisioned, getByPersonId, getByHandle } = require('./lib/launchPmoTeam');

const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const MAX = Number((process.argv.find((a) => a.startsWith('--max=')) || '--max=12').split('=')[1]);
const WINDOW = Number((process.argv.find((a) => a.startsWith('--due-window=')) || '--due-window=5').split('=')[1]);
const taskIdArg = process.argv.find((a) => a.startsWith('--task-id='));
const TASK_ID = taskIdArg ? Number(taskIdArg.split('=')[1]) : null;

const STATE_PATH = path.resolve(__dirname, '../../../tmp/launch-pmo-ai-runner-state.json');
const VAULT_MAP_PATH = path.resolve(__dirname, '../../../tmp/launch-briefs-vault-urls.json');
const BRIEFS_DIR = path.resolve(__dirname, '../../../docs/training-program-2026-q3/launch-briefs');
const ASSUMPTIONS_PATH = path.resolve(__dirname, '../../../docs/training-program-2026-q3/ASSUMPTIONS_LOG.md');

function loadState() { try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return { tasks: {} }; } }
function saveState(s) { fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true }); fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); }
function isAiTier(description) { return /AI TASK/i.test(description || ''); }
function stripHtml(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function stripEm(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const APPROVE_VERBS_RE = /^(review and approve|review|approve|finalize|sign[- ]?off|conduct (final )?review)\s+/i;

// ---------------- Brief loader ----------------
let VAULT_MAP = {};
try { VAULT_MAP = JSON.parse(fs.readFileSync(VAULT_MAP_PATH, 'utf8')); } catch {}

function findBriefSlugsForTask(desc) {
  // Pull slugs from the description (the BC todo description embeds filenames like "13-sohail-marketing.md")
  const out = new Set();
  for (const slug of Object.keys(VAULT_MAP.briefs || {})) {
    if (desc.includes(slug) || desc.includes((VAULT_MAP.briefs[slug] || {}).filename || '')) out.add(slug);
  }
  return [...out];
}
function loadBrief(slug) {
  const meta = (VAULT_MAP.briefs || {})[slug];
  if (!meta) return null;
  try { return fs.readFileSync(path.join(BRIEFS_DIR, meta.filename), 'utf8'); }
  catch { return null; }
}

// ---------------- gpt-4o deliverable generator ----------------
async function generateDeliverable({ task, owner, briefs, assumptions }) {
  const { getInstrumentedOpenAI } = require(path.resolve(__dirname, './lib/openaiInstrumented'));
  const openai = getInstrumentedOpenAI({ workflow_id: 'cb_ai_tasks' });
  const systemPrompt = `You are CB System, the autonomous AI execution engine for the AI Systems Architect Accelerator launch (Colaberry Inc, target 2026-07-11).

You are taking the FIRST PASS on this AI-tier task. Your output is a draft deliverable that the assignee (or Ali) reviews and refines. Do NOT post placeholders or "I would draft X" - actually draft it.

OUTPUT RULES:
- Return ONLY the deliverable body in clean GitHub-flavored Markdown. Use real H2/H3 headers, real bullet lists, real tables.
- No em-dashes anywhere (use commas or hyphens). Em-dashes break our email preflight.
- No fluff phrases.
- Reference the briefs by name where you use their content.
- If this is a code/spec task: give actual code or pseudo-code, not narrative.
- If this is a copy/draft task: write the copy, don't outline what would go in copy.
- 600-2000 words. Quality > length.

You will be given:
- The task content + description
- The owner's brief (their canonical context)
- Shared briefs (program overview, brand/pricing, timeline, decisions locked)
- The 17 locked assumptions

Produce the actual draft. The human approves or revises.`;
  const briefBlock = briefs.map((b) => `\n\n=== BRIEF: ${b.slug} ===\n${(b.body || '').slice(0, 8000)}`).join('');
  const userPrompt = `# Task to execute
**Title:** ${task.content}
**Owner:** ${owner.displayName} (${owner.role})
**Due:** ${task.due_on}

**Task description:**
${stripHtml(task.description).slice(0, 2500)}

# Locked assumptions
${assumptions.slice(0, 3000)}

# Briefs to use as canonical context
${briefBlock}

Produce the first-pass deliverable now.`;
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  const raw = resp.choices?.[0]?.message?.content || '';
  const cleaned = stripEm(raw);
  return { content: cleaned, tokens: resp.usage };
}

// ---------------- Markdown -> simple HTML for BC comment ----------------
function mdToHtml(md) {
  let s = (md || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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

// ---------------- Main loop ----------------
(async () => {
  if (!process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY required'); process.exit(1); }
  const assumptionsText = (() => { try { return fs.readFileSync(ASSUMPTIONS_PATH, 'utf8'); } catch { return ''; } })();
  const state = loadState();
  const dock = await ops.getDock();
  const lists = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todosets/${dock.todoset.id}/todolists.json`);

  // Build full task universe
  const allOpen = [];
  for (const list of lists) {
    const todos = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${list.id}/todos.json`);
    for (const t of (todos || [])) allOpen.push({ ...t, listName: list.name });
  }
  console.log(`Loaded ${allOpen.length} open tasks across ${lists.length} lists`);

  // Heuristic blocker check (mirror of detectBlockedTasks)
  function normalizeSubject(s) {
    return (s || '')
      .replace(APPROVE_VERBS_RE, '')
      .replace(/^(draft|create|design|build|develop|implement|produce|deploy|generate|integrate|launch|prepare|complete|update|migrate|finalize)\s+/i, '')
      .replace(/[^a-z0-9\s]/gi, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function subjectsOverlap(a, b) {
    const sa = new Set(a.split(' ').filter((w) => w.length > 3));
    const sb = new Set(b.split(' ').filter((w) => w.length > 3));
    if (sa.size === 0 || sb.size === 0) return false;
    let hits = 0; for (const w of sa) if (sb.has(w)) hits++;
    return hits / Math.min(sa.size, sb.size) >= 0.6;
  }
  const openByContent = new Map(allOpen.map((t) => [normalizeSubject(t.content || ''), t]));
  function isBlocked(t) {
    if (!APPROVE_VERBS_RE.test(t.content || '')) return false;
    const subj = normalizeSubject(t.content || '');
    if (!subj) return false;
    for (const [otherSubj, other] of openByContent) {
      if (other.id === t.id) continue;
      if (APPROVE_VERBS_RE.test(other.content || '')) continue;
      if (subjectsOverlap(subj, otherSubj)) return true;
    }
    return false;
  }

  // Filter to AI-tier, unblocked, due in window
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(today.getTime() + WINDOW * 86400000);
  const candidates = allOpen
    .filter((t) => isAiTier(t.description))
    .filter((t) => !isBlocked(t))
    .filter((t) => t.due_on && new Date(t.due_on + 'T00:00:00Z') <= windowEnd)
    .filter((t) => TASK_ID ? t.id === TASK_ID : true)
    .filter((t) => FORCE || !state.tasks[t.id])
    .sort((a, b) => (a.due_on || '').localeCompare(b.due_on || ''))
    .slice(0, TASK_ID ? 1 : MAX);

  console.log(`${candidates.length} AI-tier unblocked tasks to process (due within ${WINDOW}d, max ${MAX})`);

  for (const t of candidates) {
    console.log(`\n--- ${t.id} [${t.due_on}] ${t.listName} / ${t.content.slice(0, 70)} ---`);
    const ownerName = (t.assignees || [])[0]?.name;
    const ownerId = (t.assignees || [])[0]?.id;
    const owner = (ownerId && getByPersonId(ownerId)) || getByHandle('cb') || { displayName: ownerName || 'CB System', role: 'AI Execution Queue' };

    // Identify briefs from the task description
    const slugs = findBriefSlugsForTask(t.description || '');
    if (slugs.length === 0) slugs.push('cb-pmo-contract', 'program-overview');
    const briefs = slugs
      .map((s) => ({ slug: s, body: loadBrief(s) }))
      .filter((b) => b.body);

    if (DRY) {
      console.log(`  [dry] would draft with briefs: ${slugs.join(', ')}`);
      continue;
    }

    // Idempotency: the thread is authoritative (state file + --force are not).
    // Skip if CB already drafted a deliverable here, so re-runs never duplicate.
    try {
      const existing = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/recordings/${t.id}/comments.json`);
      if (alreadyDrafted(existing)) {
        console.log('  already drafted in thread - skipping (idempotent)');
        state.tasks[t.id] = state.tasks[t.id] || { at: new Date().toISOString(), skipped: 'already_drafted_in_thread' };
        saveState(state);
        continue;
      }
    } catch (_e) {}

    // Step 1: post "CB starting now" comment
    try {
      await ops.bcPost(`/buckets/${LAUNCH.projectId}/recordings/${t.id}/comments.json`, {
        content: `<div><strong>CB System is starting this task now.</strong></div>
<div>Drafting a first-pass deliverable using ${briefs.length} brief(s): ${briefs.map((b) => b.slug).join(', ')}.</div>
<div>Output will land here as a follow-up comment within ~2 minutes. ${owner.displayName} reviews + refines.</div>`,
      });
    } catch (e) { console.error(`  starting-comment fail: ${e.message}`); }

    // Step 2: generate the deliverable
    let deliverable;
    try {
      const r = await generateDeliverable({ task: t, owner, briefs, assumptions: assumptionsText });
      deliverable = r.content;
      console.log(`  generated ${deliverable.length} chars (tokens=${r.tokens?.total_tokens || '?'})`);
    } catch (e) {
      console.error(`  gen fail: ${e.message}`);
      await ops.bcPost(`/buckets/${LAUNCH.projectId}/recordings/${t.id}/comments.json`, {
        content: `<div><strong>CB System hit an error drafting this.</strong></div><div>${e.message.replace(/</g, '&lt;')}</div><div>Will retry on next nightly run.</div>`,
      }).catch(() => {});
      continue;
    }

    // Step 3: post the deliverable
    try {
      const html = `<div><strong>CB System first-pass deliverable</strong></div>
<div style="background:#f8fafc;border-left:3px solid #1a365d;padding:10px 14px;margin-top:8px">${mdToHtml(deliverable).slice(0, 100000)}</div>
<div style="margin-top:10px;font-size:11px;color:#64748b">Drafted by CB System on ${new Date().toISOString().slice(0,10)}. Reviewer: ${owner.displayName}. Briefs: ${briefs.map((b) => b.slug).join(', ')}. Reply on this comment to revise or tag <code>@CB System</code> to ask for changes.</div>`;
      await ops.bcPost(`/buckets/${LAUNCH.projectId}/recordings/${t.id}/comments.json`, { content: html });
    } catch (e) { console.error(`  posting deliverable fail: ${e.message}`); }

    state.tasks[t.id] = { at: new Date().toISOString(), briefs: briefs.map((b) => b.slug), chars: deliverable.length };
    saveState(state);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('\n=== Done ===');
  console.log(`Processed: ${candidates.length}`);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
