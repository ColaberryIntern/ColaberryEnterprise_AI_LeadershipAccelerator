#!/usr/bin/env node
// V2: 5 ad mockups now with real photography embedded (Unsplash licensed for
// commercial use). Reply to Ali's "no photos, too plain" feedback.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const PDF_PATH = path.resolve(__dirname, '../../../docs/coop-ad-mockups-2026-06-02.pdf');
const PDF_BUF = fs.readFileSync(PDF_PATH);

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Aptos,Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:780px;margin:0 auto;background:white">

<div style="background:linear-gradient(135deg,#0f172a 0%,#1a365d 100%);color:white;padding:28px 34px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Co-op ad mockups - V2 with photography</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800">Fixed. Real photography embedded in all 5 mockups.</h1>
<div style="font-size:14px;color:#cbd5e0">PDF re-rendered with photos. Each mockup now has a hero image treated with overlays so it sits underneath the typography, not next to it.</div>
</div>

<div style="padding:24px 34px">

<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">#</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">Mockup</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">Photography (Unsplash, free commercial use)</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>1</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px"><strong>Crew Productivity</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px">Utility pole silhouette at golden hour - Mohammad Razaghi. Left third of the ad, dark gradient overlay so the NRECA badge reads.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>2</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px"><strong>AI in Plain English</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px">Editorial portrait of mature exec (50s, glasses, tie) - Vitaly Gariev. Right edge of the ad, faded into cream so the 3 CEO question columns dominate.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>3</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px"><strong>7 Minutes</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px">Transmission lattice towers at sunset - Matthew Henry. Background of the right column, heavy charcoal overlay so the metrics + headline pop in gold + white.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>4</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px"><strong>Five Platforms (catalog)</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px">Abstract data-viz glow strip below the red top bar - Logan Voss. Bridges the bar to the white tile grid; reinforces "tech catalog" feel.</td></tr>
<tr><td style="padding:10px 14px"><strong>5</strong></td><td style="padding:10px 14px;font-size:12px"><strong>40% Workforce Crisis</strong></td><td style="padding:10px 14px;font-size:12px">Bearded veteran in white hard hat - Ricardio de Penning. + young apprentice in orange high-vis - Mufid Majnun. Split top/bottom with the red "8 YEARS" gap label between.</td></tr>
</tbody>
</table>

<div style="margin-top:20px;padding:14px 18px;background:#fef9e7;border-left:5px solid #d4a017;border-radius:0 6px 6px 0;font-size:13px;color:#78350f">
<strong>About the photography:</strong> these are stock photos from Unsplash, licensed for commercial use (no attribution required, but the credits are baked into the mockups for transparency). They're representative of the visual direction. <strong>For the actual production ad we should swap in (a) NRECA archive shots, (b) commissioned co-op crew photography, or (c) keep one of these if it tests well</strong>. Doable inside the Thursday window.
</div>

<div style="margin-top:18px;padding:16px 20px;background:#0f172a;color:white;border-radius:8px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Same review flow as before</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">PDF attached (1.9 MB now that photos are embedded). HTML at <code style="background:#1e293b;color:#fbbf24;padding:2px 6px;border-radius:3px">docs/coop-ad-mockups-2026-06-02.html</code> still has the per-mockup feedback widget. Tell me which to push to production (or remix two), photography path (commissioned / NRECA archive / keep stock), and I'll close out by Wed EOD.</div>
</div>

<div style="margin-top:16px;font-size:13px;color:#475569"><strong>Still holding</strong> - nothing goes to David or Ram until you lock the direction.</div>

</div>

<div style="padding:20px 34px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const text = strip(`Co-op ad mockups V2 - photography added.

5 mockups now have real photos embedded (Unsplash, free commercial use):
1. Crew Productivity - Utility pole silhouette at golden hour (Razaghi)
2. AI in Plain English - Editorial mature-exec portrait (Gariev), faded right edge
3. 7 Minutes - Transmission tower lattice at sunset (Henry) under charcoal overlay
4. Five Platforms - Abstract data-viz glow strip under the red top bar (Voss)
5. 40% Workforce Crisis - Veteran in white hard hat (de Penning) + young apprentice in orange high-vis (Majnun), split with red "8 YEARS" gap label

About the photography: stock placeholders for the visual direction. For the production ad we should swap in (a) NRECA archive shots, (b) commissioned co-op crew photography, or (c) keep these if they test well. Doable inside the Thursday window.

PDF attached (1.9MB). HTML local at docs/coop-ad-mockups-2026-06-02.html with per-mockup feedback widget.

Still holding - nothing goes to David or Ram until you lock direction.

Ali`);

(async () => {
  validateBeforeSend(HTML, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Claude Code (on behalf of Ali)" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com'],
    replyTo: 'claude-code@reply.colaberry.ai',
    subject: '[V2 - photos added] 5 half-page horizontal co-op ad mockups with real imagery',
    text, html: HTML,
    attachments: [{ filename: 'coop-ad-mockups-2026-06-02-v2.pdf', content: PDF_BUF, contentType: 'application/pdf' }],
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
