#!/usr/bin/env node
// Anthropic Partner Network countdown report.
// - Daily mode (default): emails Ali (+ CC alimuwwakkil@gmail.com + ram@colaberry.com)
//   AND posts a comment to the persistent Message Board thread so every project
//   participant gets it via Basecamp at the same time the email fires.
// - --no-email: skip email (used for manual MB-only catch-up runs).
// - --no-mb: skip Message Board post (escape hatch).
// - First run auto-creates the parent thread; subsequent runs comment on it.
//   Parent thread ID lives in tmp/anthropic-mb-thread-id.json (per CLAUDE.md
//   /tmp is gitignored, so prod has its own state; the file is recreated on
//   first run if missing — script then creates a new parent. To migrate state
//   between hosts, copy the JSON file.).
//
// Calculation: 10-person cohort, 4 courses each = 40 total. % = completed / 40.
// Goal is hard-coded to 10 cohort members. Ali's own track is excluded.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

const BC_TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || '').trim(); // set by runReportingAuditAndSend (CCPP Basecamp_AuthInfo)
const BUCKET = 47477101;
const BASE = `https://3.basecampapi.com/3945211/buckets/${BUCKET}`;
const H = { Authorization: 'Bearer ' + BC_TOKEN, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };
const DEADLINE = new Date('2026-06-12T23:59:59-05:00');
const REPO = path.resolve(__dirname, '../../..');
const MB_STATE_PATH = path.join(REPO, 'tmp/anthropic-mb-thread-id.json');
const NO_EMAIL = process.argv.includes('--no-email');
const NO_MB = process.argv.includes('--no-mb');
// Legacy flag retained for back-compat with any caller still passing it; the
// persistent-thread path now runs by default unless --no-mb is set.
const POST_MESSAGE_BOARD = !NO_MB;

const COHORT_LIST_IDS = [
  { id: 9942692753, name: 'Angela Mezo' },
  { id: 9942251236, name: 'Srinivas Balla' },
  { id: 9940691151, name: 'Swati Raman' },
  { id: 9940691094, name: 'Taiwo Oludimimu' },
  { id: 9940691052, name: 'Jackie Chalk' },
  { id: 9940691006, name: 'Aleem' },
  { id: 9940690977, name: 'Sohail Syed' },
  { id: 9940690954, name: 'Sai Tejesh' },
  { id: 9940690926, name: 'Karun Swaroop' },
  { id: 9940690894, name: 'Kes Delele' },
  // Added 2026-06-03 per Ram's BC asks on kickoff thread 9940691196 + Ali's discretionary Farhat add
  { id: 9959894249, name: 'Amitav Sahoo' },
  { id: 9959894322, name: 'Narendra Nadella' },
  { id: 9959894402, name: 'David Lahme' },
  { id: 9959894482, name: 'Nate Taylor' },
  { id: 9959894562, name: 'John McBride' },
  { id: 9959894638, name: 'Farhat' },
];

async function bcGet(p) { const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: H }); if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`); return r.json(); }
async function bcGetAll(p) { let n = p.startsWith('http') ? p : BASE + p; const out = []; while (n) { const r = await fetch(n, { headers: H }); if (!r.ok) break; out.push(...(await r.json())); const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/); n = lh ? lh[1] : null; } return out; }

function bar(pct, width = 24) {
  // Clamp fill to [0, width]. Once the cohort grew past the hard-coded 40-course
  // goal, pctComplete exceeded 100, making `'░'.repeat(width - fill)` throw
  // "Invalid count value: -3" and crash the whole report before it could reach
  // its goal-reached shutoff (observed 2026-06-23). Never repeat a negative.
  const fill = Math.max(0, Math.min(width, Math.round((Math.max(0, pct) / 100) * width)));
  return '█'.repeat(fill) + '░'.repeat(Math.max(0, width - fill));
}
function progressBarHtml(pct, color = '#16a34a') {
  return `<div style="background:#e2e8f0;border-radius:4px;height:10px;overflow:hidden;width:100%"><div style="background:${color};height:100%;width:${pct}%;transition:width .3s"></div></div>`;
}
function daysUntil(date) {
  const diff = (date.getTime() - Date.now()) / 86400000;
  return Math.ceil(diff);
}

(async () => {
  // Gather per-person progress
  const people = [];
  for (const p of COHORT_LIST_IDS) {
    try {
      const remaining = await bcGetAll(`/todolists/${p.id}/todos.json`);
      const completed = await bcGetAll(`/todolists/${p.id}/todos.json?completed=true`);
      const total = remaining.length + completed.length;
      const recentlyCompleted = completed.filter(t => {
        const ts = t.completion?.created_at || t.updated_at;
        return ts && (Date.now() - new Date(ts).getTime()) < 7 * 86400000;
      });
      people.push({
        name: p.name,
        listId: p.id,
        listUrl: `https://app.basecamp.com/3945211/buckets/${BUCKET}/todolists/${p.id}`,
        completedCount: completed.length,
        totalCount: total,
        recentlyCompleted: recentlyCompleted.map(t => ({ content: t.content, when: t.completion?.created_at || t.updated_at })),
        completedTitles: completed.map(t => t.content),
      });
    } catch (e) { console.error(`Failed for ${p.name}:`, e.message); }
  }

  const totalGoal = 10 * 4; // 40
  const totalCompleted = people.reduce((s, p) => s + p.completedCount, 0);
  const pctComplete = Math.round((totalCompleted / totalGoal) * 100);
  const remaining = totalGoal - totalCompleted;
  const daysLeft = daysUntil(DEADLINE);
  const pace = daysLeft > 0 ? (remaining / daysLeft).toFixed(2) : 'N/A';

  // Sort + categorize
  const sortedByProgress = [...people].sort((a, b) => b.completedCount - a.completedCount);
  const movers = people.filter(p => p.recentlyCompleted.length > 0);
  const stalled = people.filter(p => p.completedCount === 0);
  const partial = people.filter(p => p.completedCount > 0 && p.completedCount < 4);
  const finished = people.filter(p => p.completedCount === 4);

  // --- TEXT ---
  let text = `ANTHROPIC PARTNER NETWORK - COUNTDOWN

PROGRESS: ${totalCompleted} / 40 courses (${pctComplete}%)
DEADLINE: 2026-06-12 (${daysLeft} days left)
PACE REQUIRED: ${pace} completions / day to hit goal

${bar(pctComplete)} ${pctComplete}%

`;
  if (movers.length > 0) {
    text += `\nRECENT WINS (last 7 days):\n`;
    for (const p of movers) {
      text += `  ${p.name}: ${p.recentlyCompleted.length} courses\n`;
      for (const c of p.recentlyCompleted.slice(0, 4)) {
        text += `    - ${c.content}\n`;
      }
    }
  }
  if (finished.length > 0) {
    text += `\nCROSSED THE FINISH LINE (${finished.length}/10):\n`;
    for (const p of finished) text += `  ✓ ${p.name}\n`;
  }
  if (partial.length > 0) {
    text += `\nIN PROGRESS (${partial.length}/10):\n`;
    for (const p of partial) text += `  ${p.name}: ${p.completedCount}/4 (${bar(Math.round((p.completedCount / 4) * 100), 16)})\n`;
  }
  if (stalled.length > 0) {
    text += `\nNOT YET STARTED (${stalled.length}/10) - the partnership is waiting on these names:\n`;
    for (const p of stalled) text += `  ✗ ${p.name}\n`;
  }
  text += `\nThis email auto-fires daily until we hit 40/40. Once we reach the goal, it shuts off.\n`;

  // --- HTML ---
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9">
<div style="max-width:680px;margin:0 auto;background:white;font-family:arial,sans-serif;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:white;padding:32px 28px;text-align:center">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#bfdbfe;font-weight:700">🚀 Anthropic Partner Network</div>
<div style="font-size:42px;font-weight:900;margin:6px 0 4px;color:white;line-height:1">${pctComplete}%</div>
<div style="font-size:14px;color:#cbd5e0">${totalCompleted} of 40 course completions</div>
<div style="margin:18px 0 0;background:rgba(255,255,255,0.15);border-radius:6px;height:14px;overflow:hidden"><div style="background:#10b981;height:100%;width:${pctComplete}%"></div></div>
<div style="margin-top:18px"><a href="https://app.basecamp.com/3945211/projects/47477101" style="display:inline-block;background:#fbbf24;color:#1c1917;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;letter-spacing:0.5px">Open Anthropic Partner Network in Basecamp &rarr;</a></div>
</div>

<div style="background:#fef3c7;border-bottom:1px solid #fde68a;padding:14px 28px;font-size:14px;color:#92400e;text-align:center">
<strong>⏰ ${daysLeft} days left</strong> to deadline 2026-06-12 - need <strong>${pace}/day</strong> to make it
</div>

<div style="padding:24px 28px">

${movers.length > 0 ? `
<h2 style="font-size:18px;color:#166534;margin:0 0 12px">🎉 Recent wins (last 7 days)</h2>
<div style="background:#dcfce7;border-left:4px solid #16a34a;padding:14px 18px;border-radius:4px;font-size:14px;margin-bottom:20px">
${movers.map(p => `<div style="margin:6px 0"><strong>${p.name}</strong>: ${p.recentlyCompleted.length} course${p.recentlyCompleted.length > 1 ? 's' : ''} this week 🔥</div>`).join('')}
</div>` : `
<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:14px 18px;border-radius:4px;font-size:14px;margin-bottom:20px;color:#991b1b">
<strong>⚠ Zero completions in the last 7 days.</strong> Nobody moved the needle. We need motion.
</div>`}

${finished.length > 0 ? `
<h2 style="font-size:18px;color:#166534;margin:0 0 12px">✅ Crossed the finish line (${finished.length}/10)</h2>
<div style="background:#f0fdf4;padding:14px 18px;border-radius:6px;margin-bottom:20px">
${finished.map(p => `<div style="margin:4px 0;font-weight:600;color:#166534">✓ ${p.name}</div>`).join('')}
</div>` : ''}

<h2 style="font-size:18px;color:#1a365d;margin:0 0 12px">📊 Full cohort standings</h2>
<table cellpadding="8" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #e2e8f0;margin-bottom:20px">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:10px">#</th><th align="left">Name</th><th align="left">Progress</th><th align="right">Done</th></tr>
${sortedByProgress.map((p, i) => {
  const pct = Math.round((p.completedCount / 4) * 100);
  const color = p.completedCount === 4 ? '#16a34a' : p.completedCount > 0 ? '#f59e0b' : '#dc2626';
  return `<tr style="background:${i % 2 === 0 ? '#f8fafc' : 'white'}"><td style="padding:8px;color:#64748b">${i + 1}</td><td><strong>${p.name}</strong></td><td>${progressBarHtml(pct, color)}</td><td align="right" style="font-weight:700;color:${color}">${p.completedCount}/4</td></tr>`;
}).join('')}
</table>

${stalled.length > 0 ? `
<h2 style="font-size:18px;color:#991b1b;margin:0 0 12px">🚨 Not yet started (${stalled.length}/10)</h2>
<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:14px 18px;border-radius:4px;font-size:14px;margin-bottom:20px">
<p style="margin:0 0 10px;color:#991b1b"><strong>The partnership is waiting on these names:</strong></p>
${stalled.map(p => `<div style="margin:4px 0;color:#7f1d1d">✗ <strong>${p.name}</strong> - <a href="${p.listUrl}" style="color:#dc2626">open course list →</a></div>`).join('')}
<p style="margin:10px 0 0;font-size:13px;color:#7f1d1d"><em>Each completion moves us 2.5% closer. Each day without movement is 2.5% slower.</em></p>
</div>` : ''}

<div style="background:#ebf4ff;border-left:4px solid #2b6cb0;padding:14px 18px;border-radius:4px;font-size:13px;color:#1e3a8a">
<strong>What this is:</strong> Colaberry's Anthropic Partner Network application requires 10 team members to complete the 4-course Anthropic Academy track (Agent Skills, Claude API, MCP intro, Claude Code in Action). 40 completions total unlocks the partnership status.
</div>

</div>

<div style="background:#f8fafc;padding:14px 28px;font-size:11px;color:#64748b;text-align:center;border-top:1px solid #e2e8f0">
Auto-fires daily until 40/40 reached, then shuts off. Weekly recap posts Mondays to the project Message Board.
</div>

</div>
</body></html>`;

  console.log(`Progress: ${totalCompleted}/40 (${pctComplete}%). Days left: ${daysLeft}. Movers: ${movers.length}. Stalled: ${stalled.length}.`);

  // SHUTOFF: if we hit 40/40 stop sending
  if (totalCompleted >= 40) {
    console.log('GOAL REACHED. Skipping email send. Report can be archived.');
    return;
  }

  // --- EMAIL TO ALI ---
  if (!NO_EMAIL) {
    if (!process.env.MANDRILL_API_KEY) { console.error('MANDRILL_API_KEY required'); process.exit(1); }
    validateBeforeSend(html, text);
    const transport = nodemailer.createTransport({
      host: 'smtp.mandrillapp.com', port: 587,
      auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
    });
    const r = await transport.sendMail({
      from: '"Ali Muwwakkil" <ali@colaberry.com>',
      to: 'ali@colaberry.com',
      cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com'],
      subject: `[Daily Report] 🚀 Anthropic Partner Network: ${pctComplete}% (${totalCompleted}/40) · ${daysLeft} days left`,
      text,
      html,
      headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': 'high', 'X-Priority': '1' },
    });
    console.log('Sent email:', r.messageId);
  } else {
    console.log('--no-email: skipped email send');
  }

  // --- MESSAGE BOARD POST (persistent thread, daily comment) ---
  if (POST_MESSAGE_BOARD) {
    // Resolve message board ID once
    const proj = await bcGet('.json');
    const mb = proj.dock.find(d => d.name === 'message_board');
    if (!mb) { console.error('No message_board in project dock'); return; }

    // Read or create parent thread
    let state = null;
    if (fs.existsSync(MB_STATE_PATH)) {
      try { state = JSON.parse(fs.readFileSync(MB_STATE_PATH, 'utf8')); } catch (e) { state = null; }
    }

    if (!state || !state.threadId) {
      // First run: create the parent thread with an intro (no daily data — that lands in comments)
      const introHtml = `<div>
<p><strong>What this thread is:</strong> Colaberry's Anthropic Partner Network application requires <strong>10 team members</strong> to complete the <strong>4-course Anthropic Academy track</strong> (Agent Skills, Claude API, MCP intro, Claude Code in Action). 40 completions total unlocks partner status.</p>
<p>Every weekday at ~11 AM CT a fresh countdown will land as a comment on this thread: progress %, days left, pace required, recent wins, who's crossed the finish line, and who hasn't started yet. Same content Ali gets via email.</p>
<p><strong>Deadline:</strong> 2026-06-12 &middot; <strong>Goal:</strong> 40/40 course completions &middot; <strong>Shut-off:</strong> auto-stops once we hit 40/40.</p>
<p>Open your own course list to check off completions: <a href="https://app.basecamp.com/3945211/projects/47477101">Anthropic Partner Network project</a>.</p>
</div>`;
      const subject = '📊 Anthropic Partner Network — Daily Countdown (one thread, daily comments)';
      const cr = await fetch(`${BASE}/message_boards/${mb.id}/messages.json`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ subject, content: introHtml, status: 'active' })
      });
      if (!cr.ok) { console.error('Parent thread create failed:', cr.status, await cr.text()); return; }
      const parent = await cr.json();
      state = { threadId: parent.id, threadUrl: parent.app_url, createdAt: new Date().toISOString() };
      try { fs.mkdirSync(path.dirname(MB_STATE_PATH), { recursive: true }); } catch (e) {}
      fs.writeFileSync(MB_STATE_PATH, JSON.stringify(state, null, 2));
      console.log('Created parent thread:', parent.id, parent.app_url);
    }

    // Post today's countdown as a comment on the parent thread
    const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const commentHtml = `<div><div><strong>${today} &middot; ${pctComplete}% (${totalCompleted}/40) &middot; ${daysLeft} days left &middot; need ${pace}/day</strong></div></div>${html}`;
    const ccr = await fetch(`${BASE}/recordings/${state.threadId}/comments.json`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ content: commentHtml })
    });
    if (ccr.ok) {
      const cmt = await ccr.json();
      console.log('Posted daily comment:', cmt.id, cmt.app_url);
    } else {
      console.error('Comment POST failed:', ccr.status, await ccr.text());
    }
  } else {
    console.log('--no-mb: skipped Message Board post');
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
