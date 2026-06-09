#!/usr/bin/env node
// David M4 V7 reply. Applied his 2026-06-03 "lastest edits" asks. Answer
// the 5-vs-8 tiles question + flag the one ambiguous item (top-portion
// replacement from Jun 2 7:56 AM) that needs clarification.
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
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mockup 4 V7 - your "lastest edits" applied</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800;line-height:1.3">David - V7 in. Every concrete edit applied. One item I need you to clarify before I lock it.</h1>
</div>

<div style="padding:24px 28px">

<p style="font-size:14px;color:#1f2937;margin:0 0 14px">David,</p>

<div style="margin:16px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<img src="cid:mockup4v7" alt="Mockup 4 V7 - your latest edits applied" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
<div style="margin-top:10px;font-size:12px;color:#475569;font-style:italic">Mockup 4 V7 - at the 1.54:1 half-page horizontal trim</div>
</div>

<h2 style="font-size:16px;margin:20px 0 10px;color:#0f172a">Your edits, applied line by line</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:46%">Your ask</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:54%">What I changed</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Center "NRECA Supporting Member" + convert to BLACK not red.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Badge swapped from red bg to solid black (with the same supporting black drop shadow for press depth). Already centered in the V6 footer grid - kept that.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">"Automation ROI in under 90 days" -> exactly "ROI for AI AUTOMATION in UNDER 90 DAYS" + RED banner + WHITE letters.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. ROI strip flipped from navy to red. Text replaced exactly as you wrote it. White +800 weight, same letter spacing.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Place, bold and center "SCAN" under the QR code.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. SCAN label sits directly under the inline QR, 800 weight, 2px letter-spacing, navy color, centered.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">"Please contact:" right-justified above David Lahme &middot; 603-828-6265.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Added as a right-aligned 9.5px italic-weight line above your name in the David column.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Outage IQ tile: line 1 "SCADA-Aware", line 2 "Root Cause Analysis".</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Description replaced. ROI line kept as "$180K per outage / 7-min RCA".</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">"Crew Capture" -> "CREW PRODUCTIVITY"; desc lines "Automated work plans", "Capture tribal knowledge", "Cover 15% more line".</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Renamed. The 3-line description got a per-tile clamp override (other tiles stay at 2 lines so the layout doesn't shift). ROI kept as "38% faster journeyman ramp / Tribal knowledge kept".</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">"Rate Case IQ" -> "RATE CASE" / "AUTOMATION" on two lines; desc "PUC/FERC filings", "80% time reduction".</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Name split across 2 lines. Description replaced. ROI kept as "3 weeks to 4 days / Zero NERC violations".</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">"Compliance Companion" -> "REGULATORY COMPLIANCE".</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Renamed. Description + ROI untouched.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">All white bold + white small print: collapse space closer to yellow line on photos.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Tightened tile bottom padding (11px -> 8px), desc line-height (1.35 -> 1.25), ROI margin-top + padding-top (7+6 -> 4+4). White text block sits visibly tighter to the yellow rule now.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">All large white bold print on the same vertical plane.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Added a 32px min-height to the tile name block + flex centering, so the 2-line "RATE CASE / AUTOMATION" doesn't push the others down. All 5 names lock to one vertical line.</td></tr>
<tr><td style="padding:10px 14px;vertical-align:top;background:#fef9c3">Replace top portion of ad - everything above photos from the Jun 2, 2026, 7:56 AM version.</td><td style="padding:10px 14px;vertical-align:top;color:#78350f;background:#fef9c3"><strong>Need your call here.</strong> See below.</td></tr>
</tbody>
</table>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">The one item I held back on</h2>
<div style="background:#fef9c3;border:1px solid #f59e0b;border-radius:8px;padding:16px 20px;margin-bottom:14px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">Top-portion replacement</div>
<div style="font-size:13px;color:#451a03;margin-top:6px;line-height:1.55">
You wrote "Replace top portion of ad - everything above photos from version dated from Jun 2, 2026, 7:56 AM" and attached an inline screenshot. I don't have a clean way to OCR that screenshot back into the live layout without guessing - and I'd rather not guess on the headline. <strong>The top portion through the V1-V6 history changed shape three times:</strong>
<ul style="margin:8px 0 8px 18px;padding:0">
<li>V1-V3: a "pre-headline" line + a big Georgia headline above the photos</li>
<li>V4: a single Georgia headline + sub-line ("Five AI Products. One pilot. Immediate ROI for your co-op.")</li>
<li>V5-V7 (current): the red bar with "FIVE AI AUTOMATION MODELS &middot; BUILT SPECIFIC TO CO-OP UTILITIES" only</li>
</ul>
<strong>Two ways forward, pick one:</strong>
<ol style="margin:8px 0 0 18px;padding:0">
<li>Paste the exact top-portion copy you want from the Jun 2 7:56 AM version back into a reply. I'll drop it in above the photos verbatim in V8 today.</li>
<li>Or tell me which V (V1/V2/V3/V4) had the top portion you want restored, and I'll port it directly from the source HTML.</li>
</ol>
</div>
</div>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">Your question: "How were these five decided upon when there were eight to start with?"</h2>
<div style="background:#0e1729;color:#cbd5e1;border:1px solid #1d2a44;border-radius:8px;padding:18px;margin-top:8px">
<p style="font-size:13px;margin:0 0 10px;color:#e2e8f0">Fair question. The "five" wasn't a content decision - it was a <strong>print-real-estate constraint</strong> on the half-page horizontal trim.</p>
<p style="font-size:13px;margin:0 0 10px;color:#e2e8f0">At a half-page (the spot we have reserved), each tile gets ~120px of width. At 6 tiles every desc has to be a single line. At 7 the photo loses its identity. At 8 the photos are postage stamps + you can't read the names from across a desk. <strong>5 was the maximum that kept the photos legible at press.</strong></p>
<p style="font-size:13px;margin:0;color:#e2e8f0">Two paths if you want the other three back in front of co-op buyers:</p>
<ul style="margin:8px 0 0 18px;padding:0;font-size:13px;color:#e2e8f0">
<li><strong>Path A:</strong> tell me which of the original 8 you want and I'll show you a 6-tile vs 8-tile variant at the same trim so you can see the legibility tradeoff yourself, side by side. I think you'll agree on 5 once you see it, but I want you to see it not just trust it.</li>
<li><strong>Path B:</strong> we book a <em>full page</em> instead of half (about $9.5K -> $18K at Gold tier discount). Full page gives me room for 8 tiles at the same legibility 5 has now. If RE Magazine July is the issue you want maximum mileage on, this is the upgrade worth pricing. Ram - looping you on that pricing question.</li>
</ul>
<p style="font-size:13px;margin:10px 0 0;color:#fbbf24;font-style:italic">Also - what were the "better titles" from the original 8 that you remember? If they're better than these renamed ones, I want them in.</p>
</div>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">Still open from V6 (no response yet)</h2>
<div style="background:#0f172a;color:white;padding:14px 18px;border-radius:8px;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q1 - Caption-set direction</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">I sent A (benefit-led) / B (action verb) / C (identity-led) options in V6 to replace the product-name captions. You went a different direction on V7 with the literal product names + descriptive subheads, which works. Want me to drop the A/B/C suggestion entirely, or hold them as backup if any tile name doesn't pass press review?</div>
</div>
<div style="background:#0f172a;color:white;padding:14px 18px;border-radius:8px;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q2 - Lock M4 + kill M1/M2/M3/M5</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">All your edits since V4 have been M4-only. Reading that as a soft lock. Confirm and I drop the other 4 mockups, push 100% on press-ready M4 PDF for Thursday EOD.</div>
</div>
<div style="background:#0f172a;color:white;padding:14px 18px;border-radius:8px;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q3 - ROI numbers, defensibility</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">$180K per outage / 7-min RCA / 38% / 60% / +12 NPS / 3 weeks to 4 days / $50K/yr - 7-min RCA + 38% I can defend. Rest are placeholders. Tell me which to keep, which to soften ("hundreds of thousands"), which need a hard source before press.</div>
</div>

<p style="font-size:14px;color:#1f2937;margin:18px 0 0">PDF attached. Reply with the top-portion direction + the 5-vs-8 path you want + anything else, and V8 lands today.</p>

</div>

<div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `David - V7 in. Every concrete edit applied. One item I need you to clarify before I lock it.

YOUR EDITS, APPLIED:
- NRECA badge: swapped from red to BLACK, kept centered in footer grid
- ROI strip: flipped from navy to RED + text replaced exactly as "ROI for AI AUTOMATION in UNDER 90 DAYS" in white
- SCAN: bold + centered under the inline QR, navy, 2px letter-spacing
- "Please contact:" right-justified above David Lahme + 603-828-6265 line
- Outage IQ: desc -> "SCADA-Aware / Root Cause Analysis"
- Crew Capture -> CREW PRODUCTIVITY; desc -> "Automated work plans / Capture tribal knowledge / Cover 15% more line" (3-line clamp on this tile only)
- Rate Case IQ -> "RATE CASE / AUTOMATION" 2-line name; desc -> "PUC/FERC filings / 80% time reduction"
- Compliance Companion -> REGULATORY COMPLIANCE
- White text collapse: tile bottom padding 11px -> 8px, desc line-height 1.35 -> 1.25, ROI margin/padding 7+6 -> 4+4. Tighter to the yellow rule.
- Tile names locked to same vertical plane: 32px min-height + flex center on every name, so the 2-line "RATE CASE / AUTOMATION" doesn't push the others down.

ONE ITEM I HELD BACK ON:
"Replace top portion of ad - everything above photos from Jun 2 7:56 AM version." Your screenshot was inline; I can't OCR it cleanly into the live layout without guessing on the headline. The top portion went through 3 different shapes across V1-V6.
Pick one and I land V8 today:
1. Paste the exact top-portion copy you want and I drop it in verbatim
2. Or tell me which V (V1/V2/V3/V4) had the top portion you want, and I port from the source HTML

YOUR QUESTION - 5 tiles vs the original 8:
The "5" was a print-real-estate decision, not a content one. At the half-page horizontal trim, each tile is ~120px wide. 6+ tiles drops desc to one line; 8 makes the photos postage stamps. 5 was the max with legible photos. Two paths if you want the other 3 back: (A) I show you 6-tile + 8-tile variants at the same trim so you can see the legibility tradeoff side by side, or (B) book a FULL page instead of half (~$9.5K -> $18K at Gold tier) - full page fits 8 at current legibility. Ram - looping you in on the upgrade pricing.

Also - what were the "better titles" from the original 8 you remembered? If they're better than these renames, I want them in.

STILL OPEN FROM V6:
Q1 - A/B/C caption options - drop entirely or hold as press-review backup?
Q2 - Lock M4 + kill M1/M2/M3/M5 (soft-locked since V4)?
Q3 - ROI defensibility - which numbers to keep / soften / source-back before press?

PDF attached. Reply with the top-portion direction + 5-vs-8 path, and V8 lands today.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9955562788,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'dlahme@colaberry.com',
    cc: ['ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Open for Advertising - RE Magazine - M4 V7 (your "lastest edits" applied)',
    html: HTML,
    text: TEXT,
    attachments: [
      { filename: 'coop-ad-mockups-2026-06-02.pdf', content: fs.readFileSync(PDF_PATH), contentType: 'application/pdf' },
      { filename: 'mockup-4-v7.png', content: fs.readFileSync(M4_THUMB), cid: 'mockup4v7' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    bcSummary: '<p>Reply to David with M4 V7 (his 2026-06-03 "lastest edits" applied). Concrete asks all landed: NRECA black + centered, ROI strip red with exact new copy, SCAN under QR, "Please contact:" right-justified, Outage IQ desc rewritten, Crew Capture -> CREW PRODUCTIVITY with 3-line desc, Rate Case IQ -> RATE CASE/AUTOMATION 2-line name, Compliance Companion -> REGULATORY COMPLIANCE, white text tightened to yellow rule, tile names locked to one vertical plane. ONE ITEM HELD BACK: top-portion replacement from Jun 2 7:56 AM (David sent inline screenshot; need exact copy or V-number to port from source). Answered the 5-vs-8 tiles question (half-page trim constraint + offered side-by-side variant or full-page upgrade path). V6 carryovers (A/B/C captions / lock M4 / ROI defensibility) re-surfaced. Mandrill + BC comment + Vault upload via sendWithBcAttach.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
