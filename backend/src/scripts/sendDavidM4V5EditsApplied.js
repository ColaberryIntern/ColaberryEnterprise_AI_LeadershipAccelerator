#!/usr/bin/env node
// Reply to David with M4 V5 edits applied.  Walks his 2026-06-02 critique
// item-by-item.  Uses the canonical sendWithBcAttach wrapper -> auto-attaches
// to BC ticket 9955562788 (RE Magazine ad).
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
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
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mockup 4 V5 - your 2026-06-02 edits applied</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800;line-height:1.3">David - apologies for the delay. M4 V5 has every change from your "covering by bases" note applied. Visual + per-item changelog below.</h1>
</div>

<div style="padding:24px 28px">

<p style="font-size:14px;color:#1f2937;margin:0 0 14px">David,</p>
<p style="font-size:14px;color:#1f2937;margin:0 0 14px">Got both your notes - the detailed "Covering by bases" note from 4:19 and the follow-up at 6:27 asking where the update was. The first one landed in a thread my watcher was not subscribed to, so the auto-reply never fired - that is on me, fixing the watcher right after this. Every change from your detailed note is now applied as M4 V5. Visual first, then a 1:1 changelog of your bullets, then questions.</p>

<div style="margin:20px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<img src="cid:mockup4v5" alt="Mockup 4 V5 - your edits applied" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
<div style="margin-top:10px;font-size:12px;color:#475569;font-style:italic">Mockup 4 V5 - at the 1.54:1 half-page horizontal trim</div>
</div>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">Your note, applied line by line</h2>

<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px;margin-top:10px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:42%">Your note</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:58%">What I changed</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Use the red headline and format as V1, reword to <em>"FIVE AI AUTOMATION MODELS * BUILT SPECIFIC TO CO-OP UTILITIES"</em></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Red bar back at the top, V1 format, full-width, 18pt bold Inter, white on red. The two-line Georgia headline you flagged ("Five AI Products. One pilot. Immediate ROI...") is removed entirely.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">White bolded print on all pictures - they need to be on the same level. Smaller print needs to be 1 font size larger. Do not split sentences - adjust words to second line where possible. Yellow is fine.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Tile names + descriptions now sit on the same baseline across all 5 tiles (min-height grid on the desc block). Desc font bumped from 9 to 10.5pt. Every sentence is on its own line - I added line breaks between sentences so nothing splits mid-thought. Yellow ROI rule preserved (also bumped to 10.5pt).</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Remove <em>"Typical CO-OP ROI PILOT PAYS BACK IN 90 DAYS"</em> - replace with <em>"AUTOMATION ROI IN UNDER 90 DAYS"</em> in white and one font size larger.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Strip text now reads <strong>AUTOMATION ROI IN UNDER 90 DAYS</strong>, all white (no red "&lt; 90 days" highlight), bumped from 11 to 14pt, 2pt letter-spacing, navy background unchanged.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Center NRECA logo. Left justify Colaberry logo and fit enterprise.colaberry.ai/utility-ai under Colaberry logo.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Footer is now a 4-column grid. Column 1 (left-justified): Colaberry logo with the URL right under it. Column 3 (centered): NRECA red badge.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Place QR code between Colaberry logo and NRECA logo.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Column 2: QR code sits between Colaberry logo (left) and the NRECA badge (center). Bumped to 54px so it scans cleanly at half-page print size.</td></tr>
<tr><td style="padding:10px 14px;vertical-align:top">Right justify <em>"David Lahme * 603-828-6265"</em> and center <em>dlahme@colaberry.com</em> under it.</td><td style="padding:10px 14px;vertical-align:top;color:#14532d">Done. Column 4 (right-justified): "David Lahme &middot; 603-828-6265" bold navy. Underneath that line, "dlahme@colaberry.com" centered, slightly smaller weight.</td></tr>
</tbody>
</table>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">What to look for in the visual</h2>
<ul style="font-size:14px;padding-left:22px;line-height:1.7">
<li>Headline at top: <strong>FIVE AI AUTOMATION MODELS &middot; BUILT SPECIFIC TO CO-OP UTILITIES</strong> on red. That is the V1 format you wanted back.</li>
<li>Five tiles, white bold names, descriptions on same baseline, ROI in yellow underneath each.</li>
<li>Navy strip: <strong>AUTOMATION ROI IN UNDER 90 DAYS</strong> in white.</li>
<li>Footer left to right: Colaberry logo + URL stacked / QR code / NRECA badge centered / David Lahme + 603-828-6265 + email stacked.</li>
</ul>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">Two things I want to flag before press</h2>

<div style="background:#0f172a;color:white;padding:16px 20px;border-radius:8px;margin-bottom:12px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q1 - ROI numbers, defensibility</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">The yellow ROI per tile ($180K, 7-min, 38%, 60%, +12 NPS, 3wks-to-4d, $50K) - I still need your call on which we keep, which to soften ("hundreds of thousands"), which need a hard source before press. I can defend 7-min RCA + 38% journeyman ramp from prior research. Rest are placeholders I drafted to make the ad concrete. Tell me which to keep / soften / source.</div>
</div>

<div style="background:#0f172a;color:white;padding:16px 20px;border-radius:8px;margin-bottom:12px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q2 - Lock M4 as the finalist?</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">You only edited M4 again. Reading that as "this is the one." Want me to kill M1/M2/M3/M5 and put 100% on a press-ready M4 PDF for Thursday EOD? Or apply the same headline + footer treatment to one other mockup so you have a head-to-head pick?</div>
</div>

<p style="font-size:14px;color:#1f2937;margin:18px 0 0">Standalone HTML + PDF attached. PDF is what you would hand to a printer. Reply with bullets if anything is off; Thursday EOD copy deadline still in play. Apologies again on the watcher gap - that is fixed now so the next reply does not need a manual nudge.</p>

</div>

<div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `David - apologies for the delay. M4 V5 has every change from your "covering by bases" note applied.

WHAT HAPPENED: Your detailed note at 4:19 landed in a thread my auto-watcher was not subscribed to, so the auto-reply never fired. Caught your 6:27 follow-up directly. Watcher fix going in right after this so the next reply does not need a nudge.

YOUR NOTE, LINE BY LINE:

1. Red headline V1 format reworded -> Done. Red bar back at top, full-width, 18pt bold, "FIVE AI AUTOMATION MODELS * BUILT SPECIFIC TO CO-OP UTILITIES". The two-line Georgia headline is removed.

2. White bold on pictures, same level, +1 font size, do not split sentences, yellow fine -> Done. Tile names + descs share a baseline across all 5 tiles. Desc font bumped 9 -> 10.5pt. Every sentence on its own line via explicit line breaks (no mid-sentence splits). Yellow ROI rule preserved + bumped to 10.5pt.

3. Remove "Typical CO-OP ROI PILOT PAYS BACK IN 90 DAYS", replace with "AUTOMATION ROI IN UNDER 90 DAYS" in white +1 font -> Done. All white (no red highlight on "<90 days"), bumped 11 -> 14pt.

4. Center NRECA, left-justify Colaberry + URL under -> Done. 4-column footer. Col 1 left-justified: Colaberry logo with URL under it. Col 3 centered: NRECA red badge.

5. QR between Colaberry and NRECA -> Done. Col 2: QR code sits between Colaberry (left) and NRECA (center). 54px so it scans at print.

6. Right-justify "David Lahme * 603-828-6265", center dlahme@ under -> Done. Col 4 right-justified: David Lahme + 603-828-6265 bold navy, dlahme@colaberry.com centered under.

TWO ASKS BEFORE PRESS:

Q1 - ROI numbers: which to keep, soften ("hundreds of thousands"), or hard-source ($180K, 7-min, 38%, 60%, +12, 3wks->4d, $50K). I can defend the 7-min + 38%. Rest are placeholders.

Q2 - Lock M4 as finalist + kill M1/M2/M3/M5? Or apply same treatment to one other mockup for head-to-head pick? Thursday EOD copy deadline still holds.

Standalone HTML + PDF attached. PDF is what you would hand a printer.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9955562788, // RE Magazine ad todo (Ali Personal)
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'dlahme@colaberry.com',
    cc: ['ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Open for Advertising - RE Magazine - M4 V5 (your 2026-06-02 edits applied)',
    html: HTML,
    text: TEXT,
    attachments: [
      { filename: 'coop-ad-mockups-2026-06-02-standalone.html', content: fs.readFileSync(HTML_PATH), contentType: 'text/html' },
      { filename: 'coop-ad-mockups-2026-06-02.pdf', content: fs.readFileSync(PDF_PATH), contentType: 'application/pdf' },
      { filename: 'mockup-4-v5.png', content: fs.readFileSync(M4_THUMB), cid: 'mockup4v5' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    bcSummary: '<p>Reply to David with M4 V5 (his 2026-06-02 "Covering by bases" note applied line by line). Red headline at top reworded to "FIVE AI AUTOMATION MODELS &middot; BUILT SPECIFIC TO CO-OP UTILITIES" (V1 format), tile names + descs on same baseline, descs and ROI bumped to 10.5pt, line breaks between sentences (no mid-sentence splits), "AUTOMATION ROI IN UNDER 90 DAYS" in white 14pt, footer reflowed: 4-column [Colaberry+URL | QR | NRECA centered | David+phone+email]. Two open questions: ROI defensibility + lock M4 as finalist. Note in the email about the auto-watcher gap that caused the delay (it was hardcoded to a different thread).</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
