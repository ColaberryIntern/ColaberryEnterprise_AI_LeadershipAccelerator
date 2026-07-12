#!/usr/bin/env node
/**
 * CB QUALITY AUDIT - response-quality self-improvement loop.
 *
 * cb-watchdog.js watches dispatcher INFRA health (ticks, coverage, gaps).
 * This script watches RESPONSE QUALITY: did CB post clean, correctly-addressed
 * replies, or did it leak tool-call scaffolding / get "lost" / fail to reply?
 *
 * It reads the handler audit log (cb-handler-log.jsonl), classifies the last N
 * invocations, prints a per-response audit, and appends durable lessons to
 * cb-lessons.md (which the handler injects back into its system prompt - that
 * is the self-improvement loop). With --email it sends Ali a quality digest.
 *
 * Usage:
 *   node scripts/ops-engine/cb-quality-audit.js              # audit last 25, print
 *   node scripts/ops-engine/cb-quality-audit.js --n 50       # last 50
 *   node scripts/ops-engine/cb-quality-audit.js --email      # also email Ali
 *   node scripts/ops-engine/cb-quality-audit.js --learn      # append new lessons
 *
 * Exit code: 0 if no quality defects in the window, 2 otherwise.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const REPO = path.resolve(__dirname, '../..');
const LOG_PATH = path.resolve(REPO, 'tmp/ops-engine/cb-handler-log.jsonl');
const LESSONS_PATH = path.resolve(__dirname, 'cb-lessons.md');

const argv = process.argv.slice(2);
const N = (() => { const i = argv.indexOf('--n'); return i >= 0 ? parseInt(argv[i + 1], 10) || 25 : 25; })();
const DO_EMAIL = argv.includes('--email');
const DO_LEARN = argv.includes('--learn');

function readEntries() {
  let raw;
  try { raw = fs.readFileSync(LOG_PATH, 'utf8'); }
  catch (e) { return { error: `log unreadable at ${LOG_PATH}: ${e.message}`, entries: [] };  }
  const entries = raw.split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  return { entries };
}

// Classify one invocation. Returns { ok, defects:[...] }.
function classify(e) {
  const defects = [];
  const flags = e.quality_flags || (e.side_effects && e.side_effects.qualityFlags) || [];
  if (flags.includes('tool_call_leak_sanitized') || flags.includes('model_emitted_tool_call_as_text')) {
    defects.push('tool-call-leak (auto-sanitized, but the model still mis-emitted)');
  }
  if (e.forced_reply || (e.tools_called || []).some((t) => t.forced)) {
    defects.push('forced-reply (model returned text without a real tool_call)');
  }
  if (e.status === 'error' || e.error) defects.push(`handler-error: ${e.error || 'unknown'}`);
  if (e.status === 'truncated') defects.push('truncated (hit MAX_ITERATIONS without finishing)');
  const repliedHtml = e.side_effects && e.side_effects.repliedHtml;
  if (!repliedHtml && e.status !== 'no_api_key') defects.push('no-reply-posted');
  // Did the visible reply still contain leaked scaffolding? (defense audit)
  if (repliedHtml && /functions?\.\w+\s*\(|content_html\s*:|\bfinish\s*\(\s*\)/.test(repliedHtml)) {
    defects.push('LEAK-IN-POSTED-REPLY (sanitizer missed - investigate)');
  }
  return { ok: defects.length === 0, defects };
}

function summarize(entries) {
  const window = entries.slice(-N);
  const rows = window.map((e) => {
    const c = classify(e);
    return {
      ts: (e.ts || '').slice(0, 19),
      requester: e.requester_name || (e.requester_id ? `id:${e.requester_id}` : 'unknown'),
      rec: e.rec_id,
      tools: (e.tools_called || []).map((t) => t.name + (t.forced ? '*' : '')).join(',') || '(none)',
      ok: c.ok,
      defects: c.defects,
    };
  });
  const defectRows = rows.filter((r) => !r.ok);
  const counts = {};
  for (const r of defectRows) for (const d of r.defects) {
    const key = d.split(' ')[0];
    counts[key] = (counts[key] || 0) + 1;
  }
  return { rows, defectRows, counts, total: rows.length };
}

function printReport({ rows, defectRows, counts, total }) {
  console.log(`\nCB QUALITY AUDIT - last ${total} response(s)\n${'='.repeat(52)}`);
  for (const r of rows) {
    const mark = r.ok ? '✓' : '✗';
    console.log(`${mark} [${r.ts}] ${r.requester} -> rec ${r.rec}  tools: ${r.tools}`);
    for (const d of r.defects) console.log(`      ! ${d}`);
  }
  console.log(`\n${'='.repeat(52)}`);
  console.log(`Clean: ${total - defectRows.length}/${total}   Defective: ${defectRows.length}/${total}`);
  if (Object.keys(counts).length) {
    console.log('Defect breakdown:');
    for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${v}x  ${k}`);
  }
  console.log('');
  return defectRows.length;
}

// Append a lesson only if its signature is not already present (idempotent).
function learn(counts) {
  if (!DO_LEARN) return [];
  let existing = '';
  try { existing = fs.readFileSync(LESSONS_PATH, 'utf8'); } catch {}
  const today = new Date().toISOString().slice(0, 10);
  const candidates = [];
  if (counts['LEAK-IN-POSTED-REPLY']) {
    candidates.push(`- ${today}: AUDIT found leaked tool-call syntax in ${counts['LEAK-IN-POSTED-REPLY']} POSTED replies despite the sanitizer. The model keeps emitting tool calls as text - reinforce: real function-calls only, never prose code. Consider switching CB_HANDLER_MODEL.`);
  }
  if ((counts['forced-reply'] || 0) >= 3) {
    candidates.push(`- ${today}: AUDIT found ${counts['forced-reply']} forced-reply invocations (model returned text with no tool_call). Always end with a real basecamp_reply tool call, then finish.`);
  }
  const added = [];
  for (const line of candidates) {
    const sig = line.split(': ')[1].slice(0, 40);
    if (!existing.includes(sig)) { fs.appendFileSync(LESSONS_PATH, line + '\n'); added.push(line); }
  }
  if (added.length) console.log(`[learn] appended ${added.length} lesson(s) to cb-lessons.md`);
  return added;
}

async function emailDigest({ rows, defectRows, counts, total }) {
  if (!DO_EMAIL) return;
  const nodemailer = require(path.resolve(REPO, 'node_modules/nodemailer'));
  if (!process.env.MANDRILL_API_KEY) { console.error('MANDRILL_API_KEY not set; skipping email'); return; }
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const clean = total - defectRows.length;
  const statusColor = defectRows.length === 0 ? '#16a34a' : '#dc2626';
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:arial,sans-serif;color:#1a202c">
<div style="max-width:760px;margin:0 auto;background:white">
<div style="background:#0f172a;color:white;padding:22px 28px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">CB response-quality audit</div>
<div style="font-size:21px;font-weight:700;margin-top:4px">${new Date().toISOString().slice(0, 10)} &middot; ${clean}/${total} clean</div>
</div>
${defectRows.length ? `<div style="padding:18px 28px;background:#fee2e2"><strong style="color:${statusColor}">${defectRows.length} defective response(s)</strong></div>` : `<div style="padding:18px 28px;background:#dcfce7;color:#16a34a;font-weight:700">All ${total} responses clean.</div>`}
<div style="padding:20px 28px">
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0">
<thead><tr style="background:#1a365d;color:white"><th style="padding:7px 10px;text-align:left">When</th><th style="padding:7px 10px;text-align:left">Requester</th><th style="padding:7px 10px;text-align:left">Tools</th><th style="padding:7px 10px;text-align:left">Issues</th></tr></thead>
<tbody>${rows.map((r) => `<tr style="background:${r.ok ? '#fff' : '#fef2f2'}"><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">${esc(r.ts)}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${esc(r.requester)}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">${esc(r.tools)}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#7f1d1d">${r.defects.map(esc).join('<br>') || '-'}</td></tr>`).join('')}</tbody>
</table>
</div></div></body></html>`;
  const text = `CB response-quality audit ${new Date().toISOString().slice(0, 10)}: ${clean}/${total} clean.\n` +
    defectRows.map((r) => `- ${r.ts} ${r.requester}: ${r.defects.join('; ')}`).join('\n');
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"CB Quality Audit" <ali@colaberry.com>', to: 'ali@colaberry.com',
    subject: `[CB Quality] ${clean}/${total} clean${defectRows.length ? ` - ${defectRows.length} defects` : ''}`,
    text, html, headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('[quality-audit] emailed:', r.messageId);
}

module.exports = { classify, summarize };

if (require.main === module) {
  (async () => {
    const { error, entries } = readEntries();
    if (error) { console.error(error); process.exit(1); }
    if (entries.length === 0) { console.log('No invocations logged yet.'); process.exit(0); }
    const summary = summarize(entries);
    const defects = printReport(summary);
    learn(summary.counts);
    await emailDigest(summary);
    process.exit(defects > 0 ? 2 : 0);
  })().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
}
