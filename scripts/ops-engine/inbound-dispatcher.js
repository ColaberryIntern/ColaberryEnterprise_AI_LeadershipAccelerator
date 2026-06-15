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
const { buildMention } = require('./cb-reply-sanitizer');

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
// Default 2h (every 3-min cron only needs a small window). Override with
// CB_LOOKBACK_HOURS for a one-time catch-up, e.g. CB_LOOKBACK_HOURS=24 to
// reply to every unprocessed @CB mention from the past day. The processed-state
// dedup means a wider window never double-replies to already-answered mentions.
const LOOKBACK_HOURS = parseFloat(process.env.CB_LOOKBACK_HOURS) || 2;
const DRY = process.argv.includes('--dry');

// Fallback token: the cron-env-wrapper.sh used to not export BASECAMP_ACCESS_TOKEN
// from the backend container (it isn't set there), causing every dispatcher tick to die
// silently for hours. This fallback is the same token used elsewhere in the codebase
// (Basecamp tokens rotate every 2 weeks - kept in CCPP Basecamp_AuthInfo per memory).
const BASECAMP_TOKEN_FALLBACK = '';

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

// Hardcoded-Ali mention, kept ONLY as the last-resort fallback when we cannot
// resolve the actual requester's sgid. The bug this replaced: every CB reply
// @-mentioned Ali regardless of who asked (confirmed 2026-06-10 on todo
// 9946499609 where Ram asked the question but the reply tagged Ali).
const aliMention = () => `<bc-attachment sgid="${ALI_SGID}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;

// Basecamp Person objects carry attachable_sgid, but the comment/message
// payloads do not always include it. Resolve + cache it from /people/{id}.json
// so the @-mention points at the person who actually tagged CB.
const sgidCache = new Map();
async function ensurePersonSgid(person) {
  if (!person || !person.id) return person;
  if (person.attachable_sgid) return person;
  if (sgidCache.has(person.id)) { person.attachable_sgid = sgidCache.get(person.id); return person; }
  try {
    const full = await bcGet(`/people/${person.id}.json`);
    if (full && full.attachable_sgid) {
      sgidCache.set(person.id, full.attachable_sgid);
      person.attachable_sgid = full.attachable_sgid;
    }
  } catch (_e) { /* fall through to plain-name / Ali fallback in buildMention */ }
  return person;
}

// Returns a mention() function bound to a specific requester. All recipe and
// handler reply paths use this so the tag always matches who asked.
function mentionFor(person) {
  return () => buildMention(person, { fallbackSgid: ALI_SGID });
}

// --- Recipes ---------------------------------------------------------------

function recipeHelp(mention) {
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

function recipeGrep(pattern, mention) {
  const r = runCmd('rg', ['--color', 'never', '-n', '--max-count', '50', pattern, '.'], 60000);
  const lines = (r.stdout || '').split('\n').filter(Boolean).slice(0, 50);
  return lines.length
    ? `<div>${mention()} <code>grep:${pattern}</code> -> ${lines.length} matches:</div><pre>${lines.map(l => l.replace(/</g, '&lt;')).join('\n')}</pre>`
    : `<div>${mention()} <code>grep:${pattern}</code> -> no matches.</div>`;
}

function recipeUnknown(raw, mention) {
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
//
// We deliberately require the user-input to START with the keyword (after the
// @CB mention). Free-form requests like "...you help me with X..." or
// "...you can grep through your..." used to false-positive into the keyword
// path because they contained "help" / "grep" as words. That kept Ali stuck
// with the recipe-list reply when he sent real work. (Bug confirmed 2026-05-31
// on comment 9946342528: PMO system-prompt spec sent to CB but routed to
// help-recipe reply because "help" appeared in the body.)
function classifyKeyword(text, mention) {
  // Strip HTML, strip the BC mention attachment, normalize whitespace.
  const stripped = text
    .replace(/<bc-attachment[^>]*content-type="application\/vnd\.basecamp\.mention"[^>]*>[\s\S]*?<\/bc-attachment>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Drop a leading "CB System" / "CB" / "@CB" if present (after mention strip
  // the bare token may remain as plain text).
  const cmd = stripped.replace(/^@?(CB System|CB Sys|CB)[:\s,]*/i, '').trim();
  // Require the command to START with a recognized keyword + colon.
  const m = cmd.match(/^(grep|ccpp|gmail)\s*:\s*(.+?)(?:$|\.|;)/i);
  if (m) {
    const kind = m[1].toLowerCase();
    const arg = (m[2] || '').trim();
    if (kind === 'grep') return recipeGrep(arg, mention);
    if (kind === 'ccpp') return `<div>${mention()} <code>ccpp:</code> recipe placeholder. CCPP exec from this worker requires SSH-to-prod wiring; until that lands, this reply is a heartbeat. Your query: <em>${arg.slice(0, 300).replace(/</g, '&lt;')}</em></div>`;
    if (kind === 'gmail') return `<div>${mention()} <code>gmail:</code> recipe placeholder. Gmail MCP is not callable from this worker (separate context). Heartbeat: query was <em>${arg.slice(0, 300).replace(/</g, '&lt;')}</em></div>`;
  }
  // Help recipe: only when the message is JUST "help" (after stripping
  // mention + CB prefix), nothing more. Anything substantive falls through
  // to the LLM handler.
  if (/^help[.!?]?$/i.test(cmd)) return recipeHelp(mention);
  return null;
}

// --- Event polling ---------------------------------------------------------
// Basecamp events feed gives all account-level events. For now we use it to
// find new comments where CB System is @mentioned by Ali.

// Watched buckets: every active project CB has access to. We enumerate via
// /projects.json each tick rather than maintaining a hardcoded list because
// (a) hardcoded lists silently miss projects Ali adds CB to (Power BI - COE
// missed Ali's 2026-06-01 1:29pm @CB ping on bucket 24864171 because the
// project was not in the hardcoded list, even though CB had access), and
// (b) Ali's directive 2026-06-01: "The agent should work every project it
// has access to." If the projects.json call fails (auth, transient), fall
// back to a known-good list of high-traffic buckets so we never go fully
// blind on critical projects.
const WATCHED_BUCKETS_FALLBACK = [
  46697389, // AI Pathway
  47126345, // ShipCES
  46699826, // LandJet
  47346103, // Gov Contracts
  47477101, // Anthropic Partner Network
  7463955,  // Ali Personal
  24865175, // Internship / Apprenticeship
  33392153, // Family Goals
  24864171, // Power BI - Center of Excellence
];

async function getWatchedBuckets() {
  // CRITICAL: /projects.json?status=active returns 400 - BC's status param does
  // NOT accept "active" (only "archived" or "trashed"). Active is the default
  // when no status param is passed. This was the root cause of multiple
  // "@CB silent" failures on projects added after the hardcoded WATCHED_BUCKETS
  // list was written (Launch PMO bucket 47502609, etc.). Fixed 2026-06-01.
  try {
    const projects = await bcGetAll('/projects.json');
    if (Array.isArray(projects) && projects.length > 0) {
      // Filter out trashed/archived explicitly in case the API ever changes default
      const active = projects.filter((p) => !p.status || p.status === 'active');
      return active.map((p) => p.id);
    }
    console.warn('  /projects.json returned empty; falling back to hardcoded list');
  } catch (e) {
    console.warn(`  /projects.json failed (${e.message}); falling back to hardcoded list`);
  }
  return WATCHED_BUCKETS_FALLBACK;
}

async function findNewMentions(state) {
  const cutoffMs = Date.now() - LOOKBACK_HOURS * 3600 * 1000;
  const newMentions = [];

  const watchedBuckets = await getWatchedBuckets();
  console.log(`  scanning ${watchedBuckets.length} project${watchedBuckets.length === 1 ? '' : 's'}`);

  for (const bucketId of watchedBuckets) {
    let project;
    try { project = await bcGet(`/projects/${bucketId}.json`); }
    catch (e) { console.error(`  bucket ${bucketId} fetch fail: ${e.message}`); continue; }
    const dock = project.dock || [];
    // CRITICAL: BC projects can have MULTIPLE todosets and MULTIPLE message
    // boards in the dock (multi-track projects like Power BI - Center of
    // Excellence have 3 todosets and 6 MBs). Old code used dock.find which
    // returned only the first - everything in the other docks was invisible.
    // Confirmed 2026-06-01: Ali tagged @CB on bucket 24864171 message
    // 9728438673 which lives in MB id 4327456492 (position 2 in dock), but
    // the dispatcher was only scanning MB id 4327456479 (position 6, first
    // match). Iterate all docks of each type.
    const todosets = dock.filter((d) => d.name === 'todoset');
    const messageBoards = dock.filter((d) => d.name === 'message_board');

    // 1. Walk every todoset -> todolists -> todos -> comments.
    // Use bcGetAll for pagination on todolists + todos.
    for (const todoset of todosets) {
      let todolists = [];
      try { todolists = await bcGetAll(`/buckets/${bucketId}/todosets/${todoset.id}/todolists.json`); }
      catch (_e) {}
      if (!Array.isArray(todolists)) todolists = [];
      for (const list of todolists) {
        if (list.updated_at && new Date(list.updated_at).getTime() < cutoffMs) continue;
        let todos = [];
        try { todos = await bcGetAll(`/buckets/${bucketId}/todolists/${list.id}/todos.json`); }
        catch (_e) {}
        if (!Array.isArray(todos)) continue;
        for (const todo of todos) {
          if (!todo.comments_count) continue;
          if (todo.updated_at && new Date(todo.updated_at).getTime() < cutoffMs) continue;
          await scanRecordingComments({ bucketId, recId: todo.id, cutoffMs, state, newMentions });
        }
      }
    }

    // 2. Walk every message board (recent messages) and scan both body + comments.
    for (const messageBoard of messageBoards) {
      let messages = [];
      try { messages = await bcGet(`/buckets/${bucketId}/message_boards/${messageBoard.id}/messages.json`); }
      catch (_e) {}
      if (Array.isArray(messages)) {
        for (const msg of messages.slice(0, 10)) {
          if (msg.updated_at && new Date(msg.updated_at).getTime() < cutoffMs) continue;
          try {
            const fullMsg = msg.content
              ? msg
              : await bcGet(`/buckets/${bucketId}/messages/${msg.id}.json`);
            const created = new Date(fullMsg.created_at || msg.created_at).getTime();
            if (created >= cutoffMs
                && ALLOWED_REQUESTER_IDS.has(fullMsg.creator?.id ?? msg.creator?.id)
                && isCBMention(fullMsg.content || '')) {
              const key = `${bucketId}-msg-${msg.id}`;
              if (!state.processed[key]) {
                newMentions.push({
                  bucketId,
                  recId: msg.id,
                  comment: {
                    id: msg.id,
                    content: fullMsg.content || '',
                    creator: fullMsg.creator || msg.creator,
                    created_at: fullMsg.created_at || msg.created_at,
                  },
                  key,
                });
              }
            }
          } catch (_e) {}
          await scanRecordingComments({ bucketId, recId: msg.id, cutoffMs, state, newMentions });
        }
      }
    }
  }
  return newMentions;
}

// Team roster IDs allowed to tag @CB and trigger handling. Source of truth:
// backend/src/scripts/lib/launchPmoTeam.js. We hardcode the IDs here so the
// dispatcher (running on the VPS host outside the backend container) doesn't
// need to resolve the team module via a fragile path. Keep in sync.
const ALLOWED_REQUESTER_IDS = new Set([
  17454835, // Ali Muwwakkil
  52330127, // Kes Delele
  47335940, // Sohail Syed
  48041031, // Swati Raman
  47335967, // Aleem
  50567410, // Sai Tejesh
  37184021, // Jackie Chalk
  33623344, // Taiwo Oludimimu
  34920126, // Dheeraj Garg
  17346350, // Ram Katamaraja (CEO - keep in case he tags)
  30193051, // Karun Swaroop (AI Tech Director)
]);

async function scanRecordingComments({ bucketId, recId, cutoffMs, state, newMentions }) {
  // CRITICAL: bcGetAll (paginated). Basecamp paginates at 15 per page and
  // returns oldest-first. Previous bcGet-only fetch silently missed @CB
  // mentions on any todo with more than 15 comments. Confirmed 2026-06-01
  // against Internship todo 9570979826 (PIOS, 51 comments, "What's up with
  // Tyra's activity" sat on page 4). Same pagination-skip bug class as the
  // one fixed for todolists/todos above.
  let comments = [];
  try { comments = await bcGetAll(`/buckets/${bucketId}/recordings/${recId}/comments.json`); }
  catch (_e) { return; }
  if (!Array.isArray(comments)) return;
  for (const c of comments) {
    if (!ALLOWED_REQUESTER_IDS.has(c.creator?.id)) continue;
    const ctime = new Date(c.created_at).getTime();
    if (ctime < cutoffMs) continue;
    if (!isCBMention(c.content)) continue;
    const key = `${bucketId}-${c.id}`;
    if (state.processed[key]) continue;
    newMentions.push({ bucketId, recId, comment: c, key });
  }
}

(async () => {
  if (!acquireLock()) process.exit(0);
  // State must be reachable from the timeout closure so a tick that blows the
  // 3-min budget still persists whatever it finished. ROOT CAUSE of the
  // 2026-06-15 duplicate-reply loop: saveState() ran ONLY at the end of the
  // tick. Every tick was timing out (token refetch each tick + 64 projects to
  // walk > 3 min) and process.exit(2)-ing before saveState, so processed
  // mentions were never persisted and got re-replied every 3 min - some
  // comments accrued 25 duplicate CB replies. Fix: persist incrementally after
  // each mention AND on timeout.
  let state = null;
  const timeout = setTimeout(() => {
    console.error('TICK TIMEOUT');
    try { if (state && !DRY) saveState(state); } catch (_e) {}
    releaseLock();
    process.exit(2);
  }, TICK_TIMEOUT_MS);
  try {
    state = loadState();
    console.log(`tick ${new Date().toISOString()}, last=${state.last_tick}`);
    const mentions = await findNewMentions(state);
    console.log(`  ${mentions.length} new @CB mentions from team members`);
    for (const m of mentions) {
      // Resolve the actual requester's @-mention sgid so every reply tags the
      // person who asked, not a hardcoded recipient.
      await ensurePersonSgid(m.comment.creator);
      const mention = mentionFor(m.comment.creator);
      const html = classifyKeyword(m.comment.content, mention);
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
          // Fallback: friendly ack so the requester knows we saw it
          try {
            await bcPost(`/buckets/${m.bucketId}/recordings/${m.recId}/comments.json`, { content: recipeUnknown(m.comment.content, mention) });
          } catch (_e2) {}
        }
      }
      // Persist after EVERY mention. If the tick later times out, already-
      // answered mentions stay marked processed and are never re-replied.
      if (!DRY) saveState(state);
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
