#!/usr/bin/env node
// Quick follow-up to David: the previous HTML attachment had image references
// that broke once downloaded. Re-sending the standalone version (all images
// embedded as base64 data URIs).
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const REPO = path.resolve(__dirname, '../../..');
const HTML_PATH = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02-standalone.html');
const LOGO_PATH = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');

const EMAIL = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:680px;margin:0 auto;background:white">

<div style="background:#0f172a;color:white;padding:24px 28px">
<img src="cid:logo" alt="Colaberry" style="height:30px;display:block;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Quick fix - downloadable HTML</div>
<h1 style="margin:6px 0 6px;font-size:18px;font-weight:800;line-height:1.3">David - the previous HTML attachment lost its images once you opened it. Standalone version attached.</h1>
</div>

<div style="padding:22px 28px">
<p style="font-size:14px;color:#1f2937;margin:0 0 12px">David,</p>
<p style="font-size:14px;color:#1f2937;margin:0 0 12px">My mistake - the HTML I sent earlier referenced images by file path, which works on my machine but breaks when you download the file to yours. I should have caught that before sending.</p>
<p style="font-size:14px;color:#1f2937;margin:0 0 12px">Re-attached as <strong>coop-ad-mockups-2026-06-02-standalone.html</strong> with every image embedded directly inside the file. Should work cleanly now - download it, open in any browser, all 5 mockups + the tile photography + the logo all render.</p>
<p style="font-size:14px;color:#1f2937;margin:0 0 12px">Same review flow as before - scroll, pick verdict + notes per concept, click Generate Reply at the bottom, paste back to me.</p>
<p style="font-size:14px;color:#1f2937;margin:0">Thursday EOD deadline still holds. Sorry for the back-and-forth.</p>
</div>

<div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = strip(`David - my mistake. The previous HTML lost its images when downloaded because they were referenced by file path. Standalone version attached with every image embedded inline.

Open the new coop-ad-mockups-2026-06-02-standalone.html in any browser - all 5 mockups + photos + logo render cleanly. Same review flow: pick verdict + notes per concept, Generate Reply at bottom, paste back to me.

Thursday EOD deadline still holds. Sorry for the back-and-forth.

Ali`);

(async () => {
  validateBeforeSend(EMAIL, TEXT);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'dlahme@colaberry.com',
    cc: ['ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Open for Advertising - RE Magazine - fixed HTML (images now embedded)',
    text: TEXT, html: EMAIL,
    attachments: [
      { filename: 'coop-ad-mockups-2026-06-02-standalone.html', content: fs.readFileSync(HTML_PATH), contentType: 'text/html' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
