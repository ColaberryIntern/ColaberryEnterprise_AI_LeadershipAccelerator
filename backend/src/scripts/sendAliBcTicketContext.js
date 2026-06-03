#!/usr/bin/env node
/**
 * sendAliBcTicketContext.js
 *
 * Pulls the full ticket + every comment + linked context for a BC todo
 * and renders it as a readable HTML doc emailed to Ali. So he can read
 * the source material the contextual v2 saw, side-by-side with the v2
 * output.
 *
 * Usage:
 *   node backend/src/scripts/sendAliBcTicketContext.js --bc-id 9942229201 --bucket 7463955
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const ARGS = process.argv.slice(2);
const FLAG_VAL = (n) => { const i = ARGS.indexOf(n); return i >= 0 && i + 1 < ARGS.length ? ARGS[i + 1] : null; };
const BC_ID = FLAG_VAL('--bc-id') || '9942229201';
const BUCKET_ID = FLAG_VAL('--bucket') || '7463955';
const REPORT_TICKET = FLAG_VAL('--report-on') || '9953889114';

async function bcGet(urlOrPath) {
  const token = process.env.BASECAMP_ACCESS_TOKEN.replace(/^Bearer /, '');
  const account = process.env.BASECAMP_ACCOUNT_ID || '3945211';
  const base = `https://3.basecampapi.com/${account}`;
  const u = urlOrPath.startsWith('http') ? urlOrPath : `${base}${urlOrPath}`;
  const r = await fetch(u, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Colaberry BC Context Reader',
      Accept: 'application/json',
    },
  });
  if (!r.ok) throw new Error(`BC ${u} -> ${r.status}`);
  return r.json();
}

async function bcGetAllPages(urlOrPath) {
  const acc = [];
  for (let page = 1; page < 50; page++) {
    const sep = urlOrPath.includes('?') ? '&' : '?';
    const u = `${urlOrPath}${sep}page=${page}`;
    const data = await bcGet(u);
    if (!Array.isArray(data) || data.length === 0) break;
    acc.push(...data);
    if (data.length < 15) break;
  }
  return acc;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function htmlToPlainPreserve(html) {
  // Strip script/style + convert <br>, <p>, <li> to line breaks; keep paragraph structure.
  return String(html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(li|ol|ul)>/gi, '\n')
    .replace(/<bc-attachment[^>]*caption="([^"]*)"[^>]*>[\s\S]*?<\/bc-attachment>/gi, '\n[Attachment: $1]\n')
    .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '[Image: $1]')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function senderChipStyle(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('ali')) return { bg: '#1a365d', fg: 'white' };
  if (n.includes('ram')) return { bg: '#7c2d12', fg: 'white' };
  if (n.includes('karun')) return { bg: '#0c4a6e', fg: 'white' };
  if (n.includes('david')) return { bg: '#14532d', fg: 'white' };
  if (n.includes('cb system')) return { bg: '#0b1220', fg: '#fbbf24' };
  return { bg: '#475569', fg: 'white' };
}

(async () => {
  console.log(`[ctx] fetching todo + comments for bc_id=${BC_ID}`);
  const todo = await bcGet(`/buckets/${BUCKET_ID}/todos/${BC_ID}.json`);
  const comments = await bcGetAllPages(`/buckets/${BUCKET_ID}/recordings/${BC_ID}/comments.json`);
  console.log(`[ctx] ${comments.length} comments pulled`);

  // Sort oldest -> newest for chronological reading
  comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const commentBlocks = comments.map((c, i) => {
    const senderName = c.creator?.name || 'Unknown';
    const chip = senderChipStyle(senderName);
    const ts = new Date(c.created_at).toLocaleString('en-US', { timeZone: 'America/Chicago' });
    const plain = htmlToPlainPreserve(c.content || '');
    const truncated = plain.length > 8000;
    const display = truncated ? plain.slice(0, 8000) + `\n\n[...${plain.length - 8000} more characters truncated in this view; full body lives on the BC ticket...]` : plain;
    return `
<div style="margin:14px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:white">
<div style="background:#f8fafc;padding:8px 14px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;font-size:12px">
<div><span style="background:${chip.bg};color:${chip.fg};padding:3px 9px;border-radius:4px;font-weight:700;letter-spacing:0.5px;font-size:11px">${escapeHtml(senderName)}</span> <span style="color:#475569;margin-left:6px">#${i + 1} of ${comments.length}</span></div>
<div style="color:#475569">${escapeHtml(ts)}</div>
</div>
<div style="padding:12px 16px;white-space:pre-wrap;word-break:break-word;font-family:Menlo,Consolas,monospace;font-size:12.5px;line-height:1.55;color:#1f2937;background:#fafafa">${escapeHtml(display)}</div>
</div>`;
  }).join('');

  const todoDescPlain = htmlToPlainPreserve(todo.description || todo.content || '(no description)');

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:900px;margin:0 auto;background:white">

<div style="background:linear-gradient(135deg,#0b1220 0%,#1d3a8a 100%);color:white;padding:28px 32px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Basecamp ticket source · for context-reading</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">${escapeHtml(todo.title)}</h1>
<div style="font-size:13px;color:#cbd5e0">
todo id <code>${escapeHtml(String(todo.id))}</code> ·
${comments.length} comment${comments.length === 1 ? '' : 's'} ·
${todo.due_on ? 'due ' + escapeHtml(todo.due_on) : 'no due date'} ·
${todo.completed ? '<span style="color:#5cd9a3;font-weight:700">COMPLETED</span>' : '<span style="color:#fbbf24;font-weight:700">ACTIVE</span>'}
</div>
<div style="margin-top:8px;font-size:13px"><a href="${escapeHtml(todo.app_url || '')}" style="color:#fbbf24">Open on Basecamp &rarr;</a></div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:16px;margin:0 0 8px;color:#0f172a">Ticket description</h2>
<div style="background:#fafafa;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;white-space:pre-wrap;word-break:break-word;font-family:Menlo,Consolas,monospace;font-size:12.5px;line-height:1.55;color:#1f2937">${escapeHtml(todoDescPlain)}</div>

<h2 style="font-size:16px;margin:24px 0 8px;color:#0f172a">Comments (oldest first)</h2>
<div style="font-size:12px;color:#475569;margin-bottom:4px">Plaintext-stripped from BC HTML. Attachments shown as <code>[Attachment: filename]</code>. Long comments truncated at 8000 chars with a marker.</div>
${commentBlocks || '<div style="color:#475569;padding:14px;text-align:center;font-style:italic">No comments yet.</div>'}

</div>

<div style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#475569">
Source material for Contextual Suggestion v2 worked example. Read this alongside the earlier comparison email to see the diff.
</div>

</div></body></html>`;

  const outPath = path.resolve(__dirname, `../../../docs/bc-ticket-context-${BC_ID}-2026-06-03.html`);
  fs.writeFileSync(outPath, html);
  console.log(`[ctx] wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);

  const teaserHtml = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:720px;margin:0 auto;background:white">
<div style="background:#0f172a;color:white;padding:20px 28px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">BC ticket source attached</div>
<h1 style="margin:6px 0;font-size:18px;line-height:1.3">${escapeHtml(todo.title)}</h1>
</div>
<div style="padding:20px 28px">
<p style="font-size:14px">Full ticket source so you can read it alongside the contextual v2 analysis without drilling through ${comments.length} comments on Basecamp.</p>
<ul style="font-size:13px;padding-left:22px;line-height:1.6">
<li>todo id ${escapeHtml(String(todo.id))} &middot; ${comments.length} comments &middot; ${todo.due_on ? 'due ' + escapeHtml(todo.due_on) : 'no due'}</li>
<li>Attached: ticket description + every comment in chronological order, sender-chipped, plaintext-stripped</li>
<li>Long comments capped at 8K chars with a "...truncated" marker; rest on BC</li>
<li>Direct link: <a href="${escapeHtml(todo.app_url || '')}">${escapeHtml(todo.app_url || '')}</a></li>
</ul>
<p style="font-size:14px">Read this, then open the earlier <code>contextual-suggestion-demo-2026-06-03.html</code> to compare what the v2 LLM extracted (goal / progress / next step / tools) against the actual source.</p>
</div>
<div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">Ali</div>
</div></body></html>`;

  const teaserText = `Ali - full BC ticket source attached.

${todo.title}
todo id ${todo.id} · ${comments.length} comments · ${todo.due_on ? 'due ' + todo.due_on : 'no due'}

Attached HTML doc: ticket description + every comment in chronological order (oldest first), sender-chipped, plaintext-stripped from BC HTML. Long comments capped at 8K chars with a marker.

Read this alongside the earlier contextual-suggestion-demo-2026-06-03.html so you can compare what the v2 LLM extracted to the actual source.

BC: ${todo.app_url}

Ali`;

  const r = await sendWithBcAttach({
    ticketId: REPORT_TICKET,
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: `Ali - BC ticket source for "${todo.title.slice(0, 60)}" (read with v2 demo)`,
    html: teaserHtml,
    text: teaserText,
    attachments: [
      { filename: `bc-ticket-${BC_ID}.html`, content: fs.readFileSync(outPath), contentType: 'text/html' },
    ],
    vaultAttachments: [
      { filename: `bc-ticket-${BC_ID}.html`, content: fs.readFileSync(outPath), contentType: 'text/html', vaultDescription: `Full source of BC todo ${BC_ID} (${todo.title}) — description + every comment chronologically. Companion to the Contextual Suggestion v2 worked example.` },
    ],
    bcSummary: `<p>Pulled the full source of BC todo <code>${todo.id}</code> ("${escapeHtml(todo.title)}") so Ali can read it alongside the earlier Contextual Suggestion v2 worked example and verify the v2 analysis against the actual ticket content. ${comments.length} comments + description, chronological, plaintext-stripped, sender-chipped.</p>`,
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
  console.log('Vault uploads:', r.vaultUploads?.length);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
