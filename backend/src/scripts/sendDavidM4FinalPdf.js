#!/usr/bin/env node
// David M4 V8 final press-ready PDF send. Locks V8 as the press version
// per Ali's "looks like he's ready to finalize and wants a pdf" read.
// Attaches the press-trim PDF (7.25" x 4.8", half-page horizontal with
// 0.125" bleed) + an inline M4 thumb so David can preview without opening.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const REPO = path.resolve(__dirname, '../../..');
const PDF_PATH = path.join(REPO, 'docs/m4-pressready-2026-06-03.pdf');
const M4_THUMB = path.join(REPO, 'tmp/mockup-thumb-4.png');
const LOGO_PATH = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white">

<div style="background:#0f172a;color:white;padding:24px 28px">
<img src="cid:logo" alt="Colaberry" style="height:30px;display:block;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mockup 4 V8 - FINAL press-ready PDF</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800;line-height:1.3">David - locking V8. Press-ready PDF attached, sized to the RE Magazine half-page horizontal trim.</h1>
</div>

<div style="padding:24px 28px">

<p style="font-size:14px;color:#1f2937;margin:0 0 14px">David,</p>

<p style="font-size:14px;color:#1f2937;margin:0 0 14px">V8 in your inbox is the lock. Every concrete edit from your "lastest edits" message landed, and the top portion from your Jun 2 7:56 AM screenshot is restored. Press-ready PDF attached - this is what goes to the printer.</p>

<div style="margin:16px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<img src="cid:mockup4final" alt="Mockup 4 V8 - FINAL" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
<div style="margin-top:10px;font-size:12px;color:#475569;font-style:italic">Mockup 4 V8 - locked, press-ready</div>
</div>

<h2 style="font-size:16px;margin:20px 0 10px;color:#0f172a">PDF spec</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<tbody>
<tr><td style="padding:8px 14px;border-bottom:1px solid #e2e8f0;width:35%;color:#475569">Trim size</td><td style="padding:8px 14px;border-bottom:1px solid #e2e8f0"><strong>7.25" x 4.8"</strong> (half-page horizontal, 1.54:1)</td></tr>
<tr><td style="padding:8px 14px;border-bottom:1px solid #e2e8f0;color:#475569">Bleed</td><td style="padding:8px 14px;border-bottom:1px solid #e2e8f0">0.125" each side</td></tr>
<tr><td style="padding:8px 14px;border-bottom:1px solid #e2e8f0;color:#475569">Color</td><td style="padding:8px 14px;border-bottom:1px solid #e2e8f0">RGB (printer converts to CMYK; red <code>#dc2626</code>, navy <code>#0f172a</code>)</td></tr>
<tr><td style="padding:8px 14px;border-bottom:1px solid #e2e8f0;color:#475569">Fonts</td><td style="padding:8px 14px;border-bottom:1px solid #e2e8f0">Inter (body, tile copy), Georgia (serif headline)</td></tr>
<tr><td style="padding:8px 14px;color:#475569">File size</td><td style="padding:8px 14px">517 KB</td></tr>
</tbody>
</table>

<h2 style="font-size:16px;margin:20px 0 10px;color:#0f172a">One last swap-or-leave call</h2>
<div style="background:#fef9c3;border:1px solid #f59e0b;border-radius:8px;padding:14px 18px;margin-bottom:14px">
<div style="font-size:13px;color:#451a03;line-height:1.55">
The dark hero strip currently uses a CSS gradient (charcoal navy with red + green pinpoints) that reads as the Logan Voss / Unsplash photo from your screenshot. <strong>If you want the literal Unsplash photo embedded, reply with the URL</strong> and I swap it in a re-render before you hand off to the printer. Otherwise the current gradient ships.
</div>
</div>

<p style="font-size:13px;color:#475569;margin:0">If anything else jumps out before submission, just reply and I'll spin it - press round-trip is fast on my end.</p>

</div>

<div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `David - locking V8. Press-ready PDF attached, sized to the RE Magazine half-page horizontal trim.

V8 in your inbox is the lock. Every concrete edit from your "lastest edits" message landed, top portion from your Jun 2 7:56 AM screenshot is restored. Press-ready PDF attached - this is what goes to the printer.

PDF SPEC:
- Trim size: 7.25" x 4.8" (half-page horizontal, 1.54:1)
- Bleed: 0.125" each side
- Color: RGB (printer converts to CMYK; red #dc2626, navy #0f172a)
- Fonts: Inter (body + tile copy), Georgia (serif headline)
- File size: 517 KB

ONE LAST SWAP-OR-LEAVE CALL:
The dark hero strip currently uses a CSS gradient that reads as the Logan Voss / Unsplash photo from your screenshot. If you want the literal Unsplash photo embedded, reply with the URL and I swap before you hand off to the printer. Otherwise the current gradient ships.

If anything else jumps out before submission, just reply and I will spin it. Press round-trip is fast on my end.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9955562788,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'dlahme@colaberry.com',
    cc: ['ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Open for Advertising - RE Magazine - M4 FINAL (press-ready PDF attached)',
    html: HTML,
    text: TEXT,
    attachments: [
      { filename: 'M4-RE-Magazine-press-ready-2026-06-03.pdf', content: fs.readFileSync(PDF_PATH), contentType: 'application/pdf' },
      { filename: 'mockup-4-final.png', content: fs.readFileSync(M4_THUMB), cid: 'mockup4final' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    bcSummary: '<p>Sent David the FINAL M4 V8 press-ready PDF. Locked V8 as the lock per Ali read on David being ready to finalize. PDF specs: 7.25 x 4.8 in half-page horizontal trim with 0.125 bleed, RGB color (printer converts CMYK), Inter + Georgia fonts, 517KB. Surfaced one open swap: dark hero strip uses CSS gradient placeholder for the Logan Voss / Unsplash photo - if David sends URL we swap before printer handoff. Mandrill + BC comment + Vault upload via sendWithBcAttach. Ticket 9955562788 ready for completion mark after this send confirms.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
