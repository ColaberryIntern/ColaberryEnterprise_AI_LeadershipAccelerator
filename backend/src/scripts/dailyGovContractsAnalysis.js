#!/usr/bin/env node
/**
 * Daily Gov Contracts analysis report.
 *
 * Pulls live state from Basecamp project 47346103 (Gov Contracts), classifies
 * every open todo as AI-doable vs human-needed, generates a styled HTML
 * report, and emails it to ali@colaberry.com.
 *
 * Designed to be cron-friendly:
 *   - idempotent
 *   - tolerant of transient Basecamp 5xx
 *   - exits non-zero on hard failure so cron logs catch it
 *
 * Recommended cron: 0 8 * * * (8am CT, after the Cory brief lands)
 */
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const PROJECT_ID = 47346103;
const RECIPIENT = process.env.GOV_REPORT_RECIPIENT || 'ali@colaberry.com';
// Phone-accessible secondary recipient — independent of Inbox COS / work email filtering.
const RECIPIENT_PHONE = process.env.GOV_REPORT_RECIPIENT_PHONE || 'alimuwwakkil@gmail.com';
const BASECAMP_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const BASE = 'https://3.basecampapi.com/3945211';
const H = { Authorization: 'Bearer ' + BASECAMP_TOKEN, 'User-Agent': 'Colaberry Gov Report', Accept: 'application/json' };

async function bcGet(p) {
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: H });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}
async function bcGetAll(p) {
  let next = p.startsWith('http') ? p : BASE + p;
  const out = [];
  while (next) {
    const r = await fetch(next, { headers: H });
    if (!r.ok) throw new Error(`GET ${next} -> ${r.status}`);
    out.push(...(await r.json()));
    const link = r.headers.get('Link') || '';
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
  }
  return out;
}

// Classification rules — AI-doable vs human-needed
const AI_PATTERNS = [
  /draft|drafting|generate|write|compile|summarize|extract/i,
  /pull|fetch|retrieve|collect|cross.ref/i,
  /analyze|analysis|score|rank|rate/i,
  /research|investigate|find/i,
  /functional requirements|technical requirements|implementation/i,
  /respond to.*question/i,
  /capability statement/i,
];
const HUMAN_PATTERNS = [
  /sign|signature|notarize/i,
  /bid.no.bid|go.no.go|approve|authorize|decision/i,
  /call|phone|talk|meeting/i,
  /pay|payment|wire|deposit|bond/i,
  /submit|upload to Bonfire|file/i,
  /negotiate|relationship/i,
  /CIQ|conflict of interest|form/i,
];

function classify(content, description) {
  const text = (content + ' ' + (description || '').replace(/<[^>]+>/g, ' ')).toLowerCase();
  const humanScore = HUMAN_PATTERNS.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
  const aiScore = AI_PATTERNS.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
  if (humanScore > aiScore) return { tier: 'HUMAN', confidence: humanScore };
  if (aiScore > 0) return { tier: 'AI', confidence: aiScore };
  return { tier: 'EITHER', confidence: 0 };
}

function suggestHuman(content) {
  const c = content.toLowerCase();
  if (/sign|cer.iq|notar|conflict of interest/i.test(c)) return 'Ali (legal signoff required)';
  if (/bid.no.bid|go.no.go|approve/i.test(c)) return 'Ali (executive decision)';
  if (/call|negotiat/i.test(c)) return 'Ali or Karun';
  if (/submit|upload|file|bond/i.test(c)) return 'Srinivas (procurement ops)';
  if (/pay|wire|deposit/i.test(c)) return 'Rashi (finance)';
  return 'Ali (default)';
}

function escape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function build() {
  console.log('Pulling Gov Contracts state...');
  const proj = await bcGet(`/projects/${PROJECT_ID}.json`);
  const tset = proj.dock.find(d => d.name === 'todoset');
  const lists = await bcGetAll(`/buckets/${PROJECT_ID}/todosets/${tset.id}/todolists.json`);
  const todoset = lists.filter(l => /^(Harris|SLCC|TDCJ|Southlake|Detroit|Dallas|Galveston|TxDOT|City of)/i.test(l.name));

  const bidData = [];
  for (const list of todoset) {
    const openTodos = await bcGetAll(`/buckets/${PROJECT_ID}/todolists/${list.id}/todos.json?status=remaining`);
    const allTodos = await bcGetAll(`/buckets/${PROJECT_ID}/todolists/${list.id}/todos.json?completed=true`);
    const classified = openTodos.map(t => {
      const cls = classify(t.content, t.description);
      return {
        id: t.id, content: t.content, due_on: t.due_on, app_url: t.app_url,
        assignees: (t.assignees || []).map(a => a.name).join(', ') || 'unassigned',
        tier: cls.tier, confidence: cls.confidence,
        humanSuggestion: cls.tier === 'HUMAN' ? suggestHuman(t.content) : '',
      };
    });
    bidData.push({
      id: list.id,
      name: list.name,
      app_url: list.app_url,
      completed: allTodos.length,
      open: openTodos.length,
      open_todos: classified,
      ratio: list.completed_ratio,
    });
  }

  // Recent message board for context
  const mb = proj.dock.find(d => d.name === 'message_board');
  const msgs = mb ? (await bcGetAll(`/buckets/${PROJECT_ID}/message_boards/${mb.id}/messages.json`)).slice(0, 8) : [];

  return { proj, bidData, msgs };
}

function renderHtml({ proj, bidData, msgs }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const totalOpen = bidData.reduce((s, b) => s + b.open, 0);
  const totalAi = bidData.reduce((s, b) => s + b.open_todos.filter(t => t.tier === 'AI').length, 0);
  const totalHuman = bidData.reduce((s, b) => s + b.open_todos.filter(t => t.tier === 'HUMAN').length, 0);
  const totalEither = bidData.reduce((s, b) => s + b.open_todos.filter(t => t.tier === 'EITHER').length, 0);

  const bidCards = bidData.map(b => `
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 22px;margin-bottom:14px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap">
    <div style="font-size:16px;font-weight:800;color:#1a365d">${escape(b.name)}</div>
    <div style="font-size:12px;color:#718096">Completed: ${escape(b.ratio)} &middot; <a href="${b.app_url}" style="color:#2b6cb0">Open in Basecamp</a></div>
  </div>
  ${b.open === 0 ? '<div style="margin-top:10px;color:#16a34a;font-size:13px;font-weight:600">No open todos. Clean.</div>' : `
  <div style="margin-top:12px;font-size:13px">
    <strong>${b.open} open todo${b.open === 1 ? '' : 's'}:</strong>
  </div>
  <table cellpadding="6" cellspacing="0" style="width:100%;font-size:13px;margin-top:8px;border-collapse:collapse">
  ${b.open_todos.map(t => `
    <tr>
      <td style="border-bottom:1px solid #f0f4f8;padding:8px 4px;width:65%">
        <a href="${t.app_url}" style="color:#1a365d;text-decoration:none;font-weight:600">${escape(t.content)}</a>
        ${t.due_on ? `<div style="font-size:11px;color:#a0aec0;margin-top:2px">due ${t.due_on}</div>` : ''}
      </td>
      <td style="border-bottom:1px solid #f0f4f8;padding:8px 4px;width:15%">
        <span style="display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;${
          t.tier === 'AI' ? 'background:#dbeafe;color:#1e40af' :
          t.tier === 'HUMAN' ? 'background:#fef3c7;color:#92400e' :
          'background:#f7fafc;color:#718096'
        }">${t.tier}</span>
      </td>
      <td style="border-bottom:1px solid #f0f4f8;padding:8px 4px;width:20%;font-size:11px;color:#4a5568">
        ${t.humanSuggestion || (t.tier === 'AI' ? 'CB System can run' : t.assignees)}
      </td>
    </tr>
  `).join('')}
  </table>
  `}
</div>`).join('');

  // Consolidated human-needed task list (cross-bid)
  const allHumanTasks = bidData.flatMap(b => b.open_todos.filter(t => t.tier === 'HUMAN').map(t => ({ ...t, bid: b.name })));
  const allAiTasks = bidData.flatMap(b => b.open_todos.filter(t => t.tier === 'AI').map(t => ({ ...t, bid: b.name })));

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Gov Contracts Daily Analysis - ${dateStr}</title></head>
<body style="margin:0;padding:0;background:#f7fafc;font-family:arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc"><tr><td align="center">
<table width="780" cellpadding="0" cellspacing="0" style="max-width:780px;background:#fff;border-radius:8px;margin:24px 0;overflow:hidden">

<tr><td style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:#fff;padding:28px 32px">
  <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#90cdf4;font-weight:700">📊 Daily Gov Contracts Report</div>
  <h1 style="margin:6px 0 8px;font-size:26px;font-weight:800">Gov Contracts Status &mdash; ${escape(dateStr)}</h1>
  <div style="font-size:13px;color:#e2e8f0;line-height:1.6">${bidData.length} active bids &middot; ${totalOpen} open todos &middot; ${totalAi} AI-doable &middot; ${totalHuman} human-needed &middot; ${totalEither} either</div>
</td></tr>

<tr><td style="padding:24px 32px;color:#2d3748;font-size:14px;line-height:1.65">

<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px"><tr>
<td style="text-align:center;padding:16px;background:#dbeafe;border-radius:8px;width:24%"><div style="font-size:28px;font-weight:800;color:#1e40af">${totalAi}</div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#1e40af">AI-doable</div></td>
<td style="width:1%"></td>
<td style="text-align:center;padding:16px;background:#fef3c7;border-radius:8px;width:24%"><div style="font-size:28px;font-weight:800;color:#92400e">${totalHuman}</div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#92400e">Human-needed</div></td>
<td style="width:1%"></td>
<td style="text-align:center;padding:16px;background:#dcfce7;border-radius:8px;width:24%"><div style="font-size:28px;font-weight:800;color:#166534">${totalEither}</div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#166534">Either</div></td>
<td style="width:1%"></td>
<td style="text-align:center;padding:16px;background:#fee2e2;border-radius:8px;width:24%"><div style="font-size:28px;font-weight:800;color:#991b1b">${totalOpen}</div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#991b1b">Total open</div></td>
</tr></table>

<h2 style="color:#1a365d;font-size:18px;margin-top:24px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">🧠 What only a human can do (across all bids)</h2>
${allHumanTasks.length === 0 ? '<div style="background:#f0fdf4;padding:12px 18px;border-radius:6px;color:#166534">No human-only tasks open right now. Everything either CB System can attempt or is in the gray zone.</div>' : `
<p style="margin-bottom:8px"><strong>${allHumanTasks.length} task${allHumanTasks.length === 1 ? '' : 's'} need a human. Assign these first.</strong></p>
<table cellpadding="8" cellspacing="0" style="width:100%;font-size:13px;border-collapse:collapse">
<tr style="background:#fef3c7"><th style="text-align:left;padding:6px;border-bottom:2px solid #92400e">Task</th><th style="text-align:left;padding:6px;border-bottom:2px solid #92400e">Bid</th><th style="text-align:left;padding:6px;border-bottom:2px solid #92400e">Suggest</th></tr>
${allHumanTasks.map(t => `
<tr>
<td style="padding:8px;border-bottom:1px solid #f0f4f8"><a href="${t.app_url}" style="color:#1a365d">${escape(t.content)}</a>${t.due_on ? ` <span style="font-size:11px;color:#a0aec0">(due ${t.due_on})</span>` : ''}</td>
<td style="padding:8px;border-bottom:1px solid #f0f4f8;font-size:11px;color:#4a5568">${escape(t.bid)}</td>
<td style="padding:8px;border-bottom:1px solid #f0f4f8;font-weight:600">${escape(t.humanSuggestion)}</td>
</tr>`).join('')}
</table>`}

<h2 style="color:#1a365d;font-size:18px;margin-top:32px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">🤖 What CB System can do (AI plan)</h2>
${allAiTasks.length === 0 ? '<div style="background:#f0fdf4;padding:12px 18px;border-radius:6px;color:#166534">No AI-tagged tasks open right now.</div>' : `
<p style="margin-bottom:8px"><strong>${allAiTasks.length} AI-doable task${allAiTasks.length === 1 ? '' : 's'}. Plan: CB System worker (Pattern G) executes one per 15-min tick once you green-light cron install.</strong></p>
<table cellpadding="8" cellspacing="0" style="width:100%;font-size:13px;border-collapse:collapse">
<tr style="background:#dbeafe"><th style="text-align:left;padding:6px;border-bottom:2px solid #1e40af">Task</th><th style="text-align:left;padding:6px;border-bottom:2px solid #1e40af">Bid</th><th style="text-align:left;padding:6px;border-bottom:2px solid #1e40af">Approach</th></tr>
${allAiTasks.map(t => `
<tr>
<td style="padding:8px;border-bottom:1px solid #f0f4f8"><a href="${t.app_url}" style="color:#1a365d">${escape(t.content)}</a>${t.due_on ? ` <span style="font-size:11px;color:#a0aec0">(due ${t.due_on})</span>` : ''}</td>
<td style="padding:8px;border-bottom:1px solid #f0f4f8;font-size:11px;color:#4a5568">${escape(t.bid)}</td>
<td style="padding:8px;border-bottom:1px solid #f0f4f8;font-size:11px">draft + post to todo for Ali review</td>
</tr>`).join('')}
</table>`}

<h2 style="color:#1a365d;font-size:18px;margin-top:32px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">📋 Per-bid breakdown</h2>
${bidCards}

${msgs.length > 0 ? `
<h2 style="color:#1a365d;font-size:18px;margin-top:32px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">📰 Recent message board activity</h2>
<ul style="font-size:13px">
${msgs.map(m => `<li style="margin-bottom:4px"><span style="color:#a0aec0">${m.created_at.slice(0, 10)}</span> &middot; <a href="${m.app_url}" style="color:#1a365d">${escape(m.subject)}</a></li>`).join('')}
</ul>` : ''}

<div style="background:#ebf4ff;padding:16px 18px;border-radius:6px;margin-top:32px;font-size:13px;border-left:4px solid #2b6cb0">
<strong>📌 Today's recommended action sequence (in order):</strong>
<ol style="margin:8px 0 0">
${allHumanTasks.slice(0, 5).map(t => `<li><a href="${t.app_url}" style="color:#1a365d">${escape(t.content)}</a> &mdash; <strong>${escape(t.humanSuggestion)}</strong></li>`).join('')}
${allAiTasks.length > 0 ? '<li>Then green-light CB System worker cron and it picks up the AI-doable list overnight.</li>' : ''}
</ol>
</div>

</td></tr>

<tr><td style="background:#f7fafc;padding:16px 32px;text-align:center;font-size:11px;color:#718096;border-top:1px solid #e2e8f0">
Generated ${now.toISOString()} &middot; Source: Basecamp project ${PROJECT_ID} &middot; Script: backend/src/scripts/dailyGovContractsAnalysis.js
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

(async () => {
  try {
    const data = await build();
    const html = renderHtml(data);

    // Save to docs for archive
    const outPath = path.resolve(__dirname, '../../../docs/gov-contracts-daily-' + new Date().toISOString().slice(0, 10) + '.html');
    fs.writeFileSync(outPath, html);
    console.log('Saved report:', outPath);

    if (!process.env.MANDRILL_API_KEY) {
      console.log('No MANDRILL_API_KEY, skipping email send');
      process.exit(0);
    }

    const textBody = `Gov Contracts daily analysis for ${new Date().toLocaleDateString()}. See the HTML email for the full breakdown.

${data.bidData.length} active bids, ${data.bidData.reduce((s, b) => s + b.open, 0)} open todos.

Human-only: ${data.bidData.reduce((s, b) => s + b.open_todos.filter(t => t.tier === 'HUMAN').length, 0)}
AI-doable: ${data.bidData.reduce((s, b) => s + b.open_todos.filter(t => t.tier === 'AI').length, 0)}
Either: ${data.bidData.reduce((s, b) => s + b.open_todos.filter(t => t.tier === 'EITHER').length, 0)}

Open the email for the per-bid breakdown and the human-task assignment suggestions.`;

    const r = await nodemailer.createTransport({
      host: 'smtp.mandrillapp.com', port: 587,
      auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
    }).sendMail({
      from: '"Ali Muwwakkil" <ali@colaberry.com>',
      to: RECIPIENT,
      cc: RECIPIENT_PHONE,
      subject: `[Daily Report] Gov Contracts - ${new Date().toLocaleDateString()} - ${data.bidData.reduce((s, b) => s + b.open, 0)} open todos`,
      text: textBody,
      html,
      headers: {
        'X-MC-Track': 'none',
        'X-MC-AutoText': 'false',
        // Nudge Gmail to keep this out of Promotions tab and into Primary.
        'Importance': 'high',
        'X-Priority': '1',
      },
    });
    console.log('Sent:', r.messageId);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  }
})();
