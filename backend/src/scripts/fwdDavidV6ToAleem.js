#!/usr/bin/env node
// Forward the M4 V6 reply (sent to David earlier today) to Aleem so he
// can see what's been produced. Auto-attach to the RE Magazine ad ticket
// per the operating doctrine. Aleem = aleem@colaberry.com, UX Designer
// Analyst, BC id 47335967.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const REPO = path.resolve(__dirname, '../../..');
const HTML_PATH = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02-standalone.html');
const PDF_PATH = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.pdf');
const M4_THUMB = path.join(REPO, 'tmp/mockup-thumb-4.png');
const LOGO_PATH = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white">

<div style="background:#0f172a;color:white;padding:24px 28px">
<img src="cid:logo" alt="Colaberry" style="height:30px;display:block;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">FYI - RE Magazine half-page ad</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800;line-height:1.3">Aleem - looping you in on the co-op ad we have been iterating with David. Where it stands now.</h1>
</div>

<div style="padding:24px 28px">

<p style="font-size:14px;color:#1f2937;margin:0 0 14px">Aleem,</p>
<p style="font-size:14px;color:#1f2937;margin:0 0 14px">David Lahme (VP Global Partnerships) is the lead on a half-page NRECA Membership Directory ad. We have been iterating mockups for a couple of days; M4 is the locked direction (Five AI Automation Models tiled with photography). Below is the latest version + David's open questions so you can see the design language we've landed on.</p>

<p style="font-size:14px;color:#1f2937;margin:14px 0">As UX Designer Analyst, I want your eye on three specific things (no rush; this is just FYI for now):</p>
<ul style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>Tile typography baseline alignment</strong> - five tiles, each with white bold name + smaller white desc + yellow ROI line. We forced a 2-line clamp on desc + ROI so all baselines align. Look right at the half-page trim?</li>
<li><strong>QR + URL pairing</strong> - QR moved inline next to "enterprise.colaberry.ai/utility-ai" in the Colaberry footer column. Reads cleanly or feels cramped?</li>
<li><strong>Caption-set direction (open question)</strong> - 3 options below for the photo headlines. Your read on which best fits the editorial style of RE Magazine and the buyer (co-op GMs + CFOs)?</li>
</ul>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">Mockup 4 V6 (current state)</h2>
<div style="margin:14px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<img src="cid:mockup4v6" alt="Mockup 4 V6" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
<div style="margin-top:10px;font-size:12px;color:#475569;font-style:italic">Mockup 4 V6 at the 1.54:1 half-page horizontal trim</div>
</div>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">Where the iteration has landed (V1 -> V6 highlights)</h2>
<ul style="font-size:13.5px;padding-left:22px;line-height:1.6">
<li><strong>V1-V3</strong>: 7 full-page concepts -> 5 half-page horizontal mockups</li>
<li><strong>V4</strong>: David's 7 edits applied (NRECA in red, ROI on every tile, headline at top, QR scan-me, bold David details)</li>
<li><strong>V5</strong>: David's "Covering by bases" note - red headline reworded to "FIVE AI AUTOMATION MODELS - BUILT SPECIFIC TO CO-OP UTILITIES", tile descs forced to 2 lines + same baseline, "AUTOMATION ROI IN UNDER 90 DAYS" white strip, footer 4-column grid</li>
<li><strong>V6</strong> (today): smaller print clamped to 2 lines, yellow ROI clamped to 2 lines, QR inline with URL inside Colaberry column (footer dropped to 3 cols), dlahme@ right-justified + bold</li>
</ul>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">3 caption-set options David asked me to propose</h2>
<p style="font-size:13px;color:#475569;margin-top:0">Current captions are short product names. David asked: "Are there better headline captions for each photo?" Three directions:</p>

<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px;margin-top:8px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:9px 12px;text-align:left;font-size:11px;letter-spacing:1px">Option</th>
<th style="padding:9px 12px;text-align:left;font-size:11px;letter-spacing:1px">Photo 1 (SCADA)</th>
<th style="padding:9px 12px;text-align:left;font-size:11px;letter-spacing:1px">Photo 2 (lineman tablet)</th>
<th style="padding:9px 12px;text-align:left;font-size:11px;letter-spacing:1px">Photo 3 (CSR headset)</th>
<th style="padding:9px 12px;text-align:left;font-size:11px;letter-spacing:1px">Photo 4 (signing)</th>
<th style="padding:9px 12px;text-align:left;font-size:11px;letter-spacing:1px">Photo 5 (hardhat)</th>
</tr></thead>
<tbody>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:700">A &mdash; benefit-led</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Outages, Solved Faster</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Reports Without Writing</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Member Calls, Answered</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Rate Cases, Won Quicker</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Compliance, Always Ready</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:700">B &mdash; action verb</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Predict the Outage</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Capture the Crew Knowledge</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Triage the Storm Calls</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Draft the Rate Case</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Track Every Regulation</td></tr>
<tr><td style="padding:8px 12px;font-weight:700">C &mdash; identity-led</td><td style="padding:8px 12px">For Your Ops Center</td><td style="padding:8px 12px">For Your Line Crew</td><td style="padding:8px 12px">For Your Member-Services Desk</td><td style="padding:8px 12px">For Your Regulatory Team</td><td style="padding:8px 12px">For Your Safety Officer</td></tr>
</tbody>
</table>

<p style="font-size:14px;margin-top:18px"><strong>Attachments</strong>: standalone HTML (with images base64-inlined so it opens cleanly from disk), full PDF (printer-ready), M4 V6 thumbnail.</p>

<p style="font-size:14px;margin:18px 0 0">Reply with any design notes when you can. No deadline on your feedback - I am driving the David thread to press for Thursday EOD. If you spot something the trim breaks or a typography fix worth doing before press, that is the most useful input.</p>

</div>

<div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `Aleem - looping you in on the co-op ad we have been iterating with David Lahme. Where it stands now.

David is the lead on a half-page NRECA Membership Directory ad. M4 is the locked direction (Five AI Automation Models tiled with photography). Latest is V6.

Three things I want your eye on (no rush; FYI for now):
- Tile typography baseline alignment: 5 tiles, white bold name + smaller white desc + yellow ROI line. We forced a 2-line clamp on desc + ROI so all baselines align. Look right at the half-page trim?
- QR + URL pairing: QR moved inline next to enterprise.colaberry.ai/utility-ai in the Colaberry footer column. Reads cleanly or feels cramped?
- Caption-set direction (open question): 3 options below for the photo headlines. Your read on which best fits the editorial style of RE Magazine and the buyer (co-op GMs + CFOs)?

ITERATION HIGHLIGHTS:
- V1-V3: 7 full-page concepts -> 5 half-page horizontal mockups
- V4: David's 7 edits applied
- V5: red headline reworded, tile descs forced to 2 lines + same baseline, footer 4-col grid
- V6 (today): smaller print clamped to 2 lines, yellow ROI clamped, QR inline with URL inside Colaberry col, dlahme@ right-justified + bold

3 CAPTION-SET OPTIONS:
A benefit-led: Outages Solved Faster / Reports Without Writing / Member Calls Answered / Rate Cases Won Quicker / Compliance Always Ready
B action verb: Predict the Outage / Capture the Crew Knowledge / Triage the Storm Calls / Draft the Rate Case / Track Every Regulation
C identity-led: For Your Ops Center / For Your Line Crew / For Your Member-Services Desk / For Your Regulatory Team / For Your Safety Officer

Attached: standalone HTML, PDF (printer-ready), M4 V6 thumbnail.

No deadline on your feedback - I am driving the David thread to press for Thursday EOD. Trim breaks or typography fixes are the most useful input.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9955562788, // RE Magazine ad todo (Ali Personal) — same as David thread
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'aleem@colaberry.com',
    cc: ['ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Aleem - FYI: RE Magazine half-page ad with David (M4 V6 current state, 3 caption options)',
    html: HTML,
    text: TEXT,
    attachments: [
      { filename: 'coop-ad-mockups-2026-06-02-standalone.html', content: fs.readFileSync(HTML_PATH), contentType: 'text/html' },
      { filename: 'coop-ad-mockups-2026-06-02.pdf', content: fs.readFileSync(PDF_PATH), contentType: 'application/pdf' },
      { filename: 'mockup-4-v6.png', content: fs.readFileSync(M4_THUMB), cid: 'mockup4v6' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    bcSummary: '<p>Forwarded the M4 V6 state to Aleem (UX Designer Analyst, aleem@colaberry.com, BC id 47335967) per Ali\'s ask. Includes the V6 thumbnail, V1-V6 iteration highlights, three specific design questions for Aleem\'s eye (tile typography baseline alignment, QR+URL pairing readability, caption-set direction), and the same 3 caption-set options sent to David. Standalone HTML + PDF + thumbnail attached. CC Ram. No deadline given since the David thread is driving to Thursday EOD; Aleem\'s input is upside.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
