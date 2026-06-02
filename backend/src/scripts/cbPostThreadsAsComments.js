#!/usr/bin/env node
// Post every Gmail thread matching an account's searchTerms as a SEPARATE
// comment on the account's BC ticket. Each comment contains the full email
// thread as plaintext (all messages, oldest to newest) so the CB walker can
// read it. Attachments are uploaded via /attachments.json and rendered inline
// in the comment with <bc-attachment> tags - BC shows them as native inline
// previews and DOES NOT add them to Docs & Files.
//
// Idempotent: re-runs skip threads we've already posted (we tag each comment
// with a hidden "[CB-Thread-ID:<gmail-thread-id>]" marker and check before
// posting).
//
// Usage:
//   node cbPostThreadsAsComments.js --account coca-cola-consolidated [--days 365] [--limit 100] [--dry]
//   node cbPostThreadsAsComments.js --account coca-cola-consolidated --thread <gmail-thread-id> ... (target specific)
//
// Requires: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, BASECAMP_ACCESS_TOKEN

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { resolveAccount, bcGet, bcPost } = require(path.resolve(__dirname, './lib/cbAccountContext'));

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

function parseArgs(argv) {
  const out = { days: 365, limit: 100, threads: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--account') out.account = argv[++i];
    else if (a === '--days') out.days = parseInt(argv[++i], 10);
    else if (a === '--limit') out.limit = parseInt(argv[++i], 10);
    else if (a === '--thread') out.threads.push(argv[++i]);
    else if (a === '--dry') out.dry = true;
    else if (a === '--no-attachments') out.skipAttachments = true;
  }
  if (!out.account) throw new Error('--account required');
  return out;
}

async function getAccessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`oauth refresh failed ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

function buildQuery(account, days) {
  const parts = [];
  const sr = account.searchTerms || {};
  const peopleQ = (sr.participants || []).map((p) => `(from:${p} OR to:${p} OR cc:${p})`).join(' OR ');
  const kwQ = (sr.keywords || []).map((k) => `"${k}"`).join(' OR ');
  if (peopleQ && kwQ) parts.push(`(${peopleQ}) AND (${kwQ})`);
  else if (peopleQ) parts.push(`(${peopleQ})`);
  else if (kwQ) parts.push(`(${kwQ})`);
  if (days) parts.push(`newer_than:${days}d`);
  return parts.join(' AND ');
}

async function gmailGet(token, urlPath) {
  const r = await fetch(`${GMAIL_API}${urlPath}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`gmail GET ${urlPath} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function listThreadIds(token, query, limit) {
  const ids = [];
  let pageToken = '';
  while (ids.length < limit) {
    const qs = new URLSearchParams({ q: query, maxResults: '100' });
    if (pageToken) qs.set('pageToken', pageToken);
    const j = await gmailGet(token, `/threads?${qs}`);
    for (const t of (j.threads || [])) ids.push(t.id);
    if (!j.nextPageToken || ids.length >= limit) break;
    pageToken = j.nextPageToken;
  }
  return ids.slice(0, limit);
}

function decodeBase64Url(s) { return Buffer.from((s||'').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
function decodeBase64UrlBinary(s) { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

function extractParts(payload) {
  const out = { textBody: '', htmlBody: '', attachments: [] };
  function walk(part) {
    if (!part) return;
    const mt = (part.mimeType || '').toLowerCase();
    if (mt === 'text/plain' && part.body && part.body.data) out.textBody += decodeBase64Url(part.body.data) + '\n';
    else if (mt === 'text/html' && part.body && part.body.data) out.htmlBody += decodeBase64Url(part.body.data) + '\n';
    else if (part.filename && part.body && (part.body.attachmentId || part.body.data)) {
      out.attachments.push({
        filename: part.filename, mimeType: part.mimeType, attachmentId: part.body.attachmentId,
        inlineData: part.body.data, size: part.body.size,
      });
    }
    for (const sub of (part.parts || [])) walk(sub);
  }
  walk(payload);
  return out;
}

function header(headers, name) {
  const h = (headers || []).find((x) => (x.name || '').toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

async function fetchAttachmentBinary(token, messageId, attachmentId) {
  const j = await gmailGet(token, `/messages/${messageId}/attachments/${attachmentId}`);
  return decodeBase64UrlBinary(j.data);
}

async function uploadBcAttachment(buffer, filename, contentType) {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '').trim();
  const r = await fetch(`https://3.basecampapi.com/3945211/attachments.json?name=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': contentType || 'application/octet-stream', 'User-Agent': 'Colaberry CB Thread Poster' },
    body: buffer,
  });
  if (!r.ok) throw new Error(`attachments.json failed ${r.status}: ${await r.text()}`);
  return (await r.json()).attachable_sgid;
}

function buildCommentHtml({ thread, threadMarker }) {
  const messages = thread.messages || [];
  const firstSubject = header(messages[0]?.payload?.headers, 'subject') || '(no subject)';
  const firstDate = header(messages[0]?.payload?.headers, 'date') || '';
  const dateShort = firstDate ? new Date(firstDate).toISOString().slice(0, 10) : '';

  const lines = [];
  lines.push(`<div><strong>Email thread:</strong> ${escapeHtml(firstSubject)}</div>`);
  lines.push(`<div style="margin-top:4px;font-size:12px;color:#94a3b8">${escapeHtml(dateShort)} - ${messages.length} message${messages.length === 1 ? '' : 's'} - Gmail thread ${escapeHtml(thread.id)}</div>`);
  lines.push(`<hr>`);

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const h = m.payload?.headers || [];
    const from = header(h, 'from');
    const to = header(h, 'to');
    const cc = header(h, 'cc');
    const date = header(h, 'date');
    const subject = header(h, 'subject');
    const parts = extractParts(m.payload);
    const body = parts.textBody.trim() || htmlToText(parts.htmlBody);

    if (i > 0) lines.push(`<hr style="border:none;border-top:1px dashed #cbd5e1;margin:12px 0">`);
    lines.push(`<div style="font-size:12px;color:#475569"><strong>Message ${i + 1}/${messages.length}</strong> - ${escapeHtml(date)}</div>`);
    lines.push(`<div style="font-size:12px;color:#475569"><strong>From:</strong> ${escapeHtml(from)}</div>`);
    lines.push(`<div style="font-size:12px;color:#475569"><strong>To:</strong> ${escapeHtml(to)}</div>`);
    if (cc) lines.push(`<div style="font-size:12px;color:#475569"><strong>Cc:</strong> ${escapeHtml(cc)}</div>`);
    if (subject && subject !== firstSubject) lines.push(`<div style="font-size:12px;color:#475569"><strong>Subject:</strong> ${escapeHtml(subject)}</div>`);
    lines.push(`<div style="margin-top:6px;white-space:pre-wrap;font-family:inherit">${escapeHtml(body || '[no body]')}</div>`);
  }

  // Hidden tracking marker for idempotency
  lines.push(`<div style="display:none">${threadMarker}</div>`);

  return lines.join('\n');
}

(async () => {
  const args = parseArgs(process.argv);
  const account = resolveAccount(args.account);
  console.log(`[cb-thread-post] account: ${account.displayName} (slug=${account.slug}, ticket=${account.ticketId})`);

  // Load existing comments to dedup
  const existingComments = await bcGet(`/buckets/${account.bucketId}/recordings/${account.ticketId}/comments.json`);
  const alreadyPosted = new Set();
  for (const c of (existingComments || [])) {
    const m = (c.content || '').match(/\[CB-Thread-ID:([a-z0-9]+)\]/i);
    if (m) alreadyPosted.add(m[1]);
  }
  console.log(`[cb-thread-post] already posted: ${alreadyPosted.size} threads`);

  const token = await getAccessToken();
  let threadIds = args.threads.length ? args.threads : [];
  if (!threadIds.length) {
    const query = buildQuery(account, args.days);
    console.log(`[cb-thread-post] gmail query: ${query}`);
    threadIds = await listThreadIds(token, query, args.limit);
  }
  console.log(`[cb-thread-post] threads matched: ${threadIds.length}`);

  let posted = 0, skipped = 0, failed = 0;
  for (const tid of threadIds) {
    if (alreadyPosted.has(tid)) { console.log(`  SKIP ${tid} (already posted)`); skipped++; continue; }
    try {
      const thread = await gmailGet(token, `/threads/${tid}?format=full`);
      const threadMarker = `[CB-Thread-ID:${tid}]`;
      let commentHtml = buildCommentHtml({ thread, threadMarker });

      // Upload each attachment + append bc-attachment tag(s)
      const attachmentLines = [];
      if (!args.skipAttachments) {
        for (const m of (thread.messages || [])) {
          const parts = extractParts(m.payload);
          for (const att of parts.attachments) {
            if (!att.filename) continue;
            if (/\.(png|jpg|jpeg|gif)$/i.test(att.filename) && att.filename.startsWith('image00')) continue; // inline images
            if (!att.attachmentId) continue;
            if ((att.size || 0) > 20 * 1024 * 1024) continue;
            try {
              const buf = await fetchAttachmentBinary(token, m.id, att.attachmentId);
              const sgid = await uploadBcAttachment(buf, att.filename, att.mimeType);
              attachmentLines.push(`<bc-attachment sgid="${sgid}" caption="${escapeHtml(att.filename)}"></bc-attachment>`);
            } catch (e) {
              console.error(`    attachment ${att.filename}: ${e.message}`);
            }
          }
        }
      }
      if (attachmentLines.length) {
        commentHtml += `\n<hr>\n<div style="font-size:12px;color:#475569"><strong>Attachments (${attachmentLines.length}):</strong></div>\n` + attachmentLines.join('\n');
      }

      if (args.dry) { console.log(`  DRY ${tid} (${(thread.messages || []).length} msgs, ${attachmentLines.length} atts)`); continue; }

      const c = await bcPost(`/buckets/${account.bucketId}/recordings/${account.ticketId}/comments.json`, { content: commentHtml });
      console.log(`  POSTED ${tid} -> comment ${c.id} (${(thread.messages || []).length} msgs, ${attachmentLines.length} atts)`);
      posted++;
    } catch (e) {
      console.error(`  FAIL ${tid}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n[cb-thread-post] posted=${posted} skipped=${skipped} failed=${failed}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
