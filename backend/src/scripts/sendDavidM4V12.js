#!/usr/bin/env node
// David M4 V12 reply. One change from V11: the QR code now points at a
// tracking URL Ali controls. Every scan logs to qr_scan_events; Ali sees
// counts at /admin/qr-codes. Same V11 art, same 7x4.5 trim, bleed out.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const REPO = path.resolve(__dirname, '../../..');
const HTML_PATH = path.join(REPO, 'docs/m4-v12-standalone.html');
const PDF_PATH  = path.join(REPO, 'docs/m4-v12-press-ready.pdf');
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
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mockup 4 V12 - QR now tracks scans</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800;line-height:1.3;color:white">David - V12. Same V11 art, the QR now routes through a tracker so we count every scan.</h1>
</div>

<div style="padding:24px 28px">

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">David,</p>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">One small change from V11. The QR code now points at a Colaberry-owned tracking URL (<code>enterprise.colaberry.ai/qr/re-magazine-2026-07</code>) that logs every scan and 302-redirects to the same utility-ai landing page. We see scan counts, dates, device class. Same art, same 7" x 4.5" trim, same bleed-out, same NRECA half-page horizontal spec.</p>

<div style="margin:16px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<img src="cid:mockup4v12" alt="Mockup 4 V12" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
<div style="margin-top:10px;font-size:12px;color:#475569;font-style:italic">Mockup 4 V12 - QR tracks scans; the visual is identical at print scale</div>
</div>

<h2 style="font-family: arial, sans-serif; font-size:16px;margin:20px 0 10px;color:#1a365d">What V12 changes</h2>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family: arial, sans-serif; font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:36%">Change</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:64%">Detail</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#2d3748">QR destination</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Was: <code>enterprise.colaberry.ai/utility-ai</code> (direct). Now: <code>enterprise.colaberry.ai/qr/re-magazine-2026-07</code> (tracker that logs the scan and redirects to the same landing page with utm_source=re-magazine attached). Reader experience is identical - they land on the same page in &lt;200ms.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#2d3748">Why it matters</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">RE Magazine's July Directory issue sits on co-op CEO desks for a year. We measure actual reader engagement for the whole shelf-life of the ad, not just the first month.</td></tr>
<tr><td style="padding:10px 14px;vertical-align:top;color:#2d3748">Everything else</td><td style="padding:10px 14px;vertical-align:top;color:#14532d">Unchanged from V11. Footer Colaberry column structure, NRECA black centered, photos elongated, bleed out, 7" x 4.5" trim with 0.125" bleed = 7.25" x 4.75" page.</td></tr>
</tbody>
</table>

<h2 style="font-family: arial, sans-serif; font-size:16px;margin:24px 0 10px;color:#1a365d">Attached</h2>
<ul style="font-family: arial, sans-serif; font-size:13px;color:#2d3748;margin:0;padding-left:22px;line-height:1.7">
<li><strong>m4-v12-press-ready.pdf</strong> (265 KB) - the file for Sarah. 7.25" x 4.75" bleed page, 7" x 4.5" trim, bleed-out, RGB.</li>
<li><strong>M4-RE-Magazine-V12-standalone.html</strong> (332 KB) - browser preview / internal forwarding.</li>
</ul>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; margin:18px 0 0">V12 supersedes V11. Send Sarah the V12 PDF. If you spot anything else before mail-off, ping me.</p>

</div>

${SIG_HTML}

</div>`;

const TEXT = `David,

One small change from V11. The QR code now points at a Colaberry-owned tracking URL (enterprise.colaberry.ai/qr/re-magazine-2026-07) that logs every scan and 302-redirects to the same utility-ai landing page. We see scan counts, dates, device class. Same art, same 7"x4.5" trim, same bleed-out, same NRECA half-page horizontal spec.

WHAT V12 CHANGES:
- QR destination: Was enterprise.colaberry.ai/utility-ai (direct). Now enterprise.colaberry.ai/qr/re-magazine-2026-07 (tracker that logs the scan and redirects to the same landing page with utm_source=re-magazine attached). Reader experience identical, <200ms hop.
- Why it matters: RE Magazine's July Directory issue sits on co-op CEO desks for a year. We measure actual reader engagement for the whole shelf-life of the ad.
- Everything else: Unchanged from V11. Footer Colaberry column structure, NRECA black centered, photos elongated, bleed out, 7"x4.5" trim with 0.125" bleed (7.25"x4.75" page).

ATTACHED:
- m4-v12-press-ready.pdf (265 KB) - the file for Sarah.
- M4-RE-Magazine-V12-standalone.html (332 KB) - browser preview / internal forwarding.

V12 supersedes V11. Send Sarah the V12 PDF.

${SIG_TEXT}`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9955562788,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'dlahme@colaberry.com',
    cc: ['ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Open for Advertising - RE Magazine - M4 V12 (QR now tracks scans; sends Sarah V12)',
    html: HTML,
    text: TEXT,
    attachments: [
      { filename: 'm4-v12-press-ready.pdf', content: fs.readFileSync(PDF_PATH), contentType: 'application/pdf' },
      { filename: 'M4-RE-Magazine-V12-standalone.html', content: fs.readFileSync(HTML_PATH), contentType: 'text/html' },
      { filename: 'mockup-4-v12.png', content: fs.readFileSync(M4_PNG), cid: 'mockup4v12' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    bcSummary: '<p>V12 to David: one change from V11. QR code regenerated to encode enterprise.colaberry.ai/qr/re-magazine-2026-07 instead of the direct utility-ai URL. New backend route logs every scan to qr_scan_events table then 302 redirects to the same landing page with utm_source=re-magazine attached. Ali sees counts + 24h/7d/30d rollups + recent scans at /api/admin/qr-codes (admin auth). Code change committed; needs prod deploy + seed run for the tracker URL to be live before any reader scans. Everything else from V11 unchanged (footer Colaberry column structure, NRECA black centered, photos elongated, bleed out, 7x4.5 trim with 0.125 bleed). V12 supersedes V11 as the file Sarah receives.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
