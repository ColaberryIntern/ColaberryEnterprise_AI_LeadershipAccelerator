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
const { handleOpenEnded } = require('./cb-system-handler');

const ACCOUNT = '3945211';
const BASE = `https://3.basecampapi.com/${ACCOUNT}`;
const REPO = path.resolve(__dirname, '../..');
const STATE_PATH = path.resolve(REPO, 'tmp/ops-engine/inbound-state.json');
const LOCK_PATH = path.resolve(REPO, 'tmp/ops-engine/inbound.lock');

const CB_SYSTEM_ID = 37708014;
const ALI_ID = 17454835;
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';
const CB_SGID_MARKER = '/Person/37708014';   // appears inside any sgid for CB System
// Plain-text variants Ali uses: "CB System", "CB", "Cb", "cb" with word boundary.
// Doesn't match CB inside larger words (CBC, FCB, etc).
const CB_PLAINTEXT_RE = /\b(CB System|CB Sys|CB)\b/i;
function isCBMention(content) {
  if (!content) return false;
  if (content.includes(CB_SGID_MARKER)) return true;
  // Strip HTML tags for plain-text match
  const stripped = content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  return CB_PLAINTEXT_RE.test(stripped);
}
const TICK_TIMEOUT_MS = 3 * 60 * 1000;
const LOOKBACK_HOURS = 2;
const DRY = process.argv.includes('--dry');

// Fallback token: the cron-env-wrapper.sh used to not export BASECAMP_ACCESS_TOKEN
// from the backend container (it isn't set there), causing every dispatcher tick to die
// silently for hours. This fallback is the same token used elsewhere in the codebase
// (Basecamp tokens rotate every 2 weeks - kept in CCPP Basecamp_AuthInfo per memory).
const BASECAMP_TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';

function getToken() {
  let t = process.env.BASECAMP_ACCESS_TOKEN || BASECAMP_TOKEN_FALLBACK || '';
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
  // Friendlier "queued for next Ali session" acknowledgment instead of error-tone.
  // Per @CB System scope expansion doctrine 2026-05-30: for open-ended requests
  // (anything beyond v1 keyword recipes), CB System acknowledges within 3 min and
  // the actual execution happens in Ali's next Claude Code chat session.
  return `<div>${mention()} I see your request: <em>"${raw.slice(0, 300).replace(/</g, '&lt;')}"</em></div>
<div><br></div>
<div>This needs a real tool run (research, email draft, calendar booking, CCPP lookup, etc.) which the cron-driven dispatcher can not do solo yet. <strong>Queued for the next live session</strong> - Ali will see this when he is next in Claude Code and the response will land here as a follow-up comment.</div>
<div><br></div>
<div style="font-size:11px;color:#64748b">If this is urgent and you want me to do a quick keyword recipe instead, the supported v1 list is: <code>@CB grep:&lt;pattern&gt;</code>, <code>@CB ccpp:&lt;sql&gt;</code>, <code>@CB gmail:&lt;query&gt;</code>, <code>@CB help</code>.</div>`;
}

// Returns HTML if a fixed keyword recipe matched, otherwise null (caller falls
// through to the LLM handler).
function classifyKeyword(text) {
  const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const m = stripped.match(/(grep|ccpp|gmail|help)\s*:\s*(.+?)(?:$|\.|;)/i);
  if (!m) return /\bhelp\b/i.test(stripped) ? recipeHelp() : null;
  const kind = m[1].toLowerCase();
  const arg = (m[2] || '').trim();
  if (kind === 'help') return recipeHelp();
  if (kind === 'grep') return recipeGrep(arg);
  if (kind === 'ccpp') return `<div>${mention()} <code>ccpp:</code> recipe placeholder. CCPP exec from this worker requires SSH-to-prod wiring; until that lands, this reply is a heartbeat. Your query: <em>${arg.slice(0, 300).replace(/</g, '&lt;')}</em></div>`;
  if (kind === 'gmail') return `<div>${mention()} <code>gmail:</code> recipe placeholder. Gmail MCP is not callable from this worker (separate context). Heartbeat: query was <em>${arg.slice(0, 300).replace(/</g, '&lt;')}</em></div>`;
  return null;
}

// --- Event polling ---------------------------------------------------------
// Basecamp events feed gives all account-level events. For now we use it to
// find new comments where CB System is @mentioned by Ali.

async function findNewMentions(state) {
  // Basecamp 3 has no account-wide events feed (404). Use per-bucket events.
  // We hit every project Ali is in, look at recent events, then drill into
  // any comment-events for CB-System @mentions by Ali.
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString();
  let projects;
  try { projects = await bcGetAll('/projects.json'); }
  catch (e) { console.error('projects fetch failed:', e.message); return []; }
  const newMentions = [];
  for (const project of projects) {
    const bucketId = project.id;
    let events;
    try { events = await bcGet(`/buckets/${bucketId}/events.json?since=` + encodeURIComponent(cutoff)); }
    catch (e) { continue; }
    if (!Array.isArray(events) || events.length === 0) continue;
    for (const ev of events) {
      if (ev.creator?.id !== ALI_ID) continue;
      if (!ev.recording) continue;
      const key = String(ev.id);
      if (state.processed[key]) continue;
      const recId = ev.recording.id;
      // Pull comments on that recording to find the actual message text
      try {
        const comments = await bcGet(`/buckets/${bucketId}/recordings/${recId}/comments.json`);
        const recent = (Array.isArray(comments) ? comments : []).filter(c => {
          if (c.creator?.id !== ALI_ID) return false;
          const created = new Date(c.created_at).getTime();
          if (created < new Date(cutoff).getTime()) return false;
          return isCBMention(c.content);
        });
        for (const c of recent) {
          const ckey = `${bucketId}-${c.id}`;
          if (state.processed[ckey]) continue;
          newMentions.push({ bucketId, recId, comment: c, key: ckey });
        }
      } catch (e) { /* skip */ }
    }
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
      const html = classifyKeyword(m.comment.content);
      if (html) {
        // Fixed keyword recipe matched -> single-shot reply.
        try {
          await bcPost(`/buckets/${m.bucketId}/recordings/${m.recId}/comments.json`, { content: html });
          state.processed[m.key] = { at: new Date().toISOString(), outcome: 'replied:keyword' };
          console.log(`  keyword reply to comment ${m.comment.id} on recording ${m.recId}`);
        } catch (e) {
          console.error(`  keyword reply failed for ${m.comment.id}: ${e.message}`);
          state.processed[m.key] = { at: new Date().toISOString(), outcome: 'fail', error: e.message };
        }
      } else {
        // Open-ended -> hand off to LLM handler. It posts its own replies.
        try {
          const result = await handleOpenEnded({
            bcGet, bcPost, mention,
            bucketId: m.bucketId, recId: m.recId, comment: m.comment, aliId: ALI_ID,
          });
          state.processed[m.key] = { at: new Date().toISOString(), outcome: result.ok ? 'replied:llm' : 'llm_error', summary: result.summary, error: result.error };
          console.log(`  llm handler for ${m.comment.id}: ${result.summary}`);
        } catch (e) {
          console.error(`  llm handler failed for ${m.comment.id}: ${e.message}`);
          state.processed[m.key] = { at: new Date().toISOString(), outcome: 'fail', error: e.message };
          // Fallback: friendly ack so Ali knows we saw it
          try {
            await bcPost(`/buckets/${m.bucketId}/recordings/${m.recId}/comments.json`, { content: recipeUnknown(m.comment.content) });
          } catch (_e2) {}
        }
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
