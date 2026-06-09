#!/usr/bin/env node
// David M4 V10.1 - send 2 narrower-width variants for when the 7"-wide
// V10 PDFs prove too wide for Sarah's media kit. Same height (4.5"),
// narrower widths, ad fills each page edge-to-edge (no whitespace).
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const REPO = path.resolve(__dirname, '../../..');
const PDF_MEDIUM  = path.join(REPO, 'docs/m4-v10-medium-6.938x4.5.pdf');
const PDF_NARROW  = path.join(REPO, 'docs/m4-v10-narrow-5.259x4.5.pdf');
const MEDIUM_PNG  = path.join(REPO, 'tmp/m4-v10-medium-debug.png');
const NARROW_PNG  = path.join(REPO, 'tmp/m4-v10-narrow-debug.png');
const LOGO_PATH   = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 20px;">
  <tr><td>
    <div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
    <div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
    <div style="color: #718096;">Colaberry Inc.</div>
    <div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
    <div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
    <div style="margin-top: 14px;">
      <a href="https://advisor.colaberry.ai/advisory" style="display: inline-block; background: #2b6cb0; color: #ffffff; padding: 9px 18px; border-radius: 20px; text-decoration: none; font-weight: 600;">Design Your AI Organization</a>
    </div>
  </td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com  |  enterprise.colaberry.ai
Design Your AI Organization: https://advisor.colaberry.ai/advisory`;

const HTML = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.55; max-width: 760px;">

<div style="background:#0f172a;color:white;padding:24px 28px;border-radius:8px 8px 0 0">
<img src="cid:logo" alt="Colaberry" style="height:30px;display:block;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mockup 4 V10 - narrower trim options</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800;line-height:1.3;color:white">David - two narrower options in case the 7" wide PDFs do not match Sarah's media kit. Same height, ad fills edge to edge.</h1>
</div>

<div style="padding:24px 28px">

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">David,</p>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">Two more PDF options on top of the three I sent earlier. Same V10 content, same 4.5" trim height, but narrower widths so you have flexibility if Sarah's media kit calls for something tighter than the 7" wide half-page horizontal. The ad fills each page edge to edge - no whitespace bars - because the source was re-rendered at narrower widths so the natural layout fits the page aspect.</p>

<h2 style="font-family: arial, sans-serif; font-size:16px;margin:20px 0 10px;color:#1a365d">The two new options</h2>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family: arial, sans-serif; font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">File</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">Trim</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">When this fits</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#2d3748">m4-v10-medium-6.938x4.5.pdf</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#2d3748"><strong>6.938" x 4.5"</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#2d3748">Slightly narrower than canonical half-page horizontal. Tile content still reads cleanly.</td></tr>
<tr><td style="padding:10px 14px;color:#2d3748">m4-v10-narrow-5.259x4.5.pdf</td><td style="padding:10px 14px;color:#2d3748"><strong>5.259" x 4.5"</strong></td><td style="padding:10px 14px;color:#2d3748">Third-page horizontal placement. Tile descriptions tighten but the layout holds.</td></tr>
</tbody>
</table>

<div style="margin:18px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<div style="font-size:11px;color:#475569;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;margin-bottom:6px">6.938" x 4.5" - medium</div>
<img src="cid:mediumpreview" alt="M4 V10 medium 6.938x4.5" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
</div>

<div style="margin:14px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<div style="font-size:11px;color:#475569;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;margin-bottom:6px">5.259" x 4.5" - narrow</div>
<img src="cid:narrowpreview" alt="M4 V10 narrow 5.259x4.5" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
</div>

<h2 style="font-family: arial, sans-serif; font-size:16px;margin:24px 0 10px;color:#1a365d">Full lineup you now have</h2>
<ul style="font-family: arial, sans-serif; font-size:13px;color:#2d3748;margin:0;padding-left:22px;line-height:1.7">
<li>7" x 4.5" canonical (sent earlier today)</li>
<li>7" x 4.55" current iteration (sent earlier today)</li>
<li>7" x 4.625" alt spec (sent earlier today)</li>
<li><strong>6.938" x 4.5" medium (new, this email)</strong></li>
<li><strong>5.259" x 4.5" narrow (new, this email)</strong></li>
<li>m4-v10-standalone.html responsive HTML (sent earlier today)</li>
</ul>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; margin:18px 0 0">Pick the one that matches Sarah's media kit and let me know which - I will drop the others. No rush, after your meeting is fine.</p>

</div>

${SIG_HTML}

</div>`;

const TEXT = `David,

Two more PDF options on top of the three I sent earlier. Same V10 content, same 4.5" trim height, but narrower widths so you have flexibility if Sarah's media kit calls for something tighter than 7" wide half-page horizontal. The ad fills each page edge to edge - no whitespace bars - because the source was re-rendered at narrower widths so the natural layout fits the page aspect.

THE TWO NEW OPTIONS:
- m4-v10-medium-6.938x4.5.pdf - 6.938" x 4.5" - slightly narrower than canonical half-page horizontal, tile content still reads cleanly
- m4-v10-narrow-5.259x4.5.pdf - 5.259" x 4.5" - third-page horizontal placement, tile descriptions tighten but the layout holds

FULL LINEUP YOU NOW HAVE:
- 7" x 4.5" canonical (sent earlier today)
- 7" x 4.55" current iteration (sent earlier today)
- 7" x 4.625" alt spec (sent earlier today)
- 6.938" x 4.5" medium (new, this email)
- 5.259" x 4.5" narrow (new, this email)
- m4-v10-standalone.html responsive HTML (sent earlier today)

Pick the one that matches Sarah's media kit and let me know which - I will drop the others. No rush, after your meeting is fine.

${SIG_TEXT}`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9955562788,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'dlahme@colaberry.com',
    cc: ['ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Open for Advertising - RE Magazine - M4 V10 narrower trim options (two more)',
    html: HTML,
    text: TEXT,
    attachments: [
      { filename: 'm4-v10-medium-6.938x4.5.pdf', content: fs.readFileSync(PDF_MEDIUM), contentType: 'application/pdf' },
      { filename: 'm4-v10-narrow-5.259x4.5.pdf', content: fs.readFileSync(PDF_NARROW), contentType: 'application/pdf' },
      { filename: 'medium-preview.png', content: fs.readFileSync(MEDIUM_PNG), cid: 'mediumpreview' },
      { filename: 'narrow-preview.png', content: fs.readFileSync(NARROW_PNG), cid: 'narrowpreview' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    bcSummary: '<p>V10.1 to David: 2 narrower-width PDF variants on top of the 3 wide V10 PDFs sent earlier. Same V10 content + 4.5" trim height, narrower widths (6.938" and 5.259"). Source re-rendered at narrower viewport widths so the ad fills each page edge-to-edge (no whitespace bars). David has 5 PDF options + standalone HTML total now. Pre-send checks pass: no em-dashes, branded signature in HTML + text body, no redundant Ali sign-off. Ali sent because David already left for meeting and wants options queued.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
