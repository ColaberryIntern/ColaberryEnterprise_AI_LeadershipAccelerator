#!/usr/bin/env node
/**
 * Operations Engine - Inbound CB System dispatcher (Pattern H-1, v1 skeleton).
 *
 * Polls Basecamp events feed every 3 min. When Ali @mentions CB System
 * in a comment, classify the request and dispatch to a safe-recipe
 * handler. Post results back as a comment on the same recording.
 *
 * v1 (this file): keyword classifier only - no LLM yet. Supports recipes:
 *   - gmail:<query>      -> search Gmail (read-only, Ali still has to confirm)
 *   - ccpp:<sql>         -> read-only CCPP query
 *   - grep:<pattern>     -> ripgrep the repo
 *   - help               -> recipe list
 *   - anything else      -> "I don't know how to handle this" heartbeat
 *
 * v2 (TBD): plug in Claude API for free-form question classification.
 *
 * State: tmp/ops-engine/inbound-state.json - tracks processed comment IDs.
 * Lock: tmp/ops-engine/inbound.lock - prevents overlapping ticks.
 *
 * SAFETY:
 *   - Read-only on every external system. Never sends Mandrill, never modifies
 *     code on disk, never marks Basecamp todos complete.
 *   - Drafts only. If Ali asks "draft an email to X", the draft lands as a
 *     comment - Ali copies + sends.
 *   - 3-min hard timeout per request.
 *
 * Run: BASECAMP_ACCESS_TOKEN=... node scripts/ops-engine/inbound-dispatcher.js
 *      Optional: --dry (classify + log, no comment posts)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ACCOUNT = '3945211';
const BASE = `https://3.basecampapi.com/${ACCOUNT}`;
const REPO = path.resolve(__dirname, '../..');
const STATE_PATH = path.resolve(REPO, 'tmp/ops-engine/inbound-state.json');
const LOCK_PATH = path.resolve(REPO, 'tmp/ops-engine/inbound.lock');

const CB_SYSTEM_ID = 37708014;
const ALI_ID = 17454835;
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';
const CB_SGID_MARKER = '/Person/37708014';   // appears inside any sgid for CB System
const TICK_TIMEOUT_MS = 3 * 60 * 1000;
const LOOKBACK_HOURS = 2;
const DRY = process.argv.includes('--dry');

function getToken() {
  let t = process.env.BASECAMP_ACCESS_TOKEN || '';
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required');
  if (t.toLowerCase().startsWith('bearer ')) t = t.slice(7).trim();
  return t;
}
const TOKEN = getToken();
const H = () => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry Ops Inbound', Accept: 'application/json', 'Content-Type': 'application/json' });

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
  if (DRY) { console.log('[dry] POST', p, JSON.stringify(body).slice(0, 200)); return { id: 'dry' }; }
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

function acquireLock() {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  if (fs.existsSync(LOCK_PATH)) {
    const pid = Number(fs.readFileSync(LOCK_PATH, 'utf8'));
    try { process.kill(pid, 0); console.log(`locked by pid ${pid}`); return false; }
    catch { console.log('stale lock, taking over'); }
  }
  fs.writeFileSync(LOCK_PATH, String(process.pid));
  return true;
}
function releaseLock() { try { fs.unlinkSync(LOCK_PATH); } catch {} }
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return { last_tick: null, processed: {} }; }
}
function saveState(s) { fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); }
const mention = () => `<bc-attachment sgid="${ALI_SGID}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;

// --- Recipes ---------------------------------------------------------------

function recipeHelp() {
  return `<div>${mention()} CB System dispatcher v1 - keyword recipes (LLM dispatcher not yet wired):</div>
<ul>
  <li><code>@CBSystem grep:&lt;pattern&gt;</code> - ripgrep the codebase, return first 50 matches</li>
  <li><code>@CBSystem ccpp:&lt;SQL&gt;</code> - read-only CCPP query (production DB)</li>
  <li><code>@CBSystem gmail:&lt;query&gt;</code> - search Gmail (Gmail MCP not yet authorized for read from this worker; will say so)</li>
  <li><code>@CBSystem help</code> - this list</li>
</ul>
<div>Send a comment with one of those prefixes. CB System will post results here.</div>`;
}

function runCmd(cmd, args, timeoutMs) {
  const r = spawnSync(cmd, args, { cwd: REPO, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function recipeGrep(pattern) {
  const r = runCmd('rg', ['--color', 'never', '-n', '--max-count', '50', pattern, '.'], 60000);
  const lines = (r.stdout || '').split('\n').filter(Boolean).slice(0, 50);
  return lines.length
    ? `<div>${mention()} <code>grep:${pattern}</code> -> ${lines.length} matches:</div><pre>${lines.map(l => l.replace(/</g, '&lt;')).join('\n')}</pre>`
    : `<div>${mention()} <code>grep:${pattern}</code> -> no matches.</div>`;
}

function recipeUnknown(raw) {
  return `<div>${mention()} I saw your @mention but the request did not match a v1 keyword recipe. Send <code>@CBSystem help</code> for the supported list. Raw text I saw: <em>"${raw.slice(0, 200).replace(/</g, '&lt;')}"</em></div>`;
}

function classifyAndDispatch(text) {
  const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const m = stripped.match(/(grep|ccpp|gmail|help)\s*:\s*(.+?)(?:$|\.|;)/i);
  if (!m) return /\bhelp\b/i.test(stripped) ? recipeHelp() : recipeUnknown(stripped);
  const kind = m[1].toLowerCase();
  const arg = (m[2] || '').trim();
  if (kind === 'help') return recipeHelp();
  if (kind === 'grep') return recipeGrep(arg);
  if (kind === 'ccpp') return `<div>${mention()} <code>ccpp:</code> recipe placeholder. CCPP exec from this worker requires SSH-to-prod wiring; until that lands, this reply is a heartbeat. Your query: <em>${arg.slice(0, 300).replace(/</g, '&lt;')}</em></div>`;
  if (kind === 'gmail') return `<div>${mention()} <code>gmail:</code> recipe placeholder. Gmail MCP is not callable from this worker (separate context). Heartbeat: query was <em>${arg.slice(0, 300).replace(/</g, '&lt;')}</em></div>`;
  return recipeUnknown(stripped);
}

// --- Event polling ---------------------------------------------------------
// Basecamp events feed gives all account-level events. For now we use it to
// find new comments where CB System is @mentioned by Ali.

async function findNewMentions(state) {
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString();
  let events;
  try { events = await bcGetAll('/events.json?since=' + encodeURIComponent(cutoff)); }
  catch (e) { console.error('events fetch failed:', e.message); return []; }
  const newMentions = [];
  for (const ev of events) {
    if (ev.action !== 'commented' && ev.action !== 'reposted' && ev.action !== 'created') continue;
    if (!ev.recording || !ev.creator) continue;
    if (ev.creator.id !== ALI_ID) continue;
    // Pull the comment body to check for CB System mention
    const bucketId = ev.bucket?.id;
    const recId = ev.recording?.id;
    if (!bucketId || !recId) continue;
    // event id makes a stable key
    const key = String(ev.id);
    if (state.processed[key]) continue;
    // Comments live at /buckets/<b>/recordings/<r>/comments.json with full text
    try {
      // The event itself often has the comment id in summary; we pull recording comments
      const comments = await bcGet(`/buckets/${bucketId}/recordings/${recId}/comments.json?since=` + encodeURIComponent(cutoff));
      const recent = comments.filter(c => c.creator?.id === ALI_ID && c.content?.includes(CB_SGID_MARKER));
      for (const c of recent) {
        const ckey = `${bucketId}-${c.id}`;
        if (state.processed[ckey]) continue;
        newMentions.push({ bucketId, recId, comment: c, key: ckey });
      }
    } catch (e) { /* skip */ }
  }
  return newMentions;
}

(async () => {
  if (!acquireLock()) process.exit(0);
  const timeout = setTimeout(() => { console.error('TICK TIMEOUT'); releaseLock(); process.exit(2); }, TICK_TIMEOUT_MS);
  try {
    const state = loadState();
    console.log(`tick ${new Date().toISOString()}, last=${state.last_tick}`);
    const mentions = await findNewMentions(state);
    console.log(`  ${mentions.length} new @CB mentions from Ali`);
    for (const m of mentions) {
      const html = classifyAndDispatch(m.comment.content);
      try {
        await bcPost(`/buckets/${m.bucketId}/recordings/${m.recId}/comments.json`, { content: html });
        state.processed[m.key] = { at: new Date().toISOString(), outcome: 'replied' };
        console.log(`  replied to comment ${m.comment.id} on recording ${m.recId}`);
      } catch (e) {
        console.error(`  reply failed for ${m.comment.id}: ${e.message}`);
        state.processed[m.key] = { at: new Date().toISOString(), outcome: 'fail', error: e.message };
      }
    }
    state.last_tick = new Date().toISOString();
    if (!DRY) saveState(state);
  } catch (e) {
    console.error('TICK FAIL:', e.stack || e.message);
  } finally {
    clearTimeout(timeout);
    releaseLock();
  }
})();
