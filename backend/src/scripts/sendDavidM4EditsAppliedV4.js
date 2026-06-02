#!/usr/bin/env node
// Reply to David with his M4 edits applied. Walks through each of his 7
// critique points and shows what changed. Embeds the updated M4 thumbnail as
// inline image. Attaches standalone HTML + PDF + BCC Ali.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const REPO = path.resolve(__dirname, '../../..');
const HTML_PATH = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02-standalone.html');
const PDF_PATH = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.pdf');
const M4_THUMB = path.join(REPO, 'tmp/mockup-thumb-4.png');
const LOGO_PATH = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');

const EMAIL = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white">

<div style="background:#0f172a;color:white;padding:24px 28px">
<img src="cid:logo" alt="Colaberry" style="height:30px;display:block;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mockup 4 V2 - your edits applied</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800;line-height:1.3">David - here is your Mockup 4 with the 7 edits applied. Two questions for you at the bottom.</h1>
</div>

<div style="padding:24px 28px">

<p style="font-size:14px;color:#1f2937;margin:0 0 14px">David,</p>
<p style="font-size:14px;color:#1f2937;margin:0 0 14px">Walked your critique line by line. Here is the updated Mockup 4 - the visual first, then the changelog per item, then two open questions only you can answer.</p>

<div style="margin:20px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<img src="cid:mockup4" alt="Mockup 4 V2 — Five Platforms + Immediate ROI" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
<div style="margin-top:10px;font-size:12px;color:#475569;font-style:italic">Mockup 4 V2 — at the 1.54:1 half-page horizontal trim</div>
</div>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">Your 7 edits, applied</h2>

<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px;margin-top:10px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:36%">Your note</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:64%">What I changed</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Make NRECA larger and in RED</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Was small navy; now a red box with bold "NRECA / SUPPORTING MEMBER" stacked, 2.5x larger, drop shadow.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Bold out my name + number</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. "David Lahme &middot; 603-828-6265" is bold navy at the bottom left, paired with the URL above it.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">QR that says 'scan me' for enterprise.colaberry.ai/utility-ai</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Generated a real QR (high error-correction so it can survive press dot gain). 50x50 at bottom right, "SCAN ME" in red caps next to it. Scans clean on my phone.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Headline at top of ad, copy at bottom. Headline larger but bold.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. New headline up top in 32pt Georgia bold: <em>"Five AI Products. One pilot. Immediate ROI for your co-op."</em> Sub-copy moved underneath. Red bar follows. Tiles below. ROI strip + footer at bottom.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">ROI on every tile (when/where the payback?)</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Each tile now has a gold ROI line under the description. Plus a full-width navy strip at the bottom: <strong>"Typical co-op pilot pays back in &lt; 90 days."</strong> Immediate-ROI promise loud and present.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Outage IQ - predictive? how quick? $$ savings?</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Reworded: <em>"Predictive + post-event root-cause analyst. SCADA-aware."</em> ROI line: <em>"$180K saved per major outage. 7-min RCA."</em></td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Crew Capture - use the M1 copy (voice-dictated reports, OSHA/NESC auto-draft, tribal knowledge). Cost savings?</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Pulled the M1 copy into the tile: <em>"Voice-dictated outage reports (90s/truck-roll). OSHA + NESC auto-drafted."</em> ROI: <em>"38% faster journeyman ramp. Tribal knowledge preserved."</em></td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Member Voice - automated vs customized for storm/disaster?</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Clarified: <em>"Inbound triage + storm-aware FAQ. Auto + human handoff."</em> (Both - the bot triages, then routes to a CSR when it can't.) ROI: <em>"60% lower CSR wait. Member NPS +12 pts."</em></td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Rate Case IQ = Compliance reporting? Combine? Better picture?</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Sub-copy now says <em>"Filing prep + precedent scan. Combines w/ Compliance."</em> Open Q below: do you want me to actually merge them into 4 tiles? Or keep 5 with this note?</td></tr>
<tr><td style="padding:10px 14px;vertical-align:top">Compliance Companion - cost / error reduction?</td><td style="padding:10px 14px;vertical-align:top;color:#14532d">ROI added: <em>"$50K/yr penalty avoidance per pilot."</em> Sub-copy unchanged: NERC + NESC + OSHA tracker, audit-ready every day.</td></tr>
</tbody>
</table>

<div style="margin-top:20px;padding:16px 20px;background:#fef9e7;border-left:5px solid #d4a017;border-radius:0 6px 6px 0;font-size:13px;color:#78350f">
<strong>About the ROI numbers</strong> ($180K, 7 min, 38%, 60%, +12 pts, 3wks &rarr; 4d, $50K) — I drafted these to make the ad concrete, but the numbers need real sources before press. I have backing for some (7-min RCA + 38% journeyman ramp from earlier mockups), but the rest are placeholders. Tell me which I can keep, which need to be softened to a directional phrase ("hundreds of thousands saved"), and which you want me to track down a real source for. If we cannot defend each number to a CFO at a co-op, we should round it down or drop it.
</div>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">Two questions for you (only you can answer)</h2>

<div style="background:#0f172a;color:white;padding:16px 20px;border-radius:8px;margin-bottom:12px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q1 — Combine Rate Case IQ + Compliance Companion?</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">You flagged that these two overlap. Two options - <strong>(a)</strong> keep both as separate tiles (more surface, slightly diluted), <strong>(b)</strong> merge into one tile called something like <em>"Rate Case + Compliance IQ"</em> and free up that fifth slot for something else (or just go to 4 tiles in a 2x2 grid, which actually reads cleaner at half-page size). My designer instinct says (b). What do you want?</div>
</div>

<div style="background:#0f172a;color:white;padding:16px 20px;border-radius:8px;margin-bottom:12px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q2 — Lock Mockup 4 as the finalist?</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">You only edited M4. Reading that as "this is the one." But I want to confirm before I scrap mockups 1, 2, 3, 5. Two options - <strong>(a)</strong> lock M4 as the finalist, kill the others (cleanest path to Thursday deadline), <strong>(b)</strong> apply the same ROI + bigger-headline + QR treatment to one other mockup so you have a head-to-head pick. Which?</div>
</div>

<p style="font-size:14px;color:#1f2937;margin:18px 0 0">Same review flow if you want to add more notes - the standalone HTML is attached, just open and re-fill the M4 widget. Or reply with a few bullets. Thursday EOD deadline still holds; if Q1 + Q2 come back tonight I can have a press-ready PDF tomorrow EOD.</p>

</div>

<div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = strip(`David - your 7 edits to Mockup 4 are applied. New M4 V2:

CHANGELOG:
1. NRECA badge - was small navy, now larger + RED + stacked + drop shadow
2. Your name + phone - now bold navy
3. QR code - real, high-error-correction, "SCAN ME" in red caps, points to enterprise.colaberry.ai/utility-ai
4. Headline at top - "Five AI Products. One pilot. Immediate ROI for your co-op." in 32pt Georgia bold. Sub-copy underneath. Layout restructured top-to-bottom.
5. ROI on every tile - gold line under each. Plus full bottom strip: "Typical co-op pilot pays back in < 90 days."
6. Outage IQ - "Predictive + post-event root-cause analyst. SCADA-aware." ROI: "$180K saved per major outage. 7-min RCA."
7. Crew Capture - pulled M1 copy: "Voice-dictated outage reports (90s/truck-roll). OSHA + NESC auto-drafted." ROI: "38% faster journeyman ramp. Tribal knowledge preserved."
8. Member Voice - "Inbound triage + storm-aware FAQ. Auto + human handoff." ROI: "60% lower CSR wait. Member NPS +12 pts."
9. Rate Case IQ - "Filing prep + precedent scan. Combines w/ Compliance." ROI: "3 weeks -> 4 days. Zero NERC violations."
10. Compliance Companion - ROI added: "$50K/yr penalty avoidance per pilot."

FLAG ON THE ROI NUMBERS: I drafted $180K / 7min / 38% / 60% / +12 / 3wks->4d / $50K to make the ad concrete. Some I can defend (7-min RCA, 38% from M5); the rest are placeholders. Tell me which to keep, which to soften ("hundreds of thousands"), which need real sources. Don't surprise a CFO at a co-op with a number we can't back.

TWO QUESTIONS FOR YOU:

Q1 - Combine Rate Case IQ + Compliance Companion?
(a) Keep both separate (more surface), (b) merge to one tile + go 4 tiles in 2x2 (cleaner). My instinct: (b).

Q2 - Lock M4 as finalist?
You only edited M4. Reading that as "this is the one." Two paths - (a) lock M4, kill the others, (b) apply the same ROI/bigger-headline/QR treatment to one other mockup for a head-to-head pick. Which?

Same review flow if more notes - standalone HTML attached. Or just reply with bullets. Thursday EOD still holds; if Q1+Q2 come tonight, press-ready PDF tomorrow EOD.

Ali`);

(async () => {
  const HTML_CLEAN = strip(EMAIL);
  validateBeforeSend(HTML_CLEAN, TEXT);
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
    subject: 'Re: Open for Advertising - RE Magazine - Mockup 4 V2 (your edits applied) + 2 questions',
    text: TEXT, html: HTML_CLEAN,
    attachments: [
      { filename: 'coop-ad-mockups-2026-06-02-standalone.html', content: fs.readFileSync(HTML_PATH), contentType: 'text/html' },
      { filename: 'coop-ad-mockups-2026-06-02.pdf', content: fs.readFileSync(PDF_PATH), contentType: 'application/pdf' },
      { filename: 'mockup-4-v2.png', content: fs.readFileSync(M4_THUMB), cid: 'mockup4' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
