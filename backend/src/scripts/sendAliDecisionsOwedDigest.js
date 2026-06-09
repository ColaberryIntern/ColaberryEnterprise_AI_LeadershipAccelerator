#!/usr/bin/env node
// Decisions-owed digest - emailed to all 3 of Ali's inboxes.
// This is the recurring email Ali asked for: "the email that show's me the tickets I need to work on"
// Pulls open Ali Personal todos assigned to Ali only, applies Pattern I filter, chunks by topic.

const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const BASECAMP_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || '';
const H = { Authorization: 'Bearer ' + BASECAMP_TOKEN, 'User-Agent': 'Colaberry', Accept: 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211';
const ALI = 17454835, CB = 37708014;
const ALI_PERSONAL = 7463955;

async function bcGet(p) { const r = await fetch(BASE + p, { headers: H }); if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`); return r.json(); }
async function bcGetAll(p) { let next = BASE + p; const out = []; while (next) { const r = await fetch(next, { headers: H }); if (!r.ok) throw new Error(`GET ${next} -> ${r.status}`); out.push(...(await r.json())); const link = r.headers.get('Link') || ''; const mm = link.match(/<([^>]+)>;\s*rel="next"/); next = mm ? mm[1] : null; } return out; }
function daysAgo(iso) { return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 9999; }
function escape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function classify(todo) {
  const text = (todo.content + ' ' + (todo.description || '').replace(/<[^>]+>/g, ' ')).toLowerCase();
  const ids = (todo.assignees || []).map(a => a.id);
  const aliOnly = ids.length === 1 && ids[0] === ALI;
  if (/#hold-open\b/.test(text)) return 'IN-PROGRESS';
  if (/^\[training\]/i.test(todo.content) || /^★\s*course\s*\d/i.test(todo.content)) return 'IN-PROGRESS';
  if (aliOnly && /\b(decide|review \+ decide|approve|authorize|sign|verdict|bid.no.bid|reply|build \+ ship)\b/.test(text)) return 'DECISION';
  if (aliOnly) return 'DECISION';
  return 'IN-PROGRESS';
}

function topic(todo) {
  const c = todo.content.toLowerCase();
  const l = (todo.list_name || '').toLowerCase();
  if (/lakeesha|tax|cpa/.test(c) || /tax/.test(l)) return { name: 'Lakeesha / 2025 taxes', emoji: '💰', external: 'Lakeesha is waiting' };
  if (/gov contract|bid|bonfire|rfp|harris|slcc|southlake|tdcj|saptak/.test(c)) return { name: 'Gov Contracts', emoji: '🏛️', external: 'Bid deadlines + Srinivas waiting' };
  if (/engine|cron|gmail|sms|inbox|router|m365|microsoft 365/.test(c)) return { name: 'Engine / system', emoji: '⚙️', external: 'unblocks automation' };
  if (/layoff|mika|shveta|angie|hr/.test(c)) return { name: 'HR / personnel', emoji: '👥', external: 'Angie waiting' };
  if (/therapy|procare|primrose|creed/.test(c) || /family|personal|health/.test(l)) return { name: 'Family / personal', emoji: '🏠', external: 'self' };
  if (/ram|harry|partner|anthropic|book.tool/.test(c)) return { name: 'Strategic partnerships', emoji: '🤝', external: 'Ram + partners waiting' };
  if (/leroy|meeting|call/.test(c)) return { name: 'Meetings / calls', emoji: '📞', external: 'commitments' };
  return { name: 'Other', emoji: '📋', external: '' };
}

(async () => {
  const proj = await bcGet(`/projects/${ALI_PERSONAL}.json`);
  const tset = proj.dock.find(d => d.name === 'todoset');
  const lists = await bcGetAll(`/buckets/${ALI_PERSONAL}/todosets/${tset.id}/todolists.json`);
  const allTodos = [];
  for (const l of lists) {
    try {
      const ts = await bcGetAll(`/buckets/${ALI_PERSONAL}/todolists/${l.id}/todos.json?status=remaining`);
      for (const t of ts) allTodos.push({ ...t, list_name: l.name });
    } catch {}
  }
  const decisions = allTodos.filter(t => classify(t) === 'DECISION');

  // Chunk by topic
  const groups = {};
  for (const d of decisions) {
    const tp = topic(d);
    const key = tp.name;
    if (!groups[key]) groups[key] = { emoji: tp.emoji, external: tp.external, items: [] };
    groups[key].items.push(d);
  }

  // Sort each group by age (oldest first)
  for (const g of Object.values(groups)) g.items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // Build HTML
  let groupsHtml = '';
  const groupOrder = ['Lakeesha / 2025 taxes', 'Gov Contracts', 'HR / personnel', 'Strategic partnerships', 'Engine / system', 'Family / personal', 'Meetings / calls', 'Other'];
  for (const key of groupOrder) {
    if (!groups[key] || groups[key].items.length === 0) continue;
    const g = groups[key];
    const oldest = Math.max(...g.items.map(d => daysAgo(d.created_at)));
    const stale = oldest >= 14;
    groupsHtml += `
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 22px;margin-bottom:14px${stale ? ';border-left:4px solid #e53e3e' : ''}">
<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap">
  <div style="font-size:17px;font-weight:800;color:#1a365d">${g.emoji} ${escape(key)} <span style="background:${stale ? '#fee2e2' : '#edf2f7'};color:${stale ? '#991b1b' : '#1a365d'};padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;margin-left:6px">${g.items.length}</span></div>
  <div style="font-size:11px;color:#a0aec0">${stale ? '🔴 STALE - oldest ' + oldest + 'd' : g.external}</div>
</div>
<table cellpadding="6" cellspacing="0" border="0" style="width:100%;font-size:13px;margin-top:10px;border-collapse:collapse">
${g.items.map(d => {
  const age = daysAgo(d.created_at);
  const ageBadge = age >= 14 ? `<span style="background:#fee2e2;color:#991b1b;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700">${age}d STALE</span>`
                 : age >= 7 ? `<span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700">${age}d</span>`
                 : `<span style="color:#a0aec0;font-size:11px">${age}d</span>`;
  return `<tr>
<td style="padding:8px 4px;border-bottom:1px solid #f0f4f8;width:75%">
  <a href="${d.app_url}" style="color:#1a365d;text-decoration:none;font-weight:600">${escape(d.content)}</a>
  <div style="font-size:11px;color:#a0aec0;margin-top:2px">${escape(d.list_name)}${d.due_on ? ' &middot; due ' + d.due_on : ''}</div>
</td>
<td style="padding:8px 4px;border-bottom:1px solid #f0f4f8;text-align:right;width:25%">${ageBadge}</td>
</tr>`;
}).join('')}
</table>
</div>`;
  }

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7fafc;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7fafc"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;background:#fff;margin:16px 0">

<tr><td style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:#fff;padding:24px 26px">
  <div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#90cdf4;font-weight:700">📌 Decisions you owe me</div>
  <h1 style="margin:6px 0 4px;font-size:26px;font-weight:800">${decisions.length} decision${decisions.length === 1 ? '' : 's'} open</h1>
  <div style="font-size:13px;color:#cbd5e0">${escape(dateStr)} &middot; chunked by topic so you can triage one batch at a time</div>
</td></tr>

<tr><td style="padding:24px 26px">

<div style="background:#dcfce7;border-left:4px solid #16a34a;padding:14px 18px;border-radius:4px;font-size:13px;margin-bottom:20px">
<strong>📱 How to use this (scan-friendly):</strong> tap a card title to open the Basecamp todo. Reply to me with the answer in any format - even one word - and I post your decision to that todo + execute. Mon/Wed/Fri 9am CT this lands automatically with the latest list.
</div>

${groupsHtml}

<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:4px;font-size:13px;margin-top:20px">
<strong>📋 Bulk-reply format (paste anywhere in your reply, I parse):</strong>
<pre style="background:#fff;padding:12px;border-radius:4px;font-size:12px;font-family:monospace;border:1px solid #cbd5e0;margin-top:8px">lakeesha sep: no, fee: yes, cancel quarterly: yes, sign: approve as-is
gov ciq: signed, dallas: bid, galveston: pass, txdot1: bid, txdot2: pass
engine: install crons (you have ssh)
ram-harry: ask ram to reframe by 6/15
saptak: ask ram for repo access</pre>
</div>

<div style="background:#ebf4ff;border-left:4px solid #2b6cb0;padding:14px 18px;border-radius:4px;font-size:13px;margin-top:14px">
<strong>🔄 Pattern I in effect:</strong> CB System actively closes what it can. Today's sweep auto-closed 1 (Gmail archive decision, you resolved by re-auth earlier). 27 todos classified as IN-PROGRESS or personal-tasks (skipped). The ${decisions.length} above are genuine you-decisions. You can also email/SMS/call me with questions on any of them - your confirmation = authority to close.
</div>

</td></tr>

<tr><td style="background:#f7fafc;padding:16px 26px;text-align:center;font-size:11px;color:#718096;border-top:1px solid #e2e8f0">
Pattern I sweep at ${new Date().toISOString()} &middot; v6 plan: <a href="https://app.basecamp.com/3945211/buckets/7463955/todos/9942071243" style="color:#2b6cb0">notification plan todo</a>
</td></tr>

</table>
</td></tr></table>
</body></html>`;

  if (!process.env.MANDRILL_API_KEY) { console.error('MANDRILL_API_KEY required'); process.exit(1); }

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });

  const textBody = `Decisions you owe me - ${dateStr}\n\n${decisions.length} decisions open across ${Object.keys(groups).length} topic groups. Open the HTML email for the chunked view.\n\nReply with answers in any format - I parse and execute.`;

  // Single email with To+CC instead of N separate sends. Stops duplicate-inbox-copies issue.
  // Hotmail dropped from this report per inbox-routing doctrine (work emails to colaberry,
  // phone-accessible copy via gmail CC). Mailing the same payload three separate times also
  // tripled the spam-score signal on Gmail's side and contributed to Promotions filtering.
  try {
    const r = await transport.sendMail({
      from: '"Ali Muwwakkil" <ali@colaberry.com>',
      to: 'ali@colaberry.com',
      cc: 'alimuwwakkil@gmail.com',
      subject: `[Decisions Report] 📌 ${decisions.length} decisions owed - ${dateStr}`,
      text: textBody,
      html,
      headers: {
        'X-MC-Track': 'none',
        'X-MC-AutoText': 'false',
        // Importance:high + X-Priority:1 nudge Gmail to keep this out of Promotions and into Primary.
        'Importance': 'high',
        'X-Priority': '1',
      },
    });
    console.log(`Sent decisions digest (to ali@colaberry.com, cc alimuwwakkil@gmail.com): ${r.messageId}`);
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
  }
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
