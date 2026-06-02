#!/usr/bin/env node
// Per memory rule (feedback_ali_personal_attach_emails_docs_to_ticket): attach
// David's critique + my V4 response + updated HTML to the RE Magazine ad BC
// ticket on David Lahme list (todo 9955562788).
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const BASE = 'https://3.basecampapi.com/3945211';
const BUCKET = 7463955;
const TODO = 9955562788; // RE Magazine ad ticket on David Lahme list
const H = (extra = {}) => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry Attach', Accept: 'application/json', ...extra });

const REPO = path.resolve(__dirname, '../../..');
const HTML_PATH = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02-standalone.html');
const PDF_PATH = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.pdf');
const M4_THUMB = path.join(REPO, 'tmp/mockup-thumb-4.png');

async function uploadAttachment(filename, buf, contentType) {
  const r = await fetch(`${BASE}/attachments.json?name=${encodeURIComponent(filename)}`, {
    method: 'POST', headers: H({ 'Content-Type': contentType }), body: buf,
  });
  if (!r.ok) throw new Error(`attachments.json ${r.status}: ${await r.text()}`);
  return (await r.json()).attachable_sgid;
}

(async () => {
  console.log('[attach] uploading 3 files...');
  const sgidHtml = await uploadAttachment('coop-ad-mockups-2026-06-02-V4-standalone.html', fs.readFileSync(HTML_PATH), 'text/html');
  const sgidPdf = await uploadAttachment('coop-ad-mockups-2026-06-02-V4.pdf', fs.readFileSync(PDF_PATH), 'application/pdf');
  const sgidPng = await uploadAttachment('mockup-4-v2-thumbnail.png', fs.readFileSync(M4_THUMB), 'image/png');
  console.log('  HTML sgid:', sgidHtml.slice(0, 30) + '...');
  console.log('  PDF sgid:', sgidPdf.slice(0, 30) + '...');
  console.log('  PNG sgid:', sgidPng.slice(0, 30) + '...');

  const commentHtml = `<div style="background:#fef9e7;border-left:5px solid #d4a017;padding:14px 18px;border-radius:0 6px 6px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">David replied 2026-06-02 19:08 UTC + Ali responded 14:14 CDT</div>
<div style="font-size:13px;color:#78350f;margin-top:4px">Mockup 4 V2 shipped to David. Mandrill <code>a9d3a089-1b0b-c664-8b7e-17b0c97f1a4d</code>. Attached per Ali Personal operating doctrine.</div>
</div>

<div style="margin-top:14px"><strong>David's critique (verbatim):</strong></div>
<div style="margin-top:6px;padding:14px 16px;background:#f8fafc;border-radius:6px;font-family:'Courier New',monospace;font-size:12px;white-space:pre-wrap;color:#1f2937">[CB-AD-CRITIQUE-V1] RE Magazine half-page horizontal mockups
Reviewer: David Lahme
Submitted: 2026-06-02T19:07:05.106Z
---

MOCKUP 4 (Five Platforms catalog): KEEP W/ EDITS
  Notes: Make NRECA larger and in RED, bold out my name/number, create a QR
that says 'scan me' for Colaberry enterprise.colaberry.ai/utility-ai
Outage IQ - is this a predictive model / how quick is the report post
outage? What is the $$ savings?
Crew Capture - pulled from previous option : Voice-dictated outage reports.
90 seconds per truck-roll. OSHA + NESC forms auto-drafted from the work
order. Tribal knowledge captured before journeymen retire. Costs savings?
Member Response - is this automated or customized dependent on what
'disaster' or storm hit? Whats the cost reductions or positive customer
experience or cost reduction?
Rate Case IQ = Compliance reporting - yes? could they be combined? is there
a better picture? whats the cost savings, error reductions?

For all of these anyone who looks at them wants when/where will the ROI
be?? Is it safe to say Immediate ROI ??
Perhaps the headline at top of add and copy at bottom? I also think the
headline should be larger but still in bold.

FINALIST(S): (none marked - pick one to lock the production round)

[CB-AD-CRITIQUE-END]</div>

<hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0">

<div><strong>Mockup 4 V2 (visual):</strong></div>
<div style="margin-top:8px"><bc-attachment sgid="${sgidPng}" caption="mockup-4-v2.png"></bc-attachment></div>

<div style="margin-top:14px"><strong>What I changed per David's note:</strong></div>
<ol style="font-size:13px;line-height:1.7">
<li><strong>NRECA</strong> - was small navy, now larger + RED + stacked "NRECA / SUPPORTING MEMBER" + drop shadow</li>
<li><strong>David details</strong> - "David Lahme &middot; 603-828-6265" now bold navy at bottom left</li>
<li><strong>QR code</strong> - real QR (high error correction), 50x50, "SCAN ME" red caps, points to enterprise.colaberry.ai/utility-ai</li>
<li><strong>Headline at top</strong> - moved up, 32pt Georgia bold: "Five AI Products. One pilot. Immediate ROI for your co-op." Sub-copy underneath, red bar, tiles, ROI strip, footer (top-to-bottom flow)</li>
<li><strong>ROI per tile</strong> - gold line under each tile description. Plus full-width navy strip: "Typical co-op pilot pays back in &lt; 90 days."</li>
<li><strong>Outage IQ</strong> - "Predictive + post-event root-cause analyst. SCADA-aware." ROI: "$180K saved per major outage. 7-min RCA."</li>
<li><strong>Crew Capture</strong> - pulled M1 copy: "Voice-dictated outage reports (90s/truck-roll). OSHA + NESC auto-drafted." ROI: "38% faster journeyman ramp. Tribal knowledge preserved."</li>
<li><strong>Member Voice</strong> - "Inbound triage + storm-aware FAQ. Auto + human handoff." ROI: "60% lower CSR wait. Member NPS +12 pts."</li>
<li><strong>Rate Case IQ</strong> - "Filing prep + precedent scan. Combines w/ Compliance." ROI: "3 weeks &rarr; 4 days. Zero NERC violations." (open Q to David: actually merge into 4 tiles?)</li>
<li><strong>Compliance Companion</strong> - ROI added: "$50K/yr penalty avoidance per pilot."</li>
</ol>

<div style="margin-top:14px;padding:14px 18px;background:#fef2f2;border-left:5px solid #c1272d;border-radius:0 6px 6px 0;font-size:13px;color:#7f1d1d">
<strong>ROI numbers flag:</strong> $180K / 7min / 38% / 60% / +12 / 3wks-&gt;4d / $50K are placeholders. Asked David to confirm which to keep vs soften vs source.
</div>

<div style="margin-top:14px"><strong>Two open questions sent to David:</strong></div>
<ol style="font-size:13px;line-height:1.7">
<li><strong>Combine Rate Case IQ + Compliance Companion?</strong> Either keep both (more surface) or merge into one tile + go 4 tiles in 2x2 grid. Ali instinct: merge.</li>
<li><strong>Lock M4 as the finalist?</strong> David only edited M4. Either lock + kill the others, or apply same ROI/headline/QR treatment to one other for head-to-head. Awaiting David.</li>
</ol>

<hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0">

<div><strong>Attachments (durable):</strong></div>
<div style="margin-top:8px"><bc-attachment sgid="${sgidHtml}" caption="coop-ad-mockups-2026-06-02-V4-standalone.html"></bc-attachment></div>
<div style="margin-top:8px"><bc-attachment sgid="${sgidPdf}" caption="coop-ad-mockups-2026-06-02-V4.pdf"></bc-attachment></div>

<div style="margin-top:14px;font-size:11px;color:#94a3b8;font-style:italic">Updated mockup HTML + PDF + thumbnail attached as the durable record of V4. Source files in repo at <code>docs/coop-ad-mockups-2026-06-02.html</code> and <code>docs/coop-ad-mockups-2026-06-02-standalone.html</code>.</div>`;

  const c = await (await fetch(`${BASE}/buckets/${BUCKET}/recordings/${TODO}/comments.json`, {
    method: 'POST', headers: H({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content: commentHtml }),
  })).json();
  console.log(`[attach] comment posted: ${c.app_url}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
