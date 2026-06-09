#!/usr/bin/env node
// David M4 V8 reply. Top portion restored per his Jun 2 7:56 AM screenshot.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const REPO = path.resolve(__dirname, '../../..');
const PDF_PATH = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.pdf');
const M4_THUMB = path.join(REPO, 'tmp/mockup-thumb-4.png');
const LOGO_PATH = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white">

<div style="background:#0f172a;color:white;padding:24px 28px">
<img src="cid:logo" alt="Colaberry" style="height:30px;display:block;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mockup 4 V8 - top portion restored</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800;line-height:1.3">David - the picture made it easy. Top portion from your Jun 2 7:56 AM version is back in.</h1>
</div>

<div style="padding:24px 28px">

<p style="font-size:14px;color:#1f2937;margin:0 0 14px">David,</p>

<p style="font-size:14px;color:#1f2937;margin:0 0 14px">Pulled your screenshot. Restored every line of the top portion you wanted back:</p>

<div style="margin:16px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<img src="cid:mockup4v8" alt="Mockup 4 V8 - top portion restored" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
<div style="margin-top:10px;font-size:12px;color:#475569;font-style:italic">Mockup 4 V8 - at the 1.54:1 half-page horizontal trim</div>
</div>

<h2 style="font-size:16px;margin:20px 0 10px;color:#0f172a">Lifted from your screenshot, line for line</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:40%">Layer</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:60%">Restored content</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Red top bar (replaced V7 wording)</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">FIVE AI PRODUCTS &middot; BUILT FOR COOPERATIVE UTILITIES</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Dark hero strip (new)</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">RUNS ON YOUR STACK &middot; ON-PREM OR CLOUD &middot; SOC 2 + NERC CIP &middot; with "Logan Voss / Unsplash" credit right-justified.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Georgia serif headline (new)</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Pick the one that solves your sharpest pain.<br>Use the rest when you're ready.</td></tr>
<tr><td style="padding:10px 14px;vertical-align:top">Sub-line small print (new)</td><td style="padding:10px 14px;vertical-align:top;color:#14532d">All five run on your stack: on-prem, AWS, Azure, or GCP. SOC 2 + NERC CIP documented. No model training on your data. Pilot in 30 days.</td></tr>
</tbody>
</table>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">One small clarification on the dark strip</h2>
<div style="background:#fef9c3;border:1px solid #f59e0b;border-radius:8px;padding:16px 20px;margin-bottom:14px">
<div style="font-size:13px;color:#451a03;line-height:1.55">
For the dark photo strip I used a charcoal navy gradient with subtle red + green pinpoints that reads the same as the Logan Voss / Unsplash photo in your screenshot. <strong>If you want the literal photo embedded instead, send me the Unsplash URL</strong> (or just the photographer + slug) and I swap it in before press handoff. Visually the difference is minor at the half-page trim; functionally a real photo would print slightly richer.
</div>
</div>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">Everything V7 still in place</h2>
<p style="font-size:13px;color:#475569;margin:0">All your "lastest edits" land was preserved: tile renames (Crew Productivity / Rate Case Automation / Regulatory Compliance), Outage IQ desc rewrite, white text tightened to the yellow rule, NRECA badge black + centered, ROI strip red + new copy, SCAN under QR, "Please contact:" right-justified above your name.</p>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">Three still-open from V6/V7 (no response yet)</h2>
<div style="background:#0f172a;color:white;padding:14px 18px;border-radius:8px;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q1 - Lock M4 + kill M1/M2/M3/M5</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">All edits since V4 have been M4-only. Confirm and I drop the other 4 mockups, push 100% on press-ready M4 PDF for Thursday EOD.</div>
</div>
<div style="background:#0f172a;color:white;padding:14px 18px;border-radius:8px;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q2 - ROI numbers, defensibility</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">$180K per outage / 7-min RCA / 38% / 60% / +12 NPS / 3 weeks to 4 days / $50K/yr - which to keep, which to soften, which need a hard source before press?</div>
</div>
<div style="background:#0f172a;color:white;padding:14px 18px;border-radius:8px;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q3 - 5 vs 8 tiles + the "better titles" you remembered</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">5 was the half-page legibility max. Want me to show the 6/8 variants side-by-side, or upgrade to a full page so 8 tiles read at the same legibility 5 does now? Also - if you remember the better titles from the original 8, paste them and I'll wire them in.</div>
</div>

<p style="font-size:14px;color:#1f2937;margin:18px 0 0">PDF attached. Same Thursday EOD press-ready target if you greenlight V8 as the lock.</p>

</div>

<div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `David - the picture made it easy. Top portion from your Jun 2 7:56 AM version is back in.

RESTORED FROM YOUR SCREENSHOT (line for line):
- Red top bar: "FIVE AI PRODUCTS - BUILT FOR COOPERATIVE UTILITIES"
- Dark hero strip: "RUNS ON YOUR STACK - ON-PREM OR CLOUD - SOC 2 + NERC CIP" + "Logan Voss / Unsplash" credit right-justified
- Georgia headline: "Pick the one that solves your sharpest pain. Use the rest when you're ready."
- Sub-line: "All five run on your stack: on-prem, AWS, Azure, or GCP. SOC 2 + NERC CIP documented. No model training on your data. Pilot in 30 days."

ONE CLARIFICATION on the dark strip: I used a charcoal navy gradient with subtle red + green pinpoints that reads the same as the Logan Voss photo. If you want the literal photo embedded instead, send the Unsplash URL (or photographer + slug) and I'll swap before press. Visual difference is minor at half-page trim.

EVERYTHING V7 STILL IN PLACE: tile renames (Crew Productivity / Rate Case Automation / Regulatory Compliance), Outage IQ desc rewrite, white text tightened to yellow rule, NRECA black + centered, ROI strip red + new copy, SCAN under QR, "Please contact:" right-justified above your name.

STILL OPEN (no response yet):
Q1 - Lock M4 + kill M1/M2/M3/M5? All edits since V4 have been M4-only - reading as soft lock.
Q2 - ROI numbers defensibility ($180K, 7-min, 38%, etc.) - which to keep / soften / source-back?
Q3 - 5 vs 8 tiles + the "better titles" from the original 8 - paste them and I'll wire in. Or show the 6/8 variants side-by-side?

PDF attached. Same Thursday EOD press-ready target if you greenlight V8 as the lock.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9955562788,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'dlahme@colaberry.com',
    cc: ['ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Open for Advertising - RE Magazine - M4 V8 (top portion restored per your screenshot)',
    html: HTML,
    text: TEXT,
    attachments: [
      { filename: 'coop-ad-mockups-2026-06-02.pdf', content: fs.readFileSync(PDF_PATH), contentType: 'application/pdf' },
      { filename: 'mockup-4-v8.png', content: fs.readFileSync(M4_THUMB), cid: 'mockup4v8' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    bcSummary: '<p>Reply to David with M4 V8 (top portion restored per his Jun 2 7:56 AM screenshot). Lifted line-for-line: red bar "FIVE AI PRODUCTS / BUILT FOR COOPERATIVE UTILITIES", dark hero strip "RUNS ON YOUR STACK / ON-PREM OR CLOUD / SOC 2 + NERC CIP" with Logan Voss / Unsplash credit, Georgia headline "Pick the one that solves your sharpest pain / Use the rest when you are ready", sub-line "All five run on your stack: on-prem, AWS, Azure, or GCP. SOC 2 + NERC CIP documented. No model training on your data. Pilot in 30 days." Dark strip uses gradient placeholder for the Unsplash photo (swap at press if David sends URL). V7 changes preserved. V6/V7 carryovers (lock M4 / ROI defensibility / 5-vs-8 titles) re-surfaced. Mandrill + BC comment + Vault upload via sendWithBcAttach.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
