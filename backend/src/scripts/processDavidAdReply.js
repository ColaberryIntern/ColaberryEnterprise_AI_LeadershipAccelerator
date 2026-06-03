#!/usr/bin/env node
/**
 * Autonomous trigger: catch David's next email on the RE Magazine ad thread,
 * apply his edits to docs/coop-ad-mockups-2026-06-02.html, re-render, reply.
 *
 * Design philosophy: TRY auto-apply, ESCALATE if uncertain.
 * - Polls Gmail thread 19e89a52879d4a32 for new messages from dlahme@.
 * - Tracks last-processed message via tmp/david-ad-trigger-state.json.
 * - Uses OpenAI to translate David's free-form notes into structured edits.
 * - Applies edits as exact-string find/replace; aborts if any find fails.
 * - On full success: renders PDF + thumbs + standalone + sends David reply.
 * - On abort: emails Ali with the proposed edits + the failure reason, NO
 *   change made to file, NO reply sent to David. Safety > speed.
 *
 * Run modes:
 *   node processDavidAdReply.js               # one polling cycle, normal
 *   node processDavidAdReply.js --replay      # re-process last David msg even if marked
 *   node processDavidAdReply.js --dry         # extract edits but do not apply or send
 */
const path = require('path');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

const REPO = path.resolve(__dirname, '../../..');
const HTML_SRC = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.html');
const HTML_STANDALONE = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02-standalone.html');
const PDF_PATH = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.pdf');
const M4_THUMB = path.join(REPO, 'tmp/mockup-thumb-4.png');
const LOGO_PATH = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');
const STATE_PATH = path.join(REPO, 'tmp/david-ad-trigger-state.json');
const LOG_PATH = path.join(REPO, 'docs/coop-ad-trigger-log.md');
// Phase 1.4e fix (2026-06-02): the original watcher was pinned to a single
// thread id, which silently missed David's reply when Gmail split his
// "Covering by bases" message into a different thread. Now we search by
// sender + subject substring so any new David reply on the ad conversation
// is caught regardless of which Gmail thread it lands in. Original
// THREAD_ID kept as the search seed.
const SEED_THREAD_ID = '19e89a52879d4a32';
const SUBJECT_HINTS = ['RE Magazine', 'Open for Advertising', 'Mockup'];
const SEARCH_QUERY = `from:dlahme@colaberry.com newer_than:14d (subject:"RE Magazine" OR subject:"Open for Advertising" OR subject:"Mockup")`;
const DAVID = 'dlahme@colaberry.com';
const BC_TODO = 9955562788; // RE Magazine ad ticket on David Lahme list

const DRY = process.argv.includes('--dry');
const REPLAY = process.argv.includes('--replay');

const log = (s) => console.log(`[ad-trigger] ${s}`);

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

function readState() {
  if (!fs.existsSync(STATE_PATH)) return { lastProcessedMessageId: null, version: 4 };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}
function writeState(s) { fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); }

function appendLog(entry) {
  const hdr = fs.existsSync(LOG_PATH) ? '' : '# David ad trigger log\n\n';
  fs.appendFileSync(LOG_PATH, hdr + `\n## ${new Date().toISOString()}\n\n${entry}\n`);
}

// ===== GMAIL =====
async function gmailAccessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID, client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`oauth refresh ${r.status}`);
  return (await r.json()).access_token;
}

function decodeB64(s) { return Buffer.from((s||'').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }

function extractPlaintext(payload) {
  let txt = '';
  function walk(p) {
    if (!p) return;
    const mt = (p.mimeType || '').toLowerCase();
    if (mt === 'text/plain' && p.body?.data) txt += decodeB64(p.body.data) + '\n';
    for (const sp of (p.parts || [])) walk(sp);
  }
  walk(payload);
  return txt.trim();
}

async function fetchThread(token, threadId) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`thread fetch ${r.status}`);
  return r.json();
}

async function searchDavidMessages(token) {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(SEARCH_QUERY)}&maxResults=20`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) throw new Error(`messages.list ${r.status}`);
  const data = await r.json();
  return data.messages || [];
}

async function findLatestDavidReply(token, lastProcessed) {
  // Search Gmail across recent David replies on the ad conversation,
  // regardless of which thread they landed in.
  const hits = await searchDavidMessages(token);
  if (hits.length === 0) {
    // Fallback to the seed thread so we still process anything that
    // lands there even if the search index lags.
    const thread = await fetchThread(token, SEED_THREAD_ID);
    const msgs = (thread.messages || [])
      .filter((m) => {
        const headers = m.payload?.headers || [];
        const from = (headers.find((h) => h.name.toLowerCase() === 'from')?.value || '').toLowerCase();
        return from.includes(DAVID);
      })
      .sort((a, b) => parseInt(a.internalDate) - parseInt(b.internalDate));
    if (!msgs.length) return null;
    const latest = msgs[msgs.length - 1];
    if (!REPLAY && lastProcessed === latest.id) return null;
    return latest;
  }
  // Fetch each message head, pick the most recent one matching the
  // sender + subject hint, that we haven't processed.
  const messages = [];
  for (const h of hits) {
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${h.id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) continue;
    const m = await r.json();
    const headers = m.payload?.headers || [];
    const from = (headers.find((x) => x.name.toLowerCase() === 'from')?.value || '').toLowerCase();
    const subject = headers.find((x) => x.name.toLowerCase() === 'subject')?.value || '';
    if (!from.includes(DAVID)) continue;
    if (!SUBJECT_HINTS.some((hint) => subject.toLowerCase().includes(hint.toLowerCase()))) continue;
    messages.push(m);
  }
  if (messages.length === 0) return null;
  messages.sort((a, b) => parseInt(a.internalDate) - parseInt(b.internalDate));
  const latest = messages[messages.length - 1];
  if (!REPLAY && lastProcessed === latest.id) return null;
  return latest;
}

// ===== OPENAI EDIT EXTRACTION =====
async function extractEdits(davidText, currentHtml) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
  const systemPrompt = `You are a precise HTML editor. You will be given:
1. The current full HTML of a print ad mockup file.
2. Feedback from David Lahme (the client buying the ad).

Your job: output a STRICT JSON object with this shape:
{
  "summary": "1-sentence summary of what David wants",
  "edits": [
    {
      "intent": "what this edit accomplishes (1 line)",
      "find": "EXACT substring from the current HTML (must match byte-for-byte, including whitespace)",
      "replace": "the new substring",
      "confidence": 0.0 to 1.0
    }
  ],
  "ambiguities": ["any open questions David did not resolve"]
}

CRITICAL RULES:
- The "find" string MUST be a literal substring of the input HTML. No paraphrasing. No regex. If it does not match character-for-character, the script will abort.
- Make "find" strings unique - include enough surrounding context (50-100 chars) to disambiguate.
- Each edit should be SMALL and FOCUSED. Prefer many small edits over one big rewrite.
- If David asks for something requiring NEW content (new image, new product name, new tile), confidence < 0.6 and add to ambiguities.
- If you cannot identify what to change, return edits: [] and explain in ambiguities.
- All edits target Mockup 4 (class names contain "m4-").
- Do NOT change CSS structure or layout beyond what David asks. Stay conservative.

Output JSON ONLY. No prose, no markdown fences.`;

  const userPrompt = `=== DAVID'S FEEDBACK ===
${davidText}

=== CURRENT HTML (relevant section: the Mockup 4 block + its CSS) ===
${extractM4Region(currentHtml)}

Output the JSON edit plan.`;

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return JSON.parse(j.choices[0].message.content);
}

function extractM4Region(html) {
  // Pass M4 CSS + M4 markup to keep token usage low and edits scoped
  const cssStart = html.indexOf('/* ============================================\n     MOCKUP 4');
  const cssEnd = html.indexOf('/* ============================================\n     MOCKUP 5');
  const css = cssStart >= 0 && cssEnd >= 0 ? html.slice(cssStart, cssEnd) : '';
  const m4Match = html.match(/<!-- ============================================ MOCKUP 4 ============================================ -->[\s\S]+?<!-- ============================================ MOCKUP 5/);
  const m4 = m4Match ? m4Match[0] : '';
  return `--- M4 CSS ---\n${css}\n\n--- M4 MARKUP ---\n${m4}`;
}

// ===== APPLY EDITS =====
function applyEdits(html, edits) {
  let current = html;
  const results = [];
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i];
    const occurrences = current.split(e.find).length - 1;
    if (occurrences === 0) {
      results.push({ idx: i + 1, intent: e.intent, status: 'FIND_NOT_FOUND', confidence: e.confidence });
      continue;
    }
    if (occurrences > 1) {
      results.push({ idx: i + 1, intent: e.intent, status: 'FIND_AMBIGUOUS', confidence: e.confidence, occurrences });
      continue;
    }
    current = current.replace(e.find, e.replace);
    results.push({ idx: i + 1, intent: e.intent, status: 'APPLIED', confidence: e.confidence });
  }
  const failed = results.filter((r) => r.status !== 'APPLIED');
  return { current, results, ok: failed.length === 0, failed };
}

// ===== PIPELINE =====
function bumpVersion(html, fromV, toV) {
  return html.replace(`V${fromV}`, `V${toV}`).replace(`v${fromV} `, `v${toV} `);
}

function rerender() {
  log('rendering PDF + capturing thumbs + inlining standalone...');
  const tmpPdf = path.join(REPO, 'tmp/render-ad-mockups-pdf.js');
  const tmpThumb = path.join(REPO, 'tmp/capture-mockup-thumbs.js');
  const inline = path.join(REPO, 'tmp/inline-html-images.js');
  for (const s of [tmpPdf, tmpThumb]) {
    const r = spawnSync(process.execPath, [s], { cwd: REPO, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`render step failed: ${s} :: ${(r.stderr||'').slice(0,300)}`);
  }
  const r2 = spawnSync(process.execPath, [inline, HTML_SRC, HTML_STANDALONE], { cwd: REPO, encoding: 'utf8' });
  if (r2.status !== 0) throw new Error(`inline step failed :: ${(r2.stderr||'').slice(0,300)}`);
  log('  render done.');
}

// ===== SEND DAVID REPLY =====
async function sendDavidReply({ summary, results, edits, newVersion }) {
  const changelogRows = results.filter((r) => r.status === 'APPLIED').map((r) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:12px"><strong>#${r.idx}</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#14532d">${escapeHtml(r.intent)}</td></tr>`).join('');

  const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white">

<div style="background:#0f172a;color:white;padding:24px 28px">
<img src="cid:logo" alt="Colaberry" style="height:30px;display:block;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mockup 4 ${newVersion} - your latest edits applied</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800;line-height:1.3">David - your latest critique is in. ${results.filter((r)=>r.status==='APPLIED').length} edits applied, V${newVersion}.</h1>
</div>

<div style="padding:24px 28px">

<p style="font-size:14px;color:#1f2937;margin:0 0 12px">David,</p>
<p style="font-size:14px;color:#1f2937;margin:0 0 14px">${escapeHtml(summary)}</p>

<div style="margin:20px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<img src="cid:mockup4" alt="Mockup 4 ${newVersion}" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
<div style="margin-top:10px;font-size:12px;color:#475569;font-style:italic">Mockup 4 ${newVersion}</div>
</div>

<h2 style="font-size:16px;margin:18px 0 10px;color:#0f172a">Changelog</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<thead><tr style="background:#1a365d;color:white"><th style="padding:8px 12px;text-align:left;font-size:11px;width:40px">#</th><th style="padding:8px 12px;text-align:left;font-size:11px">What changed</th></tr></thead>
<tbody>${changelogRows}</tbody>
</table>

<p style="font-size:14px;color:#1f2937;margin:18px 0 0">Standalone HTML + PDF attached. If anything looks off, reply and I will iterate again. Thursday EOD still in budget.</p>

</div>

<div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

  const TEXT = strip(`David - your latest critique processed. V${newVersion} attached.

SUMMARY: ${summary}

CHANGELOG:
${results.filter((r)=>r.status==='APPLIED').map((r)=>`${r.idx}. ${r.intent}`).join('\n')}

Standalone HTML + PDF attached. Reply if anything is off; I'll iterate.

Ali`);

  validateBeforeSend(strip(HTML), TEXT);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  return transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: DAVID, cc: ['ram@colaberry.com'], bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: `Re: Open for Advertising - RE Magazine - Mockup 4 ${newVersion} (auto-applied)`,
    text: TEXT, html: strip(HTML),
    attachments: [
      { filename: 'coop-ad-mockups-V' + newVersion + '-standalone.html', content: fs.readFileSync(HTML_STANDALONE), contentType: 'text/html' },
      { filename: 'coop-ad-mockups-V' + newVersion + '.pdf', content: fs.readFileSync(PDF_PATH), contentType: 'application/pdf' },
      { filename: 'mockup-4-' + newVersion + '.png', content: fs.readFileSync(M4_THUMB), cid: 'mockup4' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
}

// ===== ESCALATE TO ALI =====
async function escalateToAli({ davidText, plan, applyResult, newVersion, reason }) {
  const failedList = (applyResult?.failed || []).map((f) => `<li><strong>#${f.idx}:</strong> ${escapeHtml(f.intent)} (${f.status}, confidence ${f.confidence})</li>`).join('');
  const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white;padding:24px 32px">
<div style="background:#7f1d1d;color:white;padding:18px 22px;border-radius:8px;margin-bottom:18px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Auto-trigger escalation</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800">Ali - David replied but auto-apply aborted. No reply sent to David.</h1>
<div style="font-size:13px;color:#fecaca;margin-top:6px">${escapeHtml(reason)}</div>
</div>

<h2 style="font-size:16px;margin:0 0 8px">David's note (verbatim):</h2>
<pre style="background:#f8fafc;padding:14px 16px;border-radius:6px;white-space:pre-wrap;font-family:'Courier New',monospace;font-size:12px;color:#1f2937">${escapeHtml(davidText)}</pre>

${plan ? `<h2 style="font-size:16px;margin:20px 0 8px">Proposed edit plan (from OpenAI):</h2>
<div style="font-size:13px;margin-bottom:8px"><strong>Summary:</strong> ${escapeHtml(plan.summary || '')}</div>
<ol style="font-size:13px">${(plan.edits||[]).map((e)=>`<li><strong>${escapeHtml(e.intent)}</strong> <span style="color:#94a3b8">(confidence ${e.confidence})</span></li>`).join('')}</ol>
${plan.ambiguities && plan.ambiguities.length ? `<div style="background:#fef9e7;padding:12px 16px;border-left:4px solid #d4a017;border-radius:0 6px 6px 0;font-size:13px;color:#78350f;margin-top:10px"><strong>Ambiguities David did not resolve:</strong><ul>${plan.ambiguities.map((a)=>`<li>${escapeHtml(a)}</li>`).join('')}</ul></div>`:''}` : ''}

${failedList ? `<h2 style="font-size:16px;margin:20px 0 8px;color:#7f1d1d">Edits that failed:</h2><ul>${failedList}</ul>` : ''}

<div style="margin-top:18px;padding:14px 18px;background:#fef2f2;border-left:5px solid #c1272d;border-radius:0 6px 6px 0;font-size:13px;color:#7f1d1d">
Open the source HTML at <code>docs/coop-ad-mockups-2026-06-02.html</code> and apply the edits manually, then re-run the script with <code>--replay</code> to send David the V${newVersion} reply.
</div>

</div></body></html>`;
  const TEXT = strip(`Auto-trigger escalation. David replied; auto-apply aborted. No reply sent to David.
REASON: ${reason}

DAVID NOTE:
${davidText}

${plan ? `PLAN SUMMARY: ${plan.summary}\nEDITS PROPOSED: ${(plan.edits||[]).length}\nAMBIGUITIES: ${(plan.ambiguities||[]).join(' | ')}` : ''}

${applyResult ? `FAILED EDITS: ${(applyResult.failed||[]).map((f)=>`#${f.idx} ${f.intent} (${f.status})`).join(' | ')}` : ''}

Open docs/coop-ad-mockups-2026-06-02.html, apply manually, re-run with --replay.

Ali`);
  validateBeforeSend(strip(HTML), TEXT);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  return transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>', to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Ali - David ad trigger needs you (auto-apply aborted)',
    text: TEXT, html: strip(HTML),
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
}

// ===== BC COMMENT =====
async function postBcComment({ davidText, plan, results, newVersion, sent }) {
  const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da').replace(/^bearer\s+/i, '').trim();
  const H = () => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'AdTrigger', 'Content-Type': 'application/json', Accept: 'application/json' });
  const status = sent ? 'AUTO-APPLIED' : 'ESCALATED';
  const summary = plan?.summary || '(no summary)';
  const editLines = results.map((r) => `<li><strong>#${r.idx}</strong> ${escapeHtml(r.intent)} - <span style="color:${r.status === 'APPLIED' ? '#14532d' : '#7f1d1d'}">${r.status}</span> (conf ${r.confidence})</li>`).join('');
  const body = `<div style="background:${sent?'#dcfce7':'#fee2e2'};border-left:5px solid ${sent?'#14532d':'#7f1d1d'};padding:14px 18px;border-radius:0 6px 6px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${sent?'#14532d':'#7f1d1d'};font-weight:700">Auto-trigger iteration - ${status}</div>
<div style="font-size:13px;color:${sent?'#14532d':'#7f1d1d'};margin-top:4px">${escapeHtml(summary)}</div>
</div>
<div style="margin-top:10px"><strong>David's verbatim note:</strong></div>
<pre style="background:#f8fafc;padding:12px 14px;border-radius:6px;white-space:pre-wrap;font-family:'Courier New',monospace;font-size:12px">${escapeHtml(davidText)}</pre>
<div style="margin-top:10px"><strong>Edits attempted (${results.length}):</strong></div>
<ul>${editLines}</ul>
${plan?.ambiguities?.length ? `<div style="margin-top:8px;background:#fef9e7;padding:10px 14px;border-left:4px solid #d4a017;border-radius:0 6px 6px 0;font-size:12px;color:#78350f"><strong>Ambiguities:</strong><ul>${plan.ambiguities.map((a)=>`<li>${escapeHtml(a)}</li>`).join('')}</ul></div>` : ''}
<div style="margin-top:10px;font-size:11px;color:#94a3b8">Version: V${newVersion} - ${sent ? 'reply sent to David + Mandrill logged' : 'awaiting Ali manual review + --replay'}</div>`;
  await fetch(`https://3.basecampapi.com/3945211/buckets/7463955/recordings/${BC_TODO}/comments.json`, {
    method: 'POST', headers: H(), body: JSON.stringify({ content: body }),
  });
}

function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ===== MAIN =====
(async () => {
  // Kill switch: presence of tmp/david-trigger-killed.flag aborts immediately
  const killFlag = path.join(REPO, 'tmp/david-trigger-killed.flag');
  if (fs.existsSync(killFlag) && !DRY) {
    log('KILL SWITCH ACTIVE - flag file exists. exiting without action.');
    return;
  }
  log(`mode: ${DRY ? 'DRY' : REPLAY ? 'REPLAY' : 'NORMAL'}`);
  const state = readState();
  log(`state: lastProcessedMessageId=${state.lastProcessedMessageId} version=${state.version}`);

  const token = await gmailAccessToken();
  const latest = await findLatestDavidReply(token, state.lastProcessedMessageId);
  if (!latest) { log('no new David reply. exiting.'); return; }
  log(`new David message: ${latest.id} (${new Date(parseInt(latest.internalDate)).toISOString()})`);

  const davidText = extractPlaintext(latest.payload);
  if (!davidText) { log('empty body. exiting.'); return; }
  appendLog(`### Inbound from David (msg ${latest.id})\n\n\`\`\`\n${davidText}\n\`\`\``);

  const newVersion = state.version + 1;
  log(`extracting edits via OpenAI...`);
  const currentHtml = fs.readFileSync(HTML_SRC, 'utf8');
  let plan;
  try {
    plan = await extractEdits(davidText, currentHtml);
  } catch (e) {
    log(`OpenAI failed: ${e.message}`);
    if (!DRY) await escalateToAli({ davidText, plan: null, applyResult: null, newVersion, reason: `OpenAI extraction failed: ${e.message}` });
    await postBcComment({ davidText, plan: null, results: [], newVersion, sent: false });
    return;
  }
  log(`plan: ${plan.edits.length} edits proposed. summary: ${plan.summary}`);
  appendLog(`### Proposed plan\n\nSummary: ${plan.summary}\n\nEdits:\n${plan.edits.map((e, i) => `${i+1}. ${e.intent} (conf ${e.confidence})`).join('\n')}\n\nAmbiguities: ${(plan.ambiguities||[]).join(' | ')}`);

  if (DRY) {
    log('--dry: not applying or sending');
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (plan.edits.length === 0) {
    log('no edits in plan. escalating.');
    await escalateToAli({ davidText, plan, applyResult: null, newVersion, reason: 'OpenAI returned 0 edits. David note likely needs human interpretation.' });
    await postBcComment({ davidText, plan, results: [], newVersion, sent: false });
    return;
  }
  const lowConf = plan.edits.filter((e) => e.confidence < 0.7);
  if (lowConf.length > 0) {
    log(`${lowConf.length} low-confidence edit(s). escalating.`);
    await escalateToAli({ davidText, plan, applyResult: null, newVersion, reason: `${lowConf.length} edit(s) below confidence threshold 0.7. Safety abort.` });
    await postBcComment({ davidText, plan, results: lowConf.map((e, i) => ({ idx: i+1, intent: e.intent, status: 'LOW_CONFIDENCE', confidence: e.confidence })), newVersion, sent: false });
    return;
  }

  const versionBumped = bumpVersion(currentHtml, state.version, newVersion);
  const applyResult = applyEdits(versionBumped, plan.edits);
  if (!applyResult.ok) {
    log(`${applyResult.failed.length} edits failed to apply. escalating.`);
    await escalateToAli({ davidText, plan, applyResult, newVersion, reason: `${applyResult.failed.length} edit(s) failed string-replace (find not in file).` });
    await postBcComment({ davidText, plan, results: applyResult.results, newVersion, sent: false });
    return;
  }

  log('all edits applied. writing + rendering...');
  fs.writeFileSync(HTML_SRC, applyResult.current);
  try {
    rerender();
  } catch (e) {
    log(`render failed: ${e.message}`);
    // rollback the HTML change
    fs.writeFileSync(HTML_SRC, currentHtml);
    await escalateToAli({ davidText, plan, applyResult, newVersion, reason: `Render failed: ${e.message}. HTML rolled back.` });
    await postBcComment({ davidText, plan, results: applyResult.results, newVersion, sent: false });
    return;
  }

  log('sending reply to David...');
  const sendResult = await sendDavidReply({ summary: plan.summary, results: applyResult.results, edits: plan.edits, newVersion });
  log(`sent: ${sendResult.messageId}`);

  await postBcComment({ davidText, plan, results: applyResult.results, newVersion, sent: true });
  writeState({ lastProcessedMessageId: latest.id, version: newVersion });
  appendLog(`### Outbound to David\n\nSent V${newVersion} reply: ${sendResult.messageId}\nEdits applied: ${applyResult.results.filter((r)=>r.status==='APPLIED').length}`);
  log('done.');
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
