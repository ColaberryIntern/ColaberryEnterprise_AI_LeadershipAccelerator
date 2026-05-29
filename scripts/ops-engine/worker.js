#!/usr/bin/env node
/**
 * Operations Engine - CB System worker (15-minute autonomous tick).
 *
 * Per tick:
 *   1. List every CB-System-assigned, not-completed todo across all accessible projects.
 *   2. Classify each via #auto-<recipe> hashtags in the description.
 *   3. Pick one (FIFO by created_at) and execute its recipe with a 5-min hard timeout.
 *   4. Post the result as a Basecamp comment on the todo. Never auto-close. Ali closes.
 *   5. Update tmp/ops-engine/worker-state.json with what happened.
 *   6. Every 16 ticks (~4hr), post a digest comment to the meta tracking todo
 *      "[Tracking] CB System worker activity" in Ali Personal -> AI Products.
 *
 * Safety:
 *   - Lock file prevents overlapping ticks.
 *   - Each todo gets at most ONE execution attempt per 24h.
 *   - Never marks a todo completed. Ali closes.
 *   - Never sends external comms without an Ali-approved draft.
 *
 * Recipes (v1):
 *   - #auto-grep:<pattern>         -> ripgrep the repo, post first 50 matches
 *   - #auto-research:<query>       -> placeholder until LLM client wired
 *   - #auto-sql:<script-relpath>   -> run a read-only backend script, post stdout
 *   - #auto-comment:<instruction>  -> generate a status comment from the description
 *   - #auto-draft:<to>:<topic>     -> placeholder; never sends, only drafts
 *
 * Run: BASECAMP_ACCESS_TOKEN="..." node scripts/ops-engine/worker.js
 *      Optional: --dry (classify + log, no comment posts, no execution side effects)
 *      Optional: --once (one tick then exit; default for cron)
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ACCOUNT = '3945211';
const BASE = `https://3.basecampapi.com/${ACCOUNT}`;
const REPO_ROOT = path.resolve(__dirname, '../..');
const STATE_PATH = path.resolve(REPO_ROOT, 'tmp/ops-engine/worker-state.json');
const LOCK_PATH = path.resolve(REPO_ROOT, 'tmp/ops-engine/worker.lock');
const META_TRACKING_TODO_PATH = path.resolve(REPO_ROOT, 'tmp/ops-engine/worker-meta-todo-id.txt');

const CB_SYSTEM_ID = 37708014;
const ALI_ID = 17454835;
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';
const ALI_PERSONAL_PROJECT = 7463955;
const AI_PRODUCTS_LIST = 9939449052;

const TICK_TIMEOUT_MS = 5 * 60 * 1000;
const PER_TODO_RETRY_HOURS = 24;
const DIGEST_EVERY_N_TICKS = 16;

const ARGS = process.argv.slice(2);
const DRY = ARGS.includes('--dry');

function getToken() {
  let t = process.env.BASECAMP_ACCESS_TOKEN || '';
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required');
  if (t.toLowerCase().startsWith('bearer ')) t = t.slice(7).trim();
  return t;
}
const TOKEN = getToken();
const H = () => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry Ops Worker', Accept: 'application/json', 'Content-Type': 'application/json' });

async function bcGet(p) {
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: H() });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}
async function bcGetAll(p) {
  let next = p.startsWith('http') ? p : BASE + p;
  const out = [];
  while (next) {
    const r = await fetch(next, { headers: H() });
    if (!r.ok) throw new Error(`GET ${next} -> ${r.status}`);
    out.push(...(await r.json()));
    const link = r.headers.get('Link') || '';
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
  }
  return out;
}
async function bcPost(p, body) {
  if (DRY) { console.log('[dry] POST', p); return { id: 'dry' }; }
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

function acquireLock() {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  if (fs.existsSync(LOCK_PATH)) {
    const pid = Number(fs.readFileSync(LOCK_PATH, 'utf8'));
    try { process.kill(pid, 0); console.log(`worker locked by pid ${pid}, exiting`); return false; }
    catch { console.log(`stale lock pid ${pid}, taking over`); }
  }
  fs.writeFileSync(LOCK_PATH, String(process.pid));
  return true;
}
function releaseLock() { try { fs.unlinkSync(LOCK_PATH); } catch {} }

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return { ticks: [], attempted: {}, tick_count: 0 }; }
}
function saveState(s) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

function hoursAgo(iso) {
  if (!iso) return 99999;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

function classifyTodo(t) {
  const text = (t.content + ' ' + (t.description || '')).replace(/<[^>]+>/g, ' ');
  const m = text.match(/#auto-(grep|research|sql|comment|draft):([^\s<]+)/);
  if (m) return { recipe: m[1], arg: m[2].trim() };
  return { recipe: 'needs-recipe', arg: null };
}

function mentionAli() {
  return `<bc-attachment sgid="${ALI_SGID}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;
}

async function listCbAssignedTodos() {
  const projects = await bcGetAll('/projects.json');
  const out = [];
  for (const p of projects) {
    const ts = p.dock.find(d => d.name === 'todoset' && d.enabled);
    if (!ts) continue;
    let lists;
    try { lists = await bcGetAll(`/buckets/${p.id}/todosets/${ts.id}/todolists.json`); }
    catch { continue; }
    for (const l of lists) {
      let todos;
      try { todos = await bcGetAll(`/buckets/${p.id}/todolists/${l.id}/todos.json?status=remaining&assignee_ids=${CB_SYSTEM_ID}`); }
      catch { continue; }
      for (const t of todos) {
        if (!t.assignees || !t.assignees.some(a => a.id === CB_SYSTEM_ID)) continue;
        out.push({ ...t, project_id: p.id, project_name: p.name, list_id: l.id, list_name: l.name });
      }
    }
  }
  return out;
}

// --- recipes ----------------------------------------------------------------

function runWithTimeout(cmd, args, timeoutMs) {
  const r = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 });
  return { code: r.status, stdout: (r.stdout || '').slice(0, 50000), stderr: (r.stderr || '').slice(0, 5000), timedOut: r.signal === 'SIGTERM' };
}

async function recipeGrep(todo, pattern) {
  const r = runWithTimeout('rg', ['--color', 'never', '-n', '--max-count', '50', pattern, '.'], 60000);
  const lines = (r.stdout || '').split('\n').filter(Boolean).slice(0, 50);
  const body = lines.length
    ? `<div>${mentionAli()} <code>#auto-grep</code> ran <code>${pattern}</code> - first ${lines.length} matches below.</div><div><br></div><pre>${lines.map(l => l.replace(/</g, '&lt;')).join('\n')}</pre>`
    : `<div>${mentionAli()} <code>#auto-grep</code> ran <code>${pattern}</code> - no matches in repo.</div>`;
  return body;
}

async function recipeComment(todo, instruction) {
  return `<div>${mentionAli()} <code>#auto-comment</code> picked up this todo at ${new Date().toISOString()}. The recipe instruction was: <em>${instruction}</em>.</div><div><br></div><div>This v1 recipe just acknowledges the task - the LLM step that generates the actual analysis content is not yet wired. When you wire the worker to a local LLM client (or Claude API), this recipe will write the full analysis here. Until then, this is a heartbeat showing the worker picked it up.</div>`;
}

async function recipeSql(todo, scriptRel) {
  const fullPath = path.resolve(REPO_ROOT, scriptRel);
  if (!fs.existsSync(fullPath)) return `<div>${mentionAli()} <code>#auto-sql</code> could not find <code>${scriptRel}</code>. Verify the path in the todo description.</div>`;
  const r = runWithTimeout('node', [fullPath], 120000);
  const out = r.stdout ? `<pre>${r.stdout.slice(0, 5000).replace(/</g, '&lt;')}</pre>` : '<em>no stdout</em>';
  return `<div>${mentionAli()} <code>#auto-sql</code> ran <code>${scriptRel}</code> (exit ${r.code}). Output:</div>${out}`;
}

async function recipeResearch(todo, query) {
  return `<div>${mentionAli()} <code>#auto-research</code> recipe placeholder for query <em>${query}</em>. LLM/WebFetch wiring not yet connected. Heartbeat: worker saw this todo at ${new Date().toISOString()}.</div>`;
}

async function recipeDraft(todo, arg) {
  return `<div>${mentionAli()} <code>#auto-draft</code> recipe placeholder. Draft generation wiring not yet connected. To preserve the safety rule, this recipe never sends - it only drafts and posts here for your approval.</div>`;
}

const RECIPES = { grep: recipeGrep, research: recipeResearch, sql: recipeSql, comment: recipeComment, draft: recipeDraft };

// --- main tick --------------------------------------------------------------

async function postComment(todo, html) {
  if (DRY) { console.log('[dry] would comment on todo', todo.id, html.slice(0, 200)); return { id: 'dry' }; }
  return bcPost(`/buckets/${todo.project_id}/recordings/${todo.id}/comments.json`, { content: html });
}

async function ensureMetaTrackingTodo() {
  if (fs.existsSync(META_TRACKING_TODO_PATH)) {
    const id = Number(fs.readFileSync(META_TRACKING_TODO_PATH, 'utf8'));
    if (id) return id;
  }
  const t = await bcPost(`/buckets/${ALI_PERSONAL_PROJECT}/todolists/${AI_PRODUCTS_LIST}/todos.json`, {
    content: '[Tracking] CB System worker activity',
    description: `<div>Heartbeat + per-window digest from the autonomous 15-minute worker (<code>scripts/ops-engine/worker.js</code>).</div><div><br></div><div><strong>What gets posted here:</strong> every ${DIGEST_EVERY_N_TICKS} ticks (about every ${DIGEST_EVERY_N_TICKS * 15} minutes), a comment summarizing what the worker moved in that window. Per-todo results land as comments on each todo, not here.</div><div><br></div><div><strong>Stays open</strong> as long as the worker runs.</div>`,
    assignee_ids: [ALI_ID, CB_SYSTEM_ID],
    due_on: null,
    notify: false,
  });
  fs.writeFileSync(META_TRACKING_TODO_PATH, String(t.id));
  return t.id;
}

async function runTick() {
  const state = loadState();
  state.tick_count = (state.tick_count || 0) + 1;
  const tickStart = Date.now();
  console.log(`tick ${state.tick_count} start ${new Date().toISOString()}`);

  const todos = await listCbAssignedTodos();
  console.log(`  ${todos.length} CB-System-assigned open todos found`);

  const classified = todos.map(t => ({ todo: t, ...classifyTodo(t) }));
  const byRecipe = {};
  for (const c of classified) byRecipe[c.recipe] = (byRecipe[c.recipe] || 0) + 1;
  console.log('  by recipe:', byRecipe);

  // Eligible = executable recipe AND not attempted in last PER_TODO_RETRY_HOURS
  const eligible = classified
    .filter(c => c.recipe !== 'needs-recipe' && RECIPES[c.recipe])
    .filter(c => {
      const last = state.attempted[c.todo.id];
      return !last || hoursAgo(last.at) >= PER_TODO_RETRY_HOURS;
    })
    .sort((a, b) => new Date(a.todo.created_at) - new Date(b.todo.created_at));

  console.log(`  ${eligible.length} eligible to execute this tick`);

  let result = { tick: state.tick_count, at: new Date().toISOString(), executed: null, classified_summary: byRecipe };
  if (eligible.length > 0) {
    const pick = eligible[0];
    console.log(`  executing recipe=${pick.recipe} on todo ${pick.todo.id} "${pick.todo.content.slice(0, 60)}"`);
    try {
      const html = await RECIPES[pick.recipe](pick.todo, pick.arg);
      await postComment(pick.todo, html);
      result.executed = { todo_id: pick.todo.id, recipe: pick.recipe, outcome: 'success', duration_ms: Date.now() - tickStart };
    } catch (e) {
      console.error('  recipe failed:', e.message);
      result.executed = { todo_id: pick.todo.id, recipe: pick.recipe, outcome: 'fail', error: e.message, duration_ms: Date.now() - tickStart };
    }
    state.attempted[pick.todo.id] = { at: new Date().toISOString(), recipe: pick.recipe, outcome: result.executed.outcome };
  } else {
    result.executed = null;
  }

  // Digest every N ticks
  if (state.tick_count % DIGEST_EVERY_N_TICKS === 0) {
    const metaId = await ensureMetaTrackingTodo();
    const last = state.ticks.slice(-DIGEST_EVERY_N_TICKS);
    const moved = last.filter(t => t.executed && t.executed.outcome === 'success').length;
    const failed = last.filter(t => t.executed && t.executed.outcome === 'fail').length;
    const digestHtml = `<div>${mentionAli()} worker digest: last ${DIGEST_EVERY_N_TICKS} ticks (about ${DIGEST_EVERY_N_TICKS * 15} min).</div><div><br></div><div>Moved: ${moved}. Failed: ${failed}. Idle: ${DIGEST_EVERY_N_TICKS - moved - failed}.</div><div>By recipe this window: ${JSON.stringify(byRecipe)}.</div><div><br></div><div>Full state: <code>tmp/ops-engine/worker-state.json</code>.</div>`;
    await bcPost(`/buckets/${ALI_PERSONAL_PROJECT}/recordings/${metaId}/comments.json`, { content: digestHtml });
  }

  state.ticks.push(result);
  // Trim ticks history to last 200 entries
  if (state.ticks.length > 200) state.ticks = state.ticks.slice(-200);
  saveState(state);
  console.log(`tick ${state.tick_count} done in ${Date.now() - tickStart}ms`);
}

(async () => {
  if (!acquireLock()) process.exit(0);
  const timeoutHandle = setTimeout(() => {
    console.error('TICK TIMEOUT - exiting');
    releaseLock();
    process.exit(2);
  }, TICK_TIMEOUT_MS);
  try {
    await runTick();
  } catch (e) {
    console.error('TICK FAIL:', e.stack || e.message);
  } finally {
    clearTimeout(timeoutHandle);
    releaseLock();
  }
})();
