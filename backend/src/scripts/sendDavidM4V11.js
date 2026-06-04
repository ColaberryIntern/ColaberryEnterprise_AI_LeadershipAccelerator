#!/usr/bin/env node
// David M4 V11 reply. 4 edits from his 6/3 8:51 PM email:
// 1. Restructure footer Colaberry column: logo + QR centered above URL
// 2. Photos elongated where the layout allowed
// 3. Bleed-out (no border, ad goes edge-to-edge)
// 4. Form factor locked to canonical NRECA RE Magazine half-page horizontal
//    (7" x 4.5" trim, 7.25" x 4.75" bleed)

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const REPO = path.resolve(__dirname, '../../..');
const HTML_PATH = path.join(REPO, 'docs/m4-v11-standalone.html');
const PDF_PATH  = path.join(REPO, 'docs/m4-v11-press-ready.pdf');
const M4_PNG    = path.join(REPO, 'tmp/m4-v10-source.png');
const LOGO_PATH = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');

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
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mockup 4 V11 - your 4 changes applied + final spec locked</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800;line-height:1.3;color:white">David - V11. Colaberry footer restructured, ad bleeds edge to edge, half-page horizontal trim locked.</h1>
</div>

<div style="padding:24px 28px">

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">David,</p>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">All 4 changes from your 8:51 PM email are applied. PDF + HTML attached.</p>

<div style="margin:16px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<img src="cid:mockup4v11" alt="Mockup 4 V11" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
<div style="margin-top:10px;font-size:12px;color:#475569;font-style:italic">Mockup 4 V11 - 7" x 4.5" trim, bleed out</div>
</div>

<h2 style="font-family: arial, sans-serif; font-size:16px;margin:20px 0 10px;color:#1a365d">Your 4 changes</h2>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family: arial, sans-serif; font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:46%">Your ask</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:54%">What I changed</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#2d3748">Pull QR above the URL; Colaberry logo + QR float centered above so NRECA black logo has room to be more centered.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Colaberry footer column restructured: logo + QR sit side-by-side centered, URL line goes below. NRECA column now reads as the visual anchor in the middle. SCAN label kept under the QR.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#2d3748">Photos elongated within layout constraints.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done within the constraint. Tile min-height bumped so each photo background fills more vertical area at the half-page trim. The five-across grid + the 7" x 4.5" aspect cap how much further they can stretch without breaking layout, which matches your "understand the constraints" call.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#2d3748">Bleed out, not constrained in a border.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Border removed from the ad. PDF renders the artwork edge-to-edge across the full 7.25" x 4.75" bleed page. The red top bar + dark hero strip + ROI strip all extend to the bleed edge so when the page trims to 7" x 4.5" no white shows at the cut.</td></tr>
<tr><td style="padding:10px 14px;vertical-align:top;color:#2d3748">Pick form factor from NRECA media kit.</td><td style="padding:10px 14px;vertical-align:top;color:#14532d">Done. Locked to the standard NRECA RE Magazine half-page horizontal: 7" x 4.5" trim with 0.125" bleed each side (7.25" x 4.75" final page). RGB color (printer converts to CMYK). One PDF this time, no choices - that is the file going to Sarah Faconti.</td></tr>
</tbody>
</table>

<h2 style="font-family: arial, sans-serif; font-size:16px;margin:24px 0 10px;color:#1a365d">Two artifacts attached</h2>
<ul style="font-family: arial, sans-serif; font-size:13px;color:#2d3748;margin:0;padding-left:22px;line-height:1.7">
<li><strong>m4-v11-press-ready.pdf</strong> (264 KB) - the file for Sarah. 7.25" x 4.75" bleed page, 7" x 4.5" trim, bleed-out, RGB.</li>
<li><strong>M4-RE-Magazine-V11-standalone.html</strong> (332 KB) - same V11 rendered as a standalone HTML for browser preview / forwarding internally.</li>
</ul>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; margin:18px 0 0">Catch the flight; V11 is the lock unless you flag something specific. If a change comes after you land, ping me and I rebuild same-day.</p>

</div>

${SIG_HTML}

</div>`;

const TEXT = `David,

All 4 changes from your 8:51 PM email are applied. PDF + HTML attached.

YOUR 4 CHANGES:
1. Pull QR above URL; logo + QR centered to give NRECA room - DONE. Colaberry footer column restructured: logo + QR sit side-by-side centered, URL line goes below. NRECA column now reads as the visual anchor.
2. Photos elongated within layout constraints - DONE. Tile min-height bumped; the 5-across grid + 7"x4.5" aspect cap how much further they can stretch without breaking layout.
3. Bleed out, not constrained in a border - DONE. Border removed. PDF renders artwork edge-to-edge across the full 7.25" x 4.75" bleed page.
4. Pick form factor from NRECA media kit - DONE. Locked to NRECA RE Magazine half-page horizontal standard: 7" x 4.5" trim with 0.125" bleed (7.25" x 4.75" final page). RGB. One PDF, no choices.

TWO ARTIFACTS ATTACHED:
- m4-v11-press-ready.pdf (264 KB) - the file for Sarah
- M4-RE-Magazine-V11-standalone.html (332 KB) - browser preview / internal forwarding

Catch the flight; V11 is the lock unless you flag something specific. Ping me when you land if anything changes.

${SIG_TEXT}`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9955562788,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'dlahme@colaberry.com',
    cc: ['ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Open for Advertising - RE Magazine - M4 V11 (4 changes + 7x4.5 trim locked + bleed out)',
    html: HTML,
    text: TEXT,
    attachments: [
      { filename: 'm4-v11-press-ready.pdf', content: fs.readFileSync(PDF_PATH), contentType: 'application/pdf' },
      { filename: 'M4-RE-Magazine-V11-standalone.html', content: fs.readFileSync(HTML_PATH), contentType: 'text/html' },
      { filename: 'mockup-4-v11.png', content: fs.readFileSync(M4_PNG), cid: 'mockup4v11' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    bcSummary: '<p>V11 to David. Four changes from his 6/3 8:51 PM email applied: (1) Colaberry footer column restructured - logo + QR centered above URL line, NRECA black logo gets the centered breathing room he asked for; (2) photos elongated within the half-page layout constraint per his own "understand the constraints" call; (3) bleed-out - border removed from ad, PDF renders edge-to-edge across 7.25 x 4.75 bleed page; (4) form factor locked to canonical NRECA RE Magazine half-page horizontal 7" x 4.5" trim with 0.125" bleed - one PDF, no more dimension options. Branded signature included.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
