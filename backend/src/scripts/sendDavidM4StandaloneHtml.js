#!/usr/bin/env node
// David M4 V8 standalone HTML send. Self-contained HTML file (images
// inlined as base64) so David can open in any browser, share via email,
// or embed in a web page without asset dependencies.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const REPO = path.resolve(__dirname, '../../..');
const HTML_PATH = path.join(REPO, 'docs/m4-v8-standalone.html');
const M4_THUMB = path.join(REPO, 'tmp/mockup-thumb-4.png');
const LOGO_PATH = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white">

<div style="background:#0f172a;color:white;padding:24px 28px">
<img src="cid:logo" alt="Colaberry" style="height:30px;display:block;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mockup 4 V8 - standalone HTML</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800;line-height:1.3">David - here is the HTML version. Self-contained, opens in any browser, no PDF reader needed.</h1>
</div>

<div style="padding:24px 28px">

<p style="font-size:14px;color:#1f2937;margin:0 0 14px">David,</p>

<p style="font-size:14px;color:#1f2937;margin:0 0 14px">Per your ask. M4 V8 (the press-ready lock from earlier) packaged as a single self-contained HTML file. All images are inlined - no external dependencies, no folders to keep together. Double-click to open in any browser.</p>

<div style="margin:16px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<img src="cid:mockup4preview" alt="Mockup 4 V8 - preview" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
<div style="margin-top:10px;font-size:12px;color:#475569;font-style:italic">M4 V8 - what the standalone HTML renders to</div>
</div>

<h2 style="font-size:16px;margin:20px 0 10px;color:#0f172a">What you can do with it</h2>
<ul style="font-size:13px;color:#1f2937;margin:0 0 14px;padding-left:22px;line-height:1.7">
<li><strong>View it</strong> - open in Chrome / Safari / Edge / Firefox. Renders identical to the PDF.</li>
<li><strong>Share it</strong> - forward this email + the attachment to anyone (NRECA, internal stakeholders); they open it the same way.</li>
<li><strong>Embed it</strong> - drop the file on a web server and link to it, or copy the HTML body into an email campaign.</li>
<li><strong>Print it</strong> - browser print menu &rarr; Save as PDF gives you the same press-ready PDF I sent earlier (7.25" x 4.8" trim).</li>
</ul>

<h2 style="font-size:16px;margin:20px 0 10px;color:#0f172a">Same lock as the PDF</h2>
<p style="font-size:13px;color:#475569;margin:0">All V8 edits preserved: red bar "FIVE AI PRODUCTS / BUILT FOR COOPERATIVE UTILITIES", dark hero strip with "RUNS ON YOUR STACK / ON-PREM OR CLOUD / SOC 2 + NERC CIP" + Logan Voss / Unsplash credit, Georgia headline "Pick the one that solves your sharpest pain. Use the rest when you're ready.", sub-line, 5 renamed tiles (Outage IQ / Crew Productivity / Member Voice / Rate Case Automation / Regulatory Compliance), tightened white text to yellow rule, red ROI strip with "ROI for AI AUTOMATION in UNDER 90 DAYS", NRECA black centered, SCAN under QR, "Please contact:" right-justified above your name.</p>

<p style="font-size:13px;color:#475569;margin:14px 0 0">If you want me to host it at a public URL too (so you can just share a link instead of an attachment), say the word.</p>

</div>

<div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `David - here is the HTML version. Self-contained, opens in any browser, no PDF reader needed.

Per your ask. M4 V8 (the press-ready lock from earlier) packaged as a single self-contained HTML file. All images are inlined - no external dependencies, no folders to keep together. Double-click to open in any browser.

WHAT YOU CAN DO WITH IT:
- View it - open in Chrome / Safari / Edge / Firefox. Renders identical to the PDF.
- Share it - forward this email + attachment to anyone (NRECA, internal stakeholders); they open it the same way.
- Embed it - drop the file on a web server and link to it, or copy the HTML body into an email campaign.
- Print it - browser print menu > Save as PDF gives you the same press-ready PDF I sent earlier.

SAME LOCK AS THE PDF: all V8 edits preserved (red bar, dark hero strip with photo credit, Georgia headline, sub-line, 5 renamed tiles with tightened white text, red ROI strip, NRECA black centered, SCAN under QR, "Please contact:" right-justified above your name).

If you want me to host it at a public URL too (so you can just share a link instead of an attachment), say the word.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9955562788,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'dlahme@colaberry.com',
    cc: ['ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Open for Advertising - RE Magazine - M4 V8 standalone HTML',
    html: HTML,
    text: TEXT,
    attachments: [
      { filename: 'M4-RE-Magazine-standalone-2026-06-03.html', content: fs.readFileSync(HTML_PATH), contentType: 'text/html' },
      { filename: 'mockup-4-preview.png', content: fs.readFileSync(M4_THUMB), cid: 'mockup4preview' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    bcSummary: '<p>Sent David the M4 V8 standalone HTML version (self-contained, images inlined as base64, opens in any browser). Per Ali heard off-channel that David wanted "another HTML format". File: M4-RE-Magazine-standalone-2026-06-03.html (1.7MB). All V8 edits preserved (red bar / dark hero strip / Georgia headline / 5 renamed tiles / red ROI strip / NRECA black / SCAN / Please contact). Offered to host at a public URL if he wants link-instead-of-attachment.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
