#!/usr/bin/env node
// Pull every Gmail thread matching an account's searchTerms, render each as a
// clean text file (one thread per file, all messages threaded chronologically),
// download attachments as binary, save everything to tmp/cb-context-backfill/<slug>/
//
// Then (with --upload) call cbAttachToAccount under the hood to push to BC.
//
// Usage:
//   node cbPullGmailForAccount.js --account coca-cola-consolidated [--days 365] [--upload] [--limit 100]
//
// Requires: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in .env

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { resolveAccount } = require(path.resolve(__dirname, './lib/cbAccountContext'));

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const REPO = path.resolve(__dirname, '../../..');

function parseArgs(argv) {
  const out = { upload: false, days: 365, limit: 100 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--account') out.account = argv[++i];
    else if (a === '--days') out.days = parseInt(argv[++i], 10);
    else if (a === '--limit') out.limit = parseInt(argv[++i], 10);
    else if (a === '--upload') out.upload = true;
    else if (a === '--no-attachments') out.skipAttachments = true;
    else if (a === '--dry') out.dry = true;
  }
  if (!out.account) throw new Error('--account required');
  return out;
}

async function getAccessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`oauth refresh failed ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.access_token;
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

function decodeBase64Url(s) {
  if (!s) return '';
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function decodeBase64UrlBinary(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function extractParts(payload) {
  // walk payload tree, return { textBody, htmlBody, attachments: [{filename, mimeType, attachmentId, partId, size}] }
  const out = { textBody: '', htmlBody: '', attachments: [] };
  function walk(part) {
    if (!part) return;
    const mt = (part.mimeType || '').toLowerCase();
    if (mt === 'text/plain' && part.body && part.body.data) out.textBody += decodeBase64Url(part.body.data) + '\n';
    else if (mt === 'text/html' && part.body && part.body.data) out.htmlBody += decodeBase64Url(part.body.data) + '\n';
    else if (part.filename && part.body && (part.body.attachmentId || part.body.data)) {
      out.attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        attachmentId: part.body.attachmentId,
        inlineData: part.body.data,
        size: part.body.size,
      });
    }
    for (const sub of (part.parts || [])) walk(sub);
  }
  walk(payload);
  return out;
}

function headerOf(headers, name) {
  const h = (headers || []).find((x) => (x.name || '').toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function slugify(s) {
  return String(s).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 80);
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

async function fetchAttachmentBinary(token, messageId, attachmentId) {
  const j = await gmailGet(token, `/messages/${messageId}/attachments/${attachmentId}`);
  return decodeBase64UrlBinary(j.data);
}

async function renderThread(token, thread, outDir, opts) {
  const messages = thread.messages || [];
  if (!messages.length) return null;
  const firstSubject = headerOf(messages[0].payload?.headers, 'subject') || '(no-subject)';
  const firstDate = headerOf(messages[0].payload?.headers, 'date') || new Date().toISOString();
  const dateStr = new Date(firstDate).toISOString().slice(0, 10);
  const slug = `${dateStr}-${slugify(firstSubject.replace(/^re:\s*/i, ''))}`.slice(0, 100);

  const lines = [`Thread: ${firstSubject}`, `ThreadID: ${thread.id}`, `Messages: ${messages.length}`, '', '='.repeat(70), ''];
  const attachmentResults = [];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const h = m.payload?.headers || [];
    const from = headerOf(h, 'from');
    const to = headerOf(h, 'to');
    const cc = headerOf(h, 'cc');
    const date = headerOf(h, 'date');
    const subject = headerOf(h, 'subject');
    const parts = extractParts(m.payload);
    const body = parts.textBody.trim() || htmlToText(parts.htmlBody).trim();

    lines.push(`--- Message ${i + 1}/${messages.length} ---`);
    lines.push(`From: ${from}`);
    lines.push(`To: ${to}`);
    if (cc) lines.push(`Cc: ${cc}`);
    lines.push(`Date: ${date}`);
    lines.push(`Subject: ${subject}`);
    if (parts.attachments.length) {
      lines.push(`Attachments: ${parts.attachments.map((a) => `${a.filename} (${a.mimeType}, ${a.size}b)`).join(', ')}`);
    }
    lines.push('');
    lines.push(body || '[no body]');
    lines.push('');

    // Pull attachment binaries (skipping inline images and very large files)
    if (!opts.skipAttachments) {
      for (const att of parts.attachments) {
        if (!att.filename || att.filename.startsWith('image00') || /\.(png|jpg|jpeg|gif)$/i.test(att.filename)) continue;
        if (!att.attachmentId) continue;
        if ((att.size || 0) > 20 * 1024 * 1024) { attachmentResults.push({ filename: att.filename, skipped: 'too-large' }); continue; }
        try {
          const buf = await fetchAttachmentBinary(token, m.id, att.attachmentId);
          const safeName = `${slug}__${slugify(att.filename.replace(/\.[^.]+$/, ''))}${path.extname(att.filename) || ''}`;
          const outPath = path.join(outDir, safeName);
          fs.writeFileSync(outPath, buf);
          attachmentResults.push({ filename: att.filename, savedAs: safeName, size: buf.length });
        } catch (e) {
          attachmentResults.push({ filename: att.filename, error: e.message });
        }
      }
    }
  }

  const filename = `${slug}.txt`;
  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  return { threadId: thread.id, subject: firstSubject, file: outPath, attachments: attachmentResults };
}

(async () => {
  const args = parseArgs(process.argv);
  const account = resolveAccount(args.account);
  const outDir = path.resolve(REPO, 'tmp/cb-context-backfill', account.slug);
  fs.mkdirSync(outDir, { recursive: true });

  const query = buildQuery(account, args.days);
  console.log(`[cb-gmail] account: ${account.displayName} (slug=${account.slug})`);
  console.log(`[cb-gmail] gmail query: ${query}`);
  console.log(`[cb-gmail] output dir: ${outDir}`);

  if (args.dry) { console.log('[cb-gmail] --dry: skipping actual fetches'); return; }

  const token = await getAccessToken();
  const threadIds = await listThreadIds(token, query, args.limit);
  console.log(`[cb-gmail] threads matched: ${threadIds.length}`);

  const rendered = [];
  for (const tid of threadIds) {
    try {
      const thread = await gmailGet(token, `/threads/${tid}?format=full`);
      const r = await renderThread(token, thread, outDir, { skipAttachments: args.skipAttachments });
      if (r) {
        rendered.push(r);
        console.log(`  rendered: ${path.basename(r.file)} (${r.attachments.length} attachments)`);
      }
    } catch (e) {
      console.error(`  fail ${tid}: ${e.message}`);
    }
  }

  console.log(`\n[cb-gmail] rendered ${rendered.length} threads to ${outDir}`);
  const summary = path.join(outDir, '_pull_summary.json');
  fs.writeFileSync(summary, JSON.stringify({ account: account.slug, query, threadCount: rendered.length, rendered }, null, 2));

  if (args.upload) {
    console.log(`\n[cb-gmail] calling cbAttachToAccount.js --dir ${outDir}...`);
    const script = path.resolve(__dirname, 'cbAttachToAccount.js');
    const proc = spawnSync(process.execPath, [script, '--account', account.slug, '--dir', outDir, '--kind', 'email'], { stdio: 'inherit', env: process.env });
    if (proc.status !== 0) throw new Error(`cbAttachToAccount.js exit ${proc.status}`);
  } else {
    console.log(`\n[cb-gmail] --upload not set; files are on disk. To upload:`);
    console.log(`  node backend/src/scripts/cbAttachToAccount.js --account ${account.slug} --dir ${outDir} --kind email`);
  }
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
