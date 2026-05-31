#!/usr/bin/env node
// Gov Contracts "Your Turn" Notifier.
//
// Polls Basecamp Gov Contracts project every 5 min. Detects task completions
// since last tick. For each completion, looks at the bid's next-overall task.
// If next is HUMAN tier, fires an immediate "your turn" email to Ali. If next
// is AI, flags for the future auto-runner (placeholder for now).
//
// This honors Ali's rule: "only bug me when it's my move." Daily report comes
// out daily; this fires ON DEMAND only when control just passed to Ali.
//
// State: tmp/ops-engine/gov-turn-state.json - tracks last completion ids seen
//   per bid so we don't double-fire.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

const PROJECT_ID = 47346103;
const BASE = 'https://3.basecampapi.com/3945211';
const STATE_PATH = path.resolve(__dirname, '../../../tmp/ops-engine/gov-turn-state.json');
const ALI_EMAIL = 'ali@colaberry.com';

function bcHeaders() {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da').replace(/^bearer\s+/i, '');
  return { Authorization: 'Bearer ' + t, 'User-Agent': 'Colaberry Turn Watcher', Accept: 'application/json', 'Content-Type': 'application/json' };
}
async function bcGet(p) { const r = await fetch(p.startsWith('http') ? p : `${BASE}${p}`, { headers: bcHeaders() }); if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`); return r.json(); }
async function bcGetAll(p) {
  let n = p.startsWith('http') ? p : `${BASE}${p}`;
  const out = [];
  while (n) { const r = await fetch(n, { headers: bcHeaders() }); if (!r.ok) break; const pg = await r.json(); if (!Array.isArray(pg)) break; out.push(...pg); const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/); n = lh ? lh[1] : null; }
  return out;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return { lastSeenCompletions: {}, lastTickAt: null }; }
}
function saveState(s) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

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

function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function htmlEscape(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function sendYourTurnEmail({ bidName, completedTask, nextTask }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:680px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:#1c1917;color:white;padding:24px 32px">
<div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#fbbf24;font-weight:700">Your turn - Gov Contracts</div>
<div style="font-size:22px;font-weight:800;margin-top:6px;line-height:1.25">${htmlEscape(stripEmDashes(bidName))}</div>
</div>

<div style="padding:24px 32px">

<div style="background:#dcfce7;border-left:4px solid #16a34a;padding:14px 18px;border-radius:0 4px 4px 0;margin-bottom:16px">
<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#166534;font-weight:700">Just completed</div>
<div style="font-size:14px;color:#14532d;margin-top:4px"><strong>${htmlEscape(stripEmDashes(completedTask.content))}</strong>${completedTask.completedBy ? ` &middot; by ${htmlEscape(completedTask.completedBy)}` : ''}</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 22px;border-radius:8px;border-left:4px solid #fbbf24">
<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Next - waiting on you</div>
<a href="${nextTask.app_url}" style="display:block;font-size:17px;color:white;text-decoration:none;font-weight:700;margin-top:6px;line-height:1.3">${htmlEscape(stripEmDashes(nextTask.content))}</a>
<div style="margin-top:6px;font-size:12px;color:#cbd5e0">${nextTask.due_on ? `due ${nextTask.due_on}` : 'no due date'}</div>
<div style="margin-top:12px"><a href="${nextTask.app_url}" style="display:inline-block;background:#fbbf24;color:#1c1917;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:700;text-decoration:none;letter-spacing:0.5px">Open ticket &rarr;</a></div>
</div>

<div style="margin-top:18px;padding:14px;background:#f8fafc;border-left:4px solid #1a365d;font-size:12px;color:#475569;line-height:1.6">
<strong>Why you're getting this:</strong> tag-you're-it. Per your rule, the daily report covers the overview; this notifier fires only when the previous task just finished and the next is human-tier (you). If you can't get to it now, that's fine - this is your fastest-path option, not a nag. Next nudge: tomorrow's daily report or the next time you complete a task.
</div>

</div>
</div>
</body></html>`;
  const text = `Your turn - ${stripEmDashes(bidName)}\n\nJust completed: ${stripEmDashes(completedTask.content)}\nNext (waiting on you): ${stripEmDashes(nextTask.content)}${nextTask.due_on ? ` (due ${nextTask.due_on})` : ''}\n\nOpen ticket: ${nextTask.app_url}\n\nTag-you're-it. Daily report covers the overview; this fires only when control just passed to you. If you can't get to it now, that's fine.`;
  validateBeforeSend(stripEmDashes(html), stripEmDashes(text));
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: ALI_EMAIL,
    subject: `[Your Turn] ${stripEmDashes(bidName.slice(0, 60))} - ${stripEmDashes(nextTask.content.slice(0, 60))}`,
    text: stripEmDashes(text), html: stripEmDashes(html),
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': 'high', 'X-Priority': '1' },
  });
  return r.messageId;
}

(async () => {
  console.log(`[turn-watcher] start ${new Date().toISOString()}`);
  const state = loadState();
  const now = new Date();

  // Pull all todolists in Gov Contracts. Skip lists that look like meta/index.
  const proj = await bcGet(`/projects/${PROJECT_ID}.json`);
  const tset = proj.dock.find((d) => d.name === 'todoset');
  const lists = await bcGetAll(`/buckets/${PROJECT_ID}/todosets/${tset.id}/todolists.json`);

  let firedCount = 0;
  for (const list of lists) {
    // For each bid: pull recently-completed todos AND all open todos
    let completed = [];
    let open = [];
    try {
      completed = await bcGetAll(`/buckets/${PROJECT_ID}/todolists/${list.id}/todos.json?completed=true`);
      open = await bcGetAll(`/buckets/${PROJECT_ID}/todolists/${list.id}/todos.json?status=remaining`);
    } catch (e) { console.warn(`  fetch fail ${list.name}: ${e.message}`); continue; }

    // Find completions newer than last seen for this bid
    const lastSeen = state.lastSeenCompletions[list.id] || null;
    completed.sort((a, b) => (b.completion?.created_at || '').localeCompare(a.completion?.created_at || ''));

    const newCompletions = lastSeen
      ? completed.filter((t) => (t.completion?.created_at || '') > lastSeen)
      : [];  // first run: don't fire on historical completions; just record current state

    // Sort open todos in execution order (due_on ASC nulls last)
    open.sort((a, b) => {
      if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on);
      if (a.due_on && !b.due_on) return -1;
      if (!a.due_on && b.due_on) return 1;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });
    for (const t of open) t.tier = classify(t.content);
    const nextOverall = open[0] || null;

    // Fire for each new completion if next is HUMAN
    for (const c of newCompletions) {
      if (!nextOverall) {
        console.log(`  ${list.name}: completion "${c.content}" - no next task, bid may be done`);
        continue;
      }
      if (nextOverall.tier !== 'HUMAN') {
        console.log(`  ${list.name}: completion "${c.content}" - next is ${nextOverall.tier} ("${nextOverall.content}"). Skip notify; queue for auto-runner (v1.1).`);
        continue;
      }
      try {
        const messageId = await sendYourTurnEmail({
          bidName: list.name,
          completedTask: { content: c.content, completedBy: c.completion?.creator?.name },
          nextTask: { content: nextOverall.content, due_on: nextOverall.due_on, app_url: nextOverall.app_url },
        });
        console.log(`  ${list.name}: FIRED your-turn email for "${nextOverall.content}" (msg ${messageId})`);
        firedCount++;
      } catch (e) {
        console.error(`  ${list.name}: email fail: ${e.message}`);
      }
    }

    // Update last-seen completion for this bid
    if (completed.length > 0) {
      state.lastSeenCompletions[list.id] = completed[0].completion?.created_at || null;
    }
  }

  state.lastTickAt = now.toISOString();
  saveState(state);
  console.log(`[turn-watcher] done. fired=${firedCount}`);
})().catch((e) => { console.error('[turn-watcher] FATAL:', e.stack || e.message); process.exit(1); });
