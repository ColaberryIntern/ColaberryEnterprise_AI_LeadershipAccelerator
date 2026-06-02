#!/usr/bin/env node
// Send Ali the YouTube transcript pulled by tmp/fetch-youtube-transcript.py.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmtT(s) {
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../tmp/youtube-transcript.json'), 'utf8'));
const mdBuf = fs.readFileSync(path.resolve(__dirname, '../../../tmp/youtube-transcript.md'));

const paragraphsHtml = data.paragraphs.map((p) => {
  const ts = fmtT(p.t);
  const link = `https://www.youtube.com/watch?v=${data.videoId}&t=${Math.floor(p.t)}s`;
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#1f2937"><a href="${link}" style="display:inline-block;background:#fef3c7;color:#78350f;font-weight:700;font-size:11px;letter-spacing:0.5px;padding:2px 8px;border-radius:3px;text-decoration:none;margin-right:8px;vertical-align:baseline">${ts}</a>${escapeHtml(p.text)}</p>`;
}).join('\n');

const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Aptos,Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white">

<div style="background:linear-gradient(135deg,#0f172a 0%,#1a365d 100%);color:white;padding:28px 32px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">YouTube transcript</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">${escapeHtml(data.title)}</h1>
<div style="font-size:13px;color:#cbd5e0">${escapeHtml(data.author)} &middot; ${fmtT(data.lengthSeconds)} &middot; ${data.paragraphCount} paragraphs (${data.segmentCount || 'auto'} caption segments)</div>
<div style="margin-top:10px"><a href="https://www.youtube.com/watch?v=${data.videoId}" style="background:#c1272d;color:white;padding:6px 14px;border-radius:4px;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:0.5px">Open on YouTube &rarr;</a></div>
</div>

<div style="padding:20px 32px;background:#fef9e7;border-left:5px solid #d4a017;font-size:13px;color:#78350f">
<strong>Tip:</strong> every timestamp chip is a clickable link that jumps to that exact moment on YouTube. Pulled via youtube-transcript-api against the auto-generated English captions, then re-flowed into paragraphs. Markdown copy attached for note-taking.
</div>

<div style="padding:28px 32px">
${paragraphsHtml}
</div>

<div style="padding:18px 32px;background:#0f172a;color:#cbd5e0;font-size:12px">
<strong style="color:#fbbf24">Source:</strong> auto-generated YouTube captions. They are usually 95%+ accurate but stumble on proper nouns (e.g. "CustomGPT" came through as "cla design / custom GBT / custom GP / GBT" in different places). Punctuation and paragraph breaks are inferred by the script - approximate. For citation purposes click the timestamp + verify.
</div>

</div></body></html>`;

const text = strip(`${data.title}

Author: ${data.author}
Length: ${fmtT(data.lengthSeconds)}
URL: https://www.youtube.com/watch?v=${data.videoId}

Transcript (auto-generated English captions, re-flowed into paragraphs; Markdown copy attached):

${data.paragraphs.map((p) => `[${fmtT(p.t)}] ${p.text}`).join('\n\n')}
`);

(async () => {
  validateBeforeSend(html, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Claude Code (on behalf of Ali)" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    replyTo: 'claude-code@reply.colaberry.ai',
    subject: `[YouTube transcript] ${data.title}`,
    text, html,
    attachments: [
      { filename: `${data.videoId}-transcript.md`, content: mdBuf, contentType: 'text/markdown' },
    ],
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
