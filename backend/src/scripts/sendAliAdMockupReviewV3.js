#!/usr/bin/env node
// V3: real Colaberry logo + real enterprise.colaberry.ai URLs + photo on every M4 tile.
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
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Co-op ad mockups - V3</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800">All three fixes shipped: real logo, real URLs, photo on every M4 tile.</h1>
<div style="font-size:14px;color:#cbd5e0">PDF re-rendered (2.1 MB). Nothing else changed from V2 - same 5 mockups, same red accents, same photography on the hero areas.</div>
</div>

<div style="padding:24px 34px">

<div style="padding:14px 18px;background:#dcfce7;border-left:5px solid #14532d;border-radius:0 6px 6px 0;font-size:13px;color:#14532d;margin-bottom:18px">
<strong>What changed in V3:</strong>
<ol style="margin:6px 0 0;padding-left:20px;line-height:1.7">
<li><strong>Real Colaberry logo</strong> (PNG from <code>frontend/public/colaberry-logo.png</code>) now appears in the footer of every mockup. No more text-only "COLABERRY" placeholder.</li>
<li><strong>Real enterprise.colaberry.ai URLs</strong> - verified against <code>frontend/src/routes/publicRoutes.tsx</code>. The fakes I had (<code>colaberry.ai/co-op-platforms</code>, <code>/co-ops</code>, <code>/crew-capture</code>, <code>/co-op-briefing</code>) were replaced with real routes that exist.</li>
<li><strong>Mockup 4 tiles now have background photos</strong> - SCADA control room, lineman with field gear, CSR with headset, document signing, hard hat on workbench. Each tile is dark-overlaid so the product name + 1-line desc reads cleanly on top.</li>
</ol>
</div>

<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:12px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:18%">Mockup</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:42%">Real URL now in the ad</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:40%">Logo placement</th>
</tr></thead>
<tbody>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>1 Crew Productivity</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">enterprise.colaberry.ai/utility-ai</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Inline w/ URL + David direct, bottom right</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>2 AI in Plain English</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">enterprise.colaberry.ai/strategy-call-prep</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Footer, paired with David's name + phone</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>3 7 Minutes</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">enterprise.colaberry.ai/utility-ai</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Bottom right, inverted to white on dark</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>4 Five Platforms (catalog)</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">enterprise.colaberry.ai/utility-ai</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Bottom left footer, next to URL</td></tr>
<tr><td style="padding:8px 12px"><strong>5 40% Workforce Crisis</strong></td><td style="padding:8px 12px;font-family:monospace;font-size:11px">enterprise.colaberry.ai/utility-ai</td><td style="padding:8px 12px">Bottom right, w/ David direct + NRECA badge</td></tr>
</tbody>
</table>

<div style="margin-top:18px;padding:14px 18px;background:#fef9e7;border-left:5px solid #d4a017;border-radius:0 6px 6px 0;font-size:13px;color:#78350f">
<strong>URL routing note:</strong> all 5 ads point at <code style="background:white;padding:1px 4px;border-radius:3px">enterprise.colaberry.ai/utility-ai</code> except Mockup 2 which uses <code style="background:white;padding:1px 4px;border-radius:3px">/strategy-call-prep</code> (the existing exec-briefing prep page). If you'd rather Mockup 2 also point at <code>/utility-ai</code> for a single landing page across all 5 ads, easy fix - tell me.
</div>

<div style="margin-top:18px;padding:14px 18px;background:#fef2f2;border-left:5px solid #c1272d;border-radius:0 6px 6px 0;font-size:13px;color:#7f1d1d">
<strong>Open question on Mockup 4 product names:</strong> the 5 tiles use product names I framed for co-ops specifically (Outage IQ, Crew Capture, Member Voice, Rate Case IQ, Compliance Companion). These aren't your three real platform routes (<code>/ai-architect</code>, <code>/ai-workforce-designer</code>, <code>/advisory</code>). Two options - (a) keep the co-op-specific naming as positioning, (b) swap in real platform names. Tell me if (b).
</div>

<div style="margin-top:18px;padding:16px 20px;background:#0f172a;color:white;border-radius:8px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Same review flow as V2</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">PDF attached. HTML still has the per-mockup feedback widget. Tell me which to push to production + the open questions above, and I'll have the press-ready PDF in your inbox by Wed EOD.</div>
</div>

<div style="margin-top:14px;font-size:13px;color:#475569"><strong>Still holding</strong> - nothing goes to David or Ram until you lock direction.</div>

</div>

<div style="padding:20px 34px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const text = strip(`Co-op ad mockups V3 - real logo, real URLs, photos on M4 tiles

Three fixes shipped:
1. Real Colaberry logo (from frontend/public/colaberry-logo.png) replaces the text "COLABERRY" placeholder in every mockup's footer.
2. Real enterprise.colaberry.ai URLs verified against frontend/src/routes/publicRoutes.tsx replace the made-up colaberry.ai/co-ops, /co-op-platforms, /crew-capture, /co-op-briefing.
3. Mockup 4 tiles now have background photos: SCADA control room, lineman with field gear, CSR with headset, document signing, hard hat on workbench. Dark-overlaid so the product names read.

Real URLs in each ad:
- M1 Crew Productivity, M3 7 Minutes, M4 Five Platforms, M5 Workforce Crisis: enterprise.colaberry.ai/utility-ai
- M2 AI in Plain English: enterprise.colaberry.ai/strategy-call-prep

Open question on M4 product names: the 5 tiles use co-op-specific naming (Outage IQ, Crew Capture, Member Voice, Rate Case IQ, Compliance Companion). These aren't real platform routes (which are /ai-architect, /ai-workforce-designer, /advisory). Want me to swap to real platform names or keep co-op positioning?

PDF attached.

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
    subject: '[V3] Co-op ad mockups - real Colaberry logo, real URLs, photos on every M4 tile',
    text, html: HTML,
    attachments: [{ filename: 'coop-ad-mockups-2026-06-02-v3.pdf', content: PDF_BUF, contentType: 'application/pdf' }],
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
