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
const cbControl = require('./cb-control');
const cbPeople = require('./cb-people');

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

// --- Automated-agent card guard --------------------------------------------
// Some threads (notably the launch "Launch Readiness Dashboard - daily
// snapshots" thread, bucket 47502609 message 9997008325) are watched by
// per-user Basecamp-connected agents. When the daily dashboard snapshot lands,
// each of those agents posts a structured "CB System: automated response" card
// on behalf of its user. Those cards:
//   1. are authored by REAL team-member accounts (their connected agent posts
//      as them), so the ALLOWED_REQUESTER_IDS creator filter does NOT drop
//      them, and
//   2. contain the literal text "@CB System" (a "Tag @CB System..." line),
//      which trips isCBMention.
// The dispatcher therefore treated each card as a genuine @CB request and
// replied to all of them. Worse, every CB reply was fresh thread activity that
// re-triggered the per-user agents, producing a runaway feedback loop on that
// thread (19 comments 2026-06-15 -> 53 on 2026-06-17). The per-comment circuit
// breaker can't stop it because every cycle creates NEW comment IDs.
//
// A dispatcher must never answer another automated agent's card. Detect those
// cards by their stable signature and skip them before they reach the reply
// path. Detection is intentionally narrow: the literal header these cards open
// with, or the co-occurrence of the three structural labels they always carry
// (so a human who merely types "anticipated goal" in prose is not suppressed).
const AUTOMATED_CARD_HEADER_RE = /^\s*CB System\s*:\s*automated response/i;
// CB's OWN AI task-runner output (runCbAiTasks.js / runCbAiTasksGeneric.js).
// Those runners post their "starting" + "deliverable" + "error" comments under a
// real person's identity (the task reviewer), so isOwnOutput (which keys on the
// posting identity / comment id) does NOT catch them, and each one opens with a
// "CB System ..." header that trips the plain-text isCBMention. They are status
// announcements, never requests, so the dispatcher must skip them. Not doing so
// flooded LandJet on 2026-06-29: one runner batch posted 13 "starting this task"
// notes, the dispatcher answered all 13 in a single tick, and the runaway guard
// tripped the kill switch. Anchored at the start so the phrase appearing inside a
// human's prose does not get suppressed.
const CB_RUNNER_OUTPUT_RE = /^\s*CB System (is starting this task|first-pass deliverable|hit an error drafting)/i;
function isAutomatedAgentCard(content) {
  if (!content) return false;
  const stripped = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (AUTOMATED_CARD_HEADER_RE.test(stripped)) return true;
  if (CB_RUNNER_OUTPUT_RE.test(stripped)) return true;
  // Structural fallback: the card always pairs an "Anticipated goal" with a
  // "Proposed plan" and a "Claude Code prompt" block. All three together is a
  // machine-generated card; any one alone is too loose to suppress on.
  const hasGoal = /\bAnticipated goal\s*:/i.test(stripped);
  const hasPlan = /\bProposed plan\s*:/i.test(stripped);
  const hasPrompt = /\bClaude Code prompt\b/i.test(stripped);
  return hasGoal && hasPlan && hasPrompt;
}
const TICK_TIMEOUT_MS = 3 * 60 * 1000;
const LOOKBACK_HOURS = 2;
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
// Lazy so `require()`-ing this module (e.g. from a unit test of the pure
// helpers) doesn't throw when BASECAMP_ACCESS_TOKEN is absent. The token is
// only resolved on the first real Basecamp call inside a tick.
let _token = null;
function token() { if (_token == null) _token = getToken(); return _token; }
const H = () => ({ Authorization: `Bearer ${token()}`, 'User-Agent': 'Colaberry Ops Inbound', Accept: 'application/json', 'Content-Type': 'application/json' });

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
// --- Self-reply loop guard -------------------------------------------------
// Registry of comment IDs THIS process has posted. The dispatcher must never
// treat its own output as an inbound @CB mention. Tracking by comment ID is
// sanitizer-proof (Basecamp's rich-text sanitizer can strip an in-band HTML
// marker) and identity-proof (works even when the BC token degrades to a
// different person). Seeded from state at tick start, persisted in saveState.
const ownComments = new Set();
// True if this recording is OUR OWN output and must be skipped: a comment this
// process posted (by id), or anything authored by the identity we post as.
function isOwnOutput(rec, ownSet, postingId) {
  if (!rec) return false;
  if (ownSet && ownSet.has(rec.id)) return true;
  if (postingId != null && rec.creator && rec.creator.id === postingId) return true;
  return false;
}

async function bcPost(p, body) {
  if (DRY) { console.log('[dry] POST', p, JSON.stringify(body).slice(0, 200)); return { id: 'dry' }; }
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  const res = await r.json();
  // Remember every comment we create so the next scan skips our own output.
  if (/\/comments\.json$/.test(p) && res && typeof res.id !== 'undefined') ownComments.add(res.id);
  return res;
}

// The Basecamp identity this process is actually posting AS (resolved once per
// tick from /my/profile.json). The loop-safety model assumes CB posts as CB
// System (37708014), which is NOT in ALLOWED_REQUESTER_IDS, so its own comments
// are naturally ignored. On 2026-06-22 the BC token degraded to Ali (17454835,
// the #1 allowed requester) after the 06-19 token rekey; every author-based
// guard collapsed at once and CB answered itself ~60x/hr (1,245 comments). We
// now resolve the identity each tick and HALT if it is not CB System.
let selfId = null;
async function resolveSelfId() {
  try { const me = await bcGet('/my/profile.json'); return me && typeof me.id !== 'undefined' ? me.id : null; }
  catch (e) { console.error(`  resolveSelfId failed: ${e.message}`); return null; }
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
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    if (!s.replyCounts) s.replyCounts = {};
    if (!s.alarmed) s.alarmed = {};
    return s;
  } catch { return { last_tick: null, processed: {}, replyCounts: {}, alarmed: {} }; }
}
function saveState(s) {
  // Persist the most recent own-comment IDs (capped to keep state bounded; only
  // very recent IDs are ever consulted given the 2h lookback window).
  s.ownComments = [...ownComments].slice(-3000);
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}
// Build an @-mention for a specific person. `ref` may be a comment's `creator`
// object (carries attachable_sgid, zero network), a name/email/id resolved via
// the per-tick people cache, or a raw sgid. Falls back to Ali when the ref is
// absent or unresolved, so a no-arg `mention()` keeps the original behavior.
// Previously this ALWAYS emitted Ali's sgid, so a reply to anyone else tagged
// Ali and left the real person untagged.
const mention = (ref) => cbPeople.mentionFor(ref, { fallbackSgid: ALI_SGID });

// --- Duplicate-reply circuit breaker ---------------------------------------
// Defense-in-depth backstop, independent of the processed-dedup. The 2026-06-15
// loop posted ~25 replies to single comments because a bug let the same mention
// re-reach the reply path every tick. This caps the blast radius of ANY such
// bug: we count how many times CB has replied to each mention key (persisted in
// state across ticks) and refuse to post once the count hits the cap, firing a
// one-time alarm instead. In normal operation a mention is answered exactly
// once, so the breaker never trips - it only fires when something is wrong.
const MAX_REPLIES_PER_COMMENT = 2;
function replyCountFor(state, key) { return (state.replyCounts && state.replyCounts[key]) || 0; }
function shouldCircuitBreak(state, key, max = MAX_REPLIES_PER_COMMENT) { return replyCountFor(state, key) >= max; }
function recordReply(state, key) {
  if (!state.replyCounts) state.replyCounts = {};
  state.replyCounts[key] = (state.replyCounts[key] || 0) + 1;
}

// --- Runaway auto-trip (account-wide rate guard) ---------------------------
// The per-comment circuit breaker above only caps replies to a SINGLE comment;
// it was blind to the 2026-06-22 flood because each self-reply was a new comment
// id. This guard watches the TOTAL reply rate across all mentions: if CB answers
// more than CB_AUTOTRIP_MAX replies inside a rolling CB_AUTOTRIP_WINDOW, that is
// not normal traffic — it flips the persistent kill switch OFF (cb_dispatcher_
// enabled=false) and alarms, so a runaway stops within minutes instead of hours.
// Defaults trip well below the observed flood rate (~4 replies / 3-min tick)
// but above realistic bursty team usage. Tunable via env for the supervised
// re-launch; raise once trust is established.
const AUTOTRIP_WINDOW_MS = (Number(process.env.CB_AUTOTRIP_WINDOW_MIN) || 15) * 60 * 1000;
const AUTOTRIP_MAX = Number(process.env.CB_AUTOTRIP_MAX_REPLIES) || 12;
function noteReply(state) {
  if (!Array.isArray(state.recentReplyTimes)) state.recentReplyTimes = [];
  const now = Date.now();
  const cutoff = now - AUTOTRIP_WINDOW_MS;
  state.recentReplyTimes = state.recentReplyTimes.filter((t) => t >= cutoff);
  state.recentReplyTimes.push(now);
  return state.recentReplyTimes.length; // count within the rolling window, incl. this one
}

// Best-effort one-time alarm when the breaker trips for a key. Doubles as the
// real-time "a comment got too many replies" alert. Never throws into the tick.
async function alarmCircuitBreak(state, m, count) {
  if (!state.alarmed) state.alarmed = {};
  if (state.alarmed[m.key]) return;        // already alarmed for this key
  state.alarmed[m.key] = new Date().toISOString();
  if (DRY) { console.log(`[dry] would alarm circuit-break for ${m.key} (${count} replies)`); return; }
  try {
    if (!process.env.MANDRILL_API_KEY) { console.error('  circuit-break alarm: MANDRILL_API_KEY unset, logged only'); return; }
    const nodemailer = require(path.resolve(REPO, 'node_modules/nodemailer'));
    const transport = nodemailer.createTransport({
      host: 'smtp.mandrillapp.com', port: 587,
      auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
    });
    const url = `https://3.basecamp.com/${ACCOUNT}/buckets/${m.bucketId}/recordings/${m.recId}`;
    await transport.sendMail({
      from: '"CB Dispatcher" <ali@colaberry.com>',
      to: 'ali@colaberry.com',
      subject: `[CB Circuit Breaker] comment ${m.comment.id} hit ${count} replies - posting halted`,
      text: `The CB inbound-dispatcher circuit breaker tripped.\n\nComment ${m.comment.id} on recording ${m.recId} (bucket ${m.bucketId}) has already received ${count} CB replies, which is at or over the ${MAX_REPLIES_PER_COMMENT}-reply cap. Further replies to this comment are now SUPPRESSED to prevent a duplicate-reply loop.\n\nThis means something re-routed an already-answered mention back into the reply path. Investigate the dispatcher state (tmp/ops-engine/inbound-state.json) and cb-inbound.log.\n\nThread: ${url}`,
      headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
    });
    console.error(`  circuit-break ALARM sent for ${m.key} (${count} replies)`);
  } catch (e) { console.error(`  circuit-break alarm failed: ${e.message}`); }
}

// Rate-limited alarm when the dispatcher's posting identity is not CB System
// (token degradation). Fires at most once / 6h so a stuck token does not email
// Ali every 3 minutes. Never throws into the tick.
async function alarmIdentityDegraded(state, gotId) {
  const last = state.identityAlarmedAt ? new Date(state.identityAlarmedAt).getTime() : 0;
  if (Date.now() - last < 6 * 3600 * 1000) return;        // at most once / 6h
  state.identityAlarmedAt = new Date().toISOString();
  if (DRY) { console.log(`[dry] would alarm identity-degraded (got ${gotId})`); return; }
  try {
    if (!process.env.MANDRILL_API_KEY) { console.error('  identity alarm: MANDRILL_API_KEY unset, logged only'); return; }
    const nodemailer = require(path.resolve(REPO, 'node_modules/nodemailer'));
    const transport = nodemailer.createTransport({
      host: 'smtp.mandrillapp.com', port: 587,
      auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
    });
    await transport.sendMail({
      from: '"CB Dispatcher" <ali@colaberry.com>',
      to: 'ali@colaberry.com',
      subject: `[CB Dispatcher] HALTED - Basecamp token degraded (posting as ${gotId}, not CB System)`,
      text: `The CB inbound-dispatcher resolved its Basecamp posting identity as ${gotId}, but it must post as CB System (${CB_SYSTEM_ID}).\n\nThe dispatcher has HALTED (it is posting nothing) to avoid a self-reply loop like 2026-06-22, when a degraded token made CB answer its own comments ~60x/hr (1,245 comments before it was stopped).\n\nRoot cause is almost always the BC token: the dedicated CB System token rotated/expired and the cron-env-wrapper fell back to a token that resolves to a real person. Restore a CB System (${CB_SYSTEM_ID}) token; the next tick then resumes automatically.`,
      headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
    });
    console.error(`  identity-degraded ALARM sent (got ${gotId})`);
  } catch (e) { console.error(`  identity alarm failed: ${e.message}`); }
}

// Rate-limited alarm when the runaway auto-trip flips the kill switch OFF.
// At most once / 6h so a stuck condition does not spam Ali. Never throws.
async function alarmAutoTrip(state, reason) {
  const last = state.autotripAlarmedAt ? new Date(state.autotripAlarmedAt).getTime() : 0;
  if (Date.now() - last < 6 * 3600 * 1000) return;
  state.autotripAlarmedAt = new Date().toISOString();
  if (DRY) { console.log(`[dry] would alarm auto-trip: ${reason}`); return; }
  try {
    if (!process.env.MANDRILL_API_KEY) { console.error('  auto-trip alarm: MANDRILL_API_KEY unset, logged only'); return; }
    const nodemailer = require(path.resolve(REPO, 'node_modules/nodemailer'));
    const transport = nodemailer.createTransport({
      host: 'smtp.mandrillapp.com', port: 587,
      auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
    });
    await transport.sendMail({
      from: '"CB Dispatcher" <ali@colaberry.com>',
      to: 'ali@colaberry.com',
      subject: '[CB Dispatcher] AUTO-TRIPPED OFF - runaway protection fired',
      text: `The CB inbound-dispatcher auto-tripped its kill switch (cb_dispatcher_enabled is now false). CB will post nothing until you re-enable it from the CB System Command dashboard.\n\nReason: ${reason}\n\nThis fires when CB's reply rate or posting identity looks like a runaway (the 2026-06-22 self-reply flood pattern). Review the recent activity, confirm the Basecamp token still resolves to CB System (${CB_SYSTEM_ID}), then re-enable from the dashboard when it is safe.`,
      headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
    });
    console.error(`  auto-trip ALARM sent: ${reason}`);
  } catch (e) { console.error(`  auto-trip alarm failed: ${e.message}`); }
}

// Flip the persistent kill switch OFF + alarm. Used by both the runaway rate
// guard and the identity-degradation halt. Best-effort; never throws into the tick.
async function autoTrip(state, reason) {
  console.error(`  AUTO-TRIP: ${reason}; flipping cb_dispatcher_enabled OFF`);
  if (!DRY) { try { await cbControl.disable(reason); } catch (e) { console.error(`  cbControl.disable failed: ${e.message}`); } }
  else console.log(`[dry] would flip cb_dispatcher_enabled OFF (${reason})`);
  await alarmAutoTrip(state, reason);
}

// --- Recipes ---------------------------------------------------------------

function recipeHelp(requester) {
  return `<div>${mention(requester)} CB System dispatcher v1 - keyword recipes (LLM dispatcher not yet wired):</div>
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

function recipeGrep(pattern, requester) {
  const r = runCmd('rg', ['--color', 'never', '-n', '--max-count', '50', pattern, '.'], 60000);
  const lines = (r.stdout || '').split('\n').filter(Boolean).slice(0, 50);
  return lines.length
    ? `<div>${mention(requester)} <code>grep:${pattern}</code> -> ${lines.length} matches:</div><pre>${lines.map(l => l.replace(/</g, '&lt;')).join('\n')}</pre>`
    : `<div>${mention(requester)} <code>grep:${pattern}</code> -> no matches.</div>`;
}

function recipeUnknown(raw, requester) {
  // Friendlier "queued for next Ali session" acknowledgment instead of error-tone.
  // Per @CB System scope expansion doctrine 2026-05-30: for open-ended requests
  // (anything beyond v1 keyword recipes), CB System acknowledges within 3 min and
  // the actual execution happens in Ali's next Claude Code chat session.
  return `<div>${mention(requester)} I see your request: <em>"${raw.slice(0, 300).replace(/</g, '&lt;')}"</em></div>
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
function classifyKeyword(text, requester) {
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
    if (kind === 'grep') return recipeGrep(arg, requester);
    if (kind === 'ccpp') return `<div>${mention(requester)} <code>ccpp:</code> recipe placeholder. CCPP exec from this worker requires SSH-to-prod wiring; until that lands, this reply is a heartbeat. Your query: <em>${arg.slice(0, 300).replace(/</g, '&lt;')}</em></div>`;
    if (kind === 'gmail') return `<div>${mention(requester)} <code>gmail:</code> recipe placeholder. Gmail MCP is not callable from this worker (separate context). Heartbeat: query was <em>${arg.slice(0, 300).replace(/</g, '&lt;')}</em></div>`;
  }
  // Help recipe: only when the message is JUST "help" (after stripping
  // mention + CB prefix), nothing more. Anything substantive falls through
  // to the LLM handler.
  if (/^help[.!?]?$/i.test(cmd)) return recipeHelp(requester);
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

// PRIMARY scan: Basecamp's account-wide recordings feed. One paginated query
// per type returns the most-recent recordings across ALL projects (newest
// first), so a tick only looks at what was actually created in the lookback
// window instead of re-walking all 64 project docks. This is what lets a tick
// finish inside the 3-min budget. Replaced the per-project walk on 2026-06-15
// (the walk survives as findNewMentionsByWalk, used only if the feed throws).
async function bcRecordingsSince(type, cutoffMs, maxPages = 20) {
  const out = [];
  let next = `${BASE}/projects/recordings.json?type=${type}&sort=created_at&direction=desc`;
  let pages = 0;
  while (next && pages < maxPages) {
    pages++;
    const r = await fetch(next, { headers: H() });
    if (!r.ok) throw new Error(`recordings ${type} -> ${r.status}`);
    const items = await r.json();
    if (!Array.isArray(items) || items.length === 0) break;
    let anyFresh = false;
    for (const it of items) {
      if (new Date(it.created_at).getTime() >= cutoffMs) { out.push(it); anyFresh = true; }
    }
    // Feed is newest-first; once a whole page is older than the cutoff, stop.
    if (!anyFresh) break;
    const m = (r.headers.get('Link') || '').match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
  }
  return out;
}

async function findNewMentionsByFeed(state, cutoffMs) {
  const newMentions = [];
  const seen = new Set();
  const consider = (rec, recId, key) => {
    if (seen.has(key) || state.processed[key]) return;
    if (isOwnOutput(rec, ownComments, selfId)) return; // never answer our own output (self-reply loop guard)
    if (new Date(rec.created_at).getTime() < cutoffMs) return;
    if (!ALLOWED_REQUESTER_IDS.has(rec.creator?.id)) return;
    if (!isCBMention(rec.content || '')) return;
    if (isAutomatedAgentCard(rec.content || '')) return; // never answer another agent's card
    seen.add(key);
    newMentions.push({
      bucketId: rec.bucket.id,
      recId,
      comment: { id: rec.id, content: rec.content || '', creator: rec.creator, created_at: rec.created_at },
      key,
    });
  };

  // @CB mentions inside comments (on todos, messages, documents, anything).
  const comments = await bcRecordingsSince('Comment', cutoffMs);
  for (const c of comments) {
    if (!c.bucket?.id || !c.parent?.id) continue;
    consider(c, c.parent.id, `${c.bucket.id}-${c.id}`); // key matches the walk's comment key
  }
  // @CB mentions inside a message body itself.
  const messages = await bcRecordingsSince('Message', cutoffMs);
  for (const msg of messages) {
    if (!msg.bucket?.id) continue;
    consider(msg, msg.id, `${msg.bucket.id}-msg-${msg.id}`); // key matches the walk's message key
  }
  return newMentions;
}

async function findNewMentions(state) {
  const cutoffMs = Date.now() - LOOKBACK_HOURS * 3600 * 1000;
  try {
    const m = await findNewMentionsByFeed(state, cutoffMs);
    console.log(`  scanned recordings feed (Comment+Message), ${m.length} new @CB mention(s)`);
    return m;
  } catch (e) {
    console.warn(`  recordings feed failed (${e.message}); falling back to per-project walk`);
    return findNewMentionsByWalk(state, cutoffMs);
  }
}

// FALLBACK scan: walk every project's dock. Slow (re-fetches all 64 projects
// each tick, which is why ticks were blowing the 3-min budget pre-2026-06-15),
// but exhaustive. Only used when the recordings-feed scan throws, so we never
// go blind if the feed endpoint has a bad day.
async function findNewMentionsByWalk(state, cutoffMs) {
  const newMentions = [];

  const watchedBuckets = await getWatchedBuckets();
  console.log(`  [fallback] walking ${watchedBuckets.length} project${watchedBuckets.length === 1 ? '' : 's'}`);

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
                && !isOwnOutput({ id: msg.id, creator: fullMsg.creator || msg.creator }, ownComments, selfId)
                && ALLOWED_REQUESTER_IDS.has(fullMsg.creator?.id ?? msg.creator?.id)
                && isCBMention(fullMsg.content || '')
                && !isAutomatedAgentCard(fullMsg.content || '')) {
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
    if (isOwnOutput(c, ownComments, selfId)) continue; // never answer our own output (self-reply loop guard)
    if (!ALLOWED_REQUESTER_IDS.has(c.creator?.id)) continue;
    const ctime = new Date(c.created_at).getTime();
    if (ctime < cutoffMs) continue;
    if (!isCBMention(c.content)) continue;
    if (isAutomatedAgentCard(c.content)) continue; // never answer another agent's card
    const key = `${bucketId}-${c.id}`;
    if (state.processed[key]) continue;
    newMentions.push({ bucketId, recId, comment: c, key });
  }
}

// Exported for unit tests. Guarded IIFE below only runs when executed directly.
module.exports = { shouldCircuitBreak, replyCountFor, recordReply, isCBMention, isAutomatedAgentCard, classifyKeyword, MAX_REPLIES_PER_COMMENT, findNewMentionsByFeed, findNewMentionsByWalk, isOwnOutput, CB_SYSTEM_ID, noteReply, AUTOTRIP_MAX, AUTOTRIP_WINDOW_MS };

if (require.main !== module) return;

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
    // Seed our own-comment registry so we never answer comments we posted.
    if (Array.isArray(state.ownComments)) for (const id of state.ownComments) ownComments.add(id);
    // KILL SWITCH: the dashboard (or a prior auto-trip) can disable the
    // dispatcher via system_settings.cb_dispatcher_enabled. Checked before any
    // posting work. A real run exits immediately; a --dry run keeps going so the
    // switch never blocks observation (bcPost is a no-op under --dry anyway).
    const control = await cbControl.isEnabled();
    if (!control.enabled) {
      console.log(`  KILL SWITCH OFF: cb_dispatcher_enabled=false (source=${control.source}${control.error ? `, dberr=${control.error}` : ''}).`);
      if (!DRY) {
        state.last_tick = new Date().toISOString();
        saveState(state);
        clearTimeout(timeout);
        releaseLock();
        await cbControl.close();
        process.exit(0);
      }
      console.log('  [dry] kill switch is OFF - continuing for observation only (no posts).');
    }
    // Resolve who we are posting AS. The loop-safety model REQUIRES CB System.
    // If the token has degraded to a real person, trip the kill switch + HALT
    // (post nothing) rather than ignite a self-reply loop. Re-enable from the
    // dashboard once a CB System token is confirmed restored.
    selfId = await resolveSelfId();
    if (selfId !== CB_SYSTEM_ID) {
      console.error(`  IDENTITY DEGRADED: posting as ${selfId}, expected CB System ${CB_SYSTEM_ID}; halting tick (no posts) to avoid a self-reply loop.`);
      await autoTrip(state, `identity_degraded: posting as ${selfId}, expected CB System ${CB_SYSTEM_ID}`);
      await alarmIdentityDegraded(state, selfId);
      state.last_tick = new Date().toISOString();
      if (!DRY) saveState(state);
      clearTimeout(timeout);
      releaseLock();
      await cbControl.close();
      process.exit(0);
    }
    // Warm the people cache once per tick so @-mentions resolve to the real
    // person (by name/email/id) and not just the requester's own object-sgid.
    // Best-effort: ensurePeopleLoaded swallows its own errors, so a /people.json
    // hiccup degrades mentions to the Ali fallback rather than breaking the tick.
    try { await cbPeople.ensurePeopleLoaded({ bcGet: bcGetAll }); } catch (_e) {}
    const mentions = await findNewMentions(state);
    console.log(`  ${mentions.length} new @CB mentions from team members`);
    for (const m of mentions) {
      let repliedNow = false;
      // CIRCUIT BREAKER: if we've already replied to this exact mention key the
      // cap number of times, refuse to post again and alarm. Backstops any bug
      // that re-routes an already-answered mention into the reply path.
      if (shouldCircuitBreak(state, m.key)) {
        const n = replyCountFor(state, m.key);
        console.error(`  CIRCUIT BREAKER: ${n} prior replies to ${m.key} (comment ${m.comment.id}); suppressing + alarming`);
        state.processed[m.key] = { at: new Date().toISOString(), outcome: 'circuit_broken', replies: n };
        await alarmCircuitBreak(state, m, n);
        if (!DRY) saveState(state);
        continue;
      }
      const html = classifyKeyword(m.comment.content, m.comment.creator);
      if (html) {
        // Fixed keyword recipe matched -> single-shot reply.
        try {
          await bcPost(`/buckets/${m.bucketId}/recordings/${m.recId}/comments.json`, { content: html });
          recordReply(state, m.key);
          repliedNow = true;
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
          if (result.ok) { recordReply(state, m.key); repliedNow = true; }
          state.processed[m.key] = { at: new Date().toISOString(), outcome: result.ok ? 'replied:llm' : 'llm_error', summary: result.summary, error: result.error };
          console.log(`  llm handler for ${m.comment.id}: ${result.summary}`);
        } catch (e) {
          console.error(`  llm handler failed for ${m.comment.id}: ${e.message}`);
          state.processed[m.key] = { at: new Date().toISOString(), outcome: 'fail', error: e.message };
          // Fallback: friendly ack so Ali knows we saw it
          try {
            await bcPost(`/buckets/${m.bucketId}/recordings/${m.recId}/comments.json`, { content: recipeUnknown(m.comment.content) });
            recordReply(state, m.key);
            repliedNow = true;
          } catch (_e2) {}
        }
      }
      // Runaway guard: if the TOTAL reply rate crosses the threshold this tick,
      // trip the kill switch and stop. Catches a flood the per-comment breaker
      // misses (each self-reply is a new comment id, as on 2026-06-22).
      if (repliedNow) {
        const windowCount = noteReply(state);
        if (windowCount > AUTOTRIP_MAX) {
          await autoTrip(state, `runaway reply rate: ${windowCount} replies in ${Math.round(AUTOTRIP_WINDOW_MS / 60000)}min (cap ${AUTOTRIP_MAX})`);
          if (!DRY) saveState(state);
          break;
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
    await cbControl.close();
  }
})();
