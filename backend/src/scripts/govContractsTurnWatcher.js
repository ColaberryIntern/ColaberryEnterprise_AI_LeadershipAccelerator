#!/usr/bin/env node
/**
 * Gov Contracts "Your Turn" Notifier.
 *
 * Polls Basecamp Gov Contracts project every 5 min. Detects task completions
 * since last tick. For each bid, looks at the bid's next-overall task; if that
 * next task is HUMAN tier, the bid is "waiting on Ali". All such bids in a tick
 * are COALESCED into ONE joint email (a single "your turn" digest), not one
 * email per bid and not one per completion.
 *
 * This honors Ali's rule: "only bug me when it's my move." The daily report
 * carries the overview; this fires on demand only when control just passed back
 * to Ali.
 *
 * Idempotency (CLAUDE.md > Idempotency & Replayability, NON-NEGOTIABLE):
 *   A "turn" is keyed on (bidId, nextTaskId). Once an email has been sent for a
 *   given handoff, its key lands in state.firedKeys and it never re-sends, even
 *   if the run crashes and a retrying scheduler re-invokes us. State is written
 *   immediately after a successful send (crash-safe checkpoint), not only at
 *   end-of-run. A lock file prevents two concurrent invocations from both
 *   firing the same handoff.
 *
 * State: tmp/ops-engine/gov-turn-state.json
 *   - lastSeenCompletions: { [bidId]: ISO } newest completion seen per bid
 *   - firedKeys:           { [bidId:taskId]: ISO } handoffs already notified
 *
 * Run: `node backend/src/scripts/govContractsTurnWatcher.js`
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

const PROJECT_ID = 47346103;
const BASE = 'https://3.basecampapi.com/3945211';
const STATE_PATH = path.resolve(__dirname, '../../../tmp/ops-engine/gov-turn-state.json');
const LOCK_PATH = path.resolve(__dirname, '../../../tmp/ops-engine/gov-turn.lock');
const ALI_EMAIL = 'ali@colaberry.com';
const LOCK_TTL_MS = 10 * 60 * 1000;        // a lock older than this is stale and may be taken
const FIRED_KEY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // prune handoff keys after 30 days

// ---------------------------------------------------------------------------
// Basecamp I/O
// ---------------------------------------------------------------------------
function bcHeaders() {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '');
  return { Authorization: 'Bearer ' + t, 'User-Agent': 'Colaberry Turn Watcher', Accept: 'application/json', 'Content-Type': 'application/json' };
}
async function bcGet(p) { const r = await fetch(p.startsWith('http') ? p : `${BASE}${p}`, { headers: bcHeaders() }); if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`); return r.json(); }
async function bcGetAll(p) {
  let n = p.startsWith('http') ? p : `${BASE}${p}`;
  const out = [];
  while (n) { const r = await fetch(n, { headers: bcHeaders() }); if (!r.ok) break; const pg = await r.json(); if (!Array.isArray(pg)) break; out.push(...pg); const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/); n = lh ? lh[1] : null; }
  return out;
}

// ---------------------------------------------------------------------------
// State + lock (I/O)
// ---------------------------------------------------------------------------
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    if (!s.lastSeenCompletions) s.lastSeenCompletions = {};
    if (!s.firedKeys) s.firedKeys = {};
    return s;
  } catch { return { lastSeenCompletions: {}, firedKeys: {}, lastTickAt: null }; }
}
function saveState(s) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

// Best-effort single-writer lock. Returns true if we acquired it. A lock whose
// timestamp is older than LOCK_TTL_MS is treated as abandoned and taken over.
function acquireLock(nowMs) {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  try {
    const existing = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
    const age = nowMs - new Date(existing.ts).getTime();
    if (Number.isFinite(age) && age < LOCK_TTL_MS) return false; // a fresh lock is held
  } catch { /* no lock or unreadable -> we take it */ }
  fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, ts: new Date(nowMs).toISOString() }));
  return true;
}
function releaseLock() {
  try {
    const existing = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
    if (existing.pid === process.pid) fs.unlinkSync(LOCK_PATH);
  } catch { /* already gone */ }
}

// ---------------------------------------------------------------------------
// Pure decision logic (unit-tested)
// ---------------------------------------------------------------------------
const HUMAN_PATTERNS = [/sign|signature|notarize/i, /bid.no.bid|go.no.go|approve|authorize|decision/i, /call|phone|talk|meeting/i, /pay|payment|wire|deposit|bond/i, /submit|upload to Bonfire|file/i, /negotiate|relationship/i, /CIQ|conflict of interest|form/i];
const AI_PATTERNS = [/draft|drafting|generate|write|compile|summarize|extract/i, /pull|fetch|retrieve|collect|cross.ref/i, /analyze|analysis|score|rank|rate/i, /research|investigate|find/i, /functional requirements|technical requirements|implementation/i, /respond to.*question/i, /capability statement/i];
function classify(content) {
  const text = (content || '').toLowerCase();
  const hScore = HUMAN_PATTERNS.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
  const aScore = AI_PATTERNS.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
  if (hScore > aScore) return 'HUMAN';
  if (aScore > 0) return 'AI';
  return 'EITHER';
}

// Stable idempotency key for a single handoff: this bid is waiting on Ali for
// this specific next task. Survives restarts; only changes when the next task
// itself changes (i.e., a real new handoff).
function turnKey(bidId, taskId) { return `${bidId}:${taskId}`; }

// Sort open todos into execution order (due_on ASC, nulls last; then created_at)
// and return the first with its tier classified, or null if the bid has no open
// work left.
function selectNextOverall(open) {
  const sorted = [...(open || [])].sort((a, b) => {
    if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on);
    if (a.due_on && !b.due_on) return -1;
    if (!a.due_on && b.due_on) return 1;
    return (a.created_at || '').localeCompare(b.created_at || '');
  });
  const next = sorted[0] || null;
  if (next) next.tier = classify(next.content);
  return next;
}

// Given per-bid snapshots and current state, return the list of NEW human-tier
// handoffs to notify. A bid produces a turn iff: a completion newer than the
// last one we saw exists, the next-overall open task is HUMAN tier, and that
// (bid, nextTask) handoff has not already been fired. One turn per bid max, no
// matter how many completions landed in the window.
//   bids: [{ id, name, completed: [todo], open: [todo] }]
function computeTurns({ bids, state }) {
  const turns = [];
  for (const bid of bids) {
    const lastSeen = state.lastSeenCompletions[bid.id] || null;
    const completed = [...(bid.completed || [])].sort((a, b) =>
      (b.completion?.created_at || '').localeCompare(a.completion?.created_at || ''));
    const newCompletions = lastSeen
      ? completed.filter((t) => (t.completion?.created_at || '') > lastSeen)
      : []; // first sighting of a bid: record state, never fire on history
    if (newCompletions.length === 0) continue;

    const nextOverall = selectNextOverall(bid.open);
    if (!nextOverall) continue;            // bid has no remaining work
    if (nextOverall.tier !== 'HUMAN') continue; // AI/EITHER -> not Ali's move

    const key = turnKey(bid.id, nextOverall.id);
    if (state.firedKeys[key]) continue;    // already notified this exact handoff

    const c = newCompletions[0];
    turns.push({
      bidId: bid.id,
      bidName: bid.name,
      key,
      completedTask: { content: c.content, completedBy: c.completion?.creator?.name },
      nextTask: { id: nextOverall.id, content: nextOverall.content, due_on: nextOverall.due_on, app_url: nextOverall.app_url },
    });
  }
  return turns;
}

// Advance the per-bid last-seen completion watermark. Bids whose ids are in
// skipBidIds are left untouched (used when their email failed to send, so they
// are re-detected and retried next tick). Returns a new state object.
function advanceSeen(state, bids, skipBidIds = new Set()) {
  const lastSeenCompletions = { ...state.lastSeenCompletions };
  for (const bid of bids) {
    if (skipBidIds.has(bid.id)) continue;
    const completed = [...(bid.completed || [])].sort((a, b) =>
      (b.completion?.created_at || '').localeCompare(a.completion?.created_at || ''));
    if (completed.length > 0) lastSeenCompletions[bid.id] = completed[0].completion?.created_at || null;
  }
  return { ...state, lastSeenCompletions };
}

// Mark the given turns as fired (idempotency commit). Returns a new state object.
function recordFired(state, turns, nowIso) {
  const firedKeys = { ...state.firedKeys };
  for (const t of turns) firedKeys[t.key] = nowIso;
  return { ...state, firedKeys };
}

// Drop handoff keys older than FIRED_KEY_TTL_MS so the set cannot grow without
// bound. Returns a new state object.
function pruneFiredKeys(state, nowMs, maxAgeMs = FIRED_KEY_TTL_MS) {
  const firedKeys = {};
  for (const [k, iso] of Object.entries(state.firedKeys || {})) {
    const age = nowMs - new Date(iso).getTime();
    if (!Number.isFinite(age) || age < maxAgeMs) firedKeys[k] = iso;
  }
  return { ...state, firedKeys };
}

// ---------------------------------------------------------------------------
// Email rendering (pure)
// ---------------------------------------------------------------------------
function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function htmlEscape(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function renderTurnCard(turn) {
  const { completedTask, nextTask, bidName } = turn;
  return `
<div style="margin-bottom:22px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
<div style="background:#1c1917;color:white;padding:14px 20px">
<div style="font-size:18px;font-weight:800;line-height:1.25">${htmlEscape(stripEmDashes(bidName))}</div>
</div>
<div style="padding:16px 20px">
<div style="background:#dcfce7;border-left:4px solid #16a34a;padding:12px 16px;border-radius:0 4px 4px 0;margin-bottom:14px">
<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#166534;font-weight:700">Just completed</div>
<div style="font-size:14px;color:#14532d;margin-top:4px"><strong>${htmlEscape(stripEmDashes(completedTask.content))}</strong>${completedTask.completedBy ? ` &middot; by ${htmlEscape(completedTask.completedBy)}` : ''}</div>
</div>
<div style="background:#1c1917;color:white;padding:16px 20px;border-radius:8px;border-left:4px solid #fbbf24">
<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Next - waiting on you</div>
<a href="${nextTask.app_url}" style="display:block;font-size:16px;color:white;text-decoration:none;font-weight:700;margin-top:6px;line-height:1.3">${htmlEscape(stripEmDashes(nextTask.content))}</a>
<div style="margin-top:6px;font-size:12px;color:#cbd5e0">${nextTask.due_on ? `due ${nextTask.due_on}` : 'no due date'}</div>
<div style="margin-top:12px"><a href="${nextTask.app_url}" style="display:inline-block;background:#fbbf24;color:#1c1917;padding:9px 16px;border-radius:6px;font-size:13px;font-weight:700;text-decoration:none;letter-spacing:0.5px">Open ticket &rarr;</a></div>
</div>
</div>
</div>`;
}

// Build the single joint email for all turns in this tick.
function renderTurnsEmail(turns) {
  const multi = turns.length > 1;
  const heading = multi ? `${turns.length} bids are waiting on you` : stripEmDashes(turns[0].bidName);
  const subject = multi
    ? `[Your Turn] ${turns.length} Gov Contracts bids waiting on you`
    : `[Your Turn] ${stripEmDashes(turns[0].bidName.slice(0, 60))} - ${stripEmDashes(turns[0].nextTask.content.slice(0, 60))}`;

  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:680px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">
<div style="background:#1c1917;color:white;padding:24px 32px">
<div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#fbbf24;font-weight:700">Your turn - Gov Contracts</div>
<div style="font-size:22px;font-weight:800;margin-top:6px;line-height:1.25">${htmlEscape(heading)}</div>
</div>
<div style="padding:24px 32px">
${turns.map(renderTurnCard).join('\n')}
<div style="margin-top:6px;padding:14px;background:#f8fafc;border-left:4px solid #1a365d;font-size:12px;color:#475569;line-height:1.6">
<strong>Why you're getting this:</strong> tag-you're-it. Per your rule, the daily report covers the overview; this notifier fires only when the previous task just finished and the next is human-tier (you). ${multi ? 'These bids all reached your move in the same window, so they are bundled here. ' : ''}If you can't get to it now, that's fine - this is your fastest-path option, not a nag. Next nudge: tomorrow's daily report or the next time you complete a task.
</div>
</div>
</div>
</body></html>`;

  const textLines = turns.map((t) =>
    `${stripEmDashes(t.bidName)}\n  Just completed: ${stripEmDashes(t.completedTask.content)}\n  Next (waiting on you): ${stripEmDashes(t.nextTask.content)}${t.nextTask.due_on ? ` (due ${t.nextTask.due_on})` : ''}\n  Open ticket: ${t.nextTask.app_url}`);
  const text = `Your turn - Gov Contracts\n\n${textLines.join('\n\n')}\n\nTag-you're-it. Daily report covers the overview; this fires only when control just passed to you. If you can't get to it now, that's fine.`;

  return { subject: stripEmDashes(subject), html: stripEmDashes(html), text: stripEmDashes(text) };
}

// ---------------------------------------------------------------------------
// Send (I/O)
// ---------------------------------------------------------------------------
async function sendTurnsEmail(turns) {
  const { subject, html, text } = renderTurnsEmail(turns);
  validateBeforeSend(html, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: ALI_EMAIL,
    subject,
    text, html,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': 'high', 'X-Priority': '1' },
  });
  return r.messageId;
}

// ---------------------------------------------------------------------------
// Orchestration (I/O)
// ---------------------------------------------------------------------------
async function fetchBids() {
  const proj = await bcGet(`/projects/${PROJECT_ID}.json`);
  const tset = proj.dock.find((d) => d.name === 'todoset');
  const lists = await bcGetAll(`/buckets/${PROJECT_ID}/todosets/${tset.id}/todolists.json`);
  const bids = [];
  for (const list of lists) {
    try {
      const completed = await bcGetAll(`/buckets/${PROJECT_ID}/todolists/${list.id}/todos.json?completed=true`);
      const open = await bcGetAll(`/buckets/${PROJECT_ID}/todolists/${list.id}/todos.json?status=remaining`);
      bids.push({ id: list.id, name: list.name, completed, open });
    } catch (e) { console.warn(`  fetch fail ${list.name}: ${e.message}`); }
  }
  return bids;
}

async function main() {
  const nowMs = Date.now();
  console.log(`[turn-watcher] start ${new Date(nowMs).toISOString()}`);

  if (!acquireLock(nowMs)) {
    console.log('[turn-watcher] another run holds the lock; exiting to avoid duplicate sends.');
    return;
  }

  try {
    let state = loadState();
    const bids = await fetchBids();
    const turns = computeTurns({ bids, state });

    let sentOk = true;
    if (turns.length > 0) {
      try {
        const messageId = await sendTurnsEmail(turns);
        console.log(`[turn-watcher] FIRED joint your-turn email for ${turns.length} bid(s) (msg ${messageId}): ${turns.map((t) => t.bidName).join(' | ')}`);
        // Crash-safe checkpoint: record fired keys + advance seen, then persist
        // immediately, before any further work can throw.
        state = recordFired(state, turns, new Date(nowMs).toISOString());
        state = advanceSeen(state, bids);
        state = pruneFiredKeys(state, nowMs);
        state.lastTickAt = new Date(nowMs).toISOString();
        saveState(state);
      } catch (e) {
        sentOk = false;
        console.error(`[turn-watcher] email send failed: ${e.message}. Turn bids left un-advanced for retry.`);
        // Advance only the bids that were NOT trying to notify, so the failed
        // turns are re-detected and retried on the next tick.
        const skip = new Set(turns.map((t) => t.bidId));
        state = advanceSeen(state, bids, skip);
        state = pruneFiredKeys(state, nowMs);
        state.lastTickAt = new Date(nowMs).toISOString();
        saveState(state);
      }
    } else {
      state = advanceSeen(state, bids);
      state = pruneFiredKeys(state, nowMs);
      state.lastTickAt = new Date(nowMs).toISOString();
      saveState(state);
    }

    console.log(`[turn-watcher] done. fired=${sentOk && turns.length > 0 ? turns.length : 0}`);
  } finally {
    releaseLock();
  }
}

// Run only when invoked directly. Guarding on require.main lets the unit tests
// require this module for the pure helpers without firing Basecamp/Mandrill.
if (require.main === module) {
  main().catch((e) => { releaseLock(); console.error('[turn-watcher] FATAL:', e.stack || e.message); process.exit(1); });
}

module.exports = {
  classify,
  turnKey,
  selectNextOverall,
  computeTurns,
  advanceSeen,
  recordFired,
  pruneFiredKeys,
  renderTurnsEmail,
};
