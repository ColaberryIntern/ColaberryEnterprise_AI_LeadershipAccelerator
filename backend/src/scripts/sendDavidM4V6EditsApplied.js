#!/usr/bin/env node
// David M4 V6 reply. Applied his 2026-06-03 12:34 UTC asks + propose
// 3 alternative caption sets for him to pick from on the "better
// headline captions" open question.
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
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mockup 4 V6 - your 2026-06-03 edits applied + caption options</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800;line-height:1.3">David - V6 in. Your latest asks applied. Plus 3 caption-set options for the headlines you asked me to suggest.</h1>
</div>

<div style="padding:24px 28px">

<p style="font-size:14px;color:#1f2937;margin:0 0 14px">David,</p>

<div style="margin:16px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<img src="cid:mockup4v6" alt="Mockup 4 V6 - your edits applied" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
<div style="margin-top:10px;font-size:12px;color:#475569;font-style:italic">Mockup 4 V6 - at the 1.54:1 half-page horizontal trim</div>
</div>

<h2 style="font-size:16px;margin:20px 0 10px;color:#0f172a">Your asks, applied line by line</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:46%">Your ask</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:54%">What I changed</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Smaller print wording spaced to fit two lines only.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Tightened each tile description and added a 2-line clamp (overflow hidden) so nothing ever wraps past 2 lines at press, even if the trim shifts a px or two.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Yellow printed words reworded so each fits two lines.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Each tile's gold ROI line shortened: e.g. "$180K saved per major outage" -> "$180K per outage"; "Tribal knowledge preserved" -> "Tribal knowledge kept"; "$50K/yr penalty avoidance per pilot" split into "$50K/yr penalty avoided" + "Per pilot". Same 2-line clamp safety.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Each photo caption (large white bold) aligned symmetrically on the same level.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done via the 2-line clamp on the description block; all 5 captions now sit at the same vertical baseline regardless of how short or long each description is.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Center NRECA supporting member.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Already centered in V5; the new 3-column footer grid keeps NRECA dead center between the Colaberry column and the David details column.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Place QR image just to the right of "enterprise.colaberry.ai/utility-ai".</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Pulled QR out of its own column, dropped to a 36px inline image sitting immediately right of the URL inside the Colaberry footer column. Footer is now 3 columns: [Colaberry logo + URL + QR inline] / [NRECA centered] / [David details right].</td></tr>
<tr><td style="padding:10px 14px;vertical-align:top">Right justify and bold dlahme@colaberry.com.</td><td style="padding:10px 14px;vertical-align:top;color:#14532d">Done. Email is now right-aligned + 800 weight under "David Lahme &middot; 603-828-6265".</td></tr>
</tbody>
</table>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">"Better headline captions" - 3 options for you to pick from</h2>
<p style="font-size:13px;color:#475569">You asked for suggestions. Current captions are short product names (Outage IQ / Crew Capture / Member Voice / Rate Case IQ / Compliance Companion). Three alternative directions, each tested against the same photo set:</p>

<div style="background:#0e1729;color:#cbd5e1;border:1px solid #1d2a44;border-radius:8px;padding:18px;margin-top:14px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Option A - benefit-led (what the co-op gets)</div>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:12px;margin-top:8px">
<tr><td style="padding:4px 0;width:140px;color:#8a99b8">Photo 1 (SCADA)</td><td style="color:white;font-weight:700">Outages, Solved Faster</td></tr>
<tr><td style="padding:4px 0;color:#8a99b8">Photo 2 (lineman tablet)</td><td style="color:white;font-weight:700">Reports Without Writing</td></tr>
<tr><td style="padding:4px 0;color:#8a99b8">Photo 3 (CSR headset)</td><td style="color:white;font-weight:700">Member Calls, Answered</td></tr>
<tr><td style="padding:4px 0;color:#8a99b8">Photo 4 (document signing)</td><td style="color:white;font-weight:700">Rate Cases, Won Quicker</td></tr>
<tr><td style="padding:4px 0;color:#8a99b8">Photo 5 (hardhat)</td><td style="color:white;font-weight:700">Compliance, Always Ready</td></tr>
</table>
</div>

<div style="background:#0e1729;color:#cbd5e1;border:1px solid #1d2a44;border-radius:8px;padding:18px;margin-top:12px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Option B - action verb (what the AI does)</div>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:12px;margin-top:8px">
<tr><td style="padding:4px 0;width:140px;color:#8a99b8">Photo 1 (SCADA)</td><td style="color:white;font-weight:700">Predict the Outage</td></tr>
<tr><td style="padding:4px 0;color:#8a99b8">Photo 2 (lineman tablet)</td><td style="color:white;font-weight:700">Capture the Crew Knowledge</td></tr>
<tr><td style="padding:4px 0;color:#8a99b8">Photo 3 (CSR headset)</td><td style="color:white;font-weight:700">Triage the Storm Calls</td></tr>
<tr><td style="padding:4px 0;color:#8a99b8">Photo 4 (document signing)</td><td style="color:white;font-weight:700">Draft the Rate Case</td></tr>
<tr><td style="padding:4px 0;color:#8a99b8">Photo 5 (hardhat)</td><td style="color:white;font-weight:700">Track Every Regulation</td></tr>
</table>
</div>

<div style="background:#0e1729;color:#cbd5e1;border:1px solid #1d2a44;border-radius:8px;padding:18px;margin-top:12px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Option C - identity-led (who it is for)</div>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:12px;margin-top:8px">
<tr><td style="padding:4px 0;width:140px;color:#8a99b8">Photo 1 (SCADA)</td><td style="color:white;font-weight:700">For Your Ops Center</td></tr>
<tr><td style="padding:4px 0;color:#8a99b8">Photo 2 (lineman tablet)</td><td style="color:white;font-weight:700">For Your Line Crew</td></tr>
<tr><td style="padding:4px 0;color:#8a99b8">Photo 3 (CSR headset)</td><td style="color:white;font-weight:700">For Your Member-Services Desk</td></tr>
<tr><td style="padding:4px 0;color:#8a99b8">Photo 4 (document signing)</td><td style="color:white;font-weight:700">For Your Regulatory Team</td></tr>
<tr><td style="padding:4px 0;color:#8a99b8">Photo 5 (hardhat)</td><td style="color:white;font-weight:700">For Your Safety Officer</td></tr>
</table>
</div>

<p style="font-size:13px;color:#475569;margin-top:14px"><strong>My read</strong>: Option A is the most "tells the buyer what they get" (RE Magazine readers are co-op general managers + CFOs; they scan for outcomes). Option B is more punchy + matches the "automation models" framing in the headline. Option C reads warmer + makes the photos make more sense (each photo is literally the person doing that job). Pick one + I rebuild as V7 in an hour. Or mix - say "A for photos 1+2, B for the rest" and I do that.</p>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">Two open items I still need from you (carryover from V5)</h2>

<div style="background:#0f172a;color:white;padding:16px 20px;border-radius:8px;margin-bottom:12px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q1 - ROI numbers, defensibility</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">The yellow ROI per tile ($180K, 7-min, 38%, 60%, +12 NPS, 3wks-to-4d, $50K). I can defend 7-min RCA + 38% journeyman ramp from prior research. Rest are placeholders I drafted to make the ad concrete. Tell me which to keep, which to soften ("hundreds of thousands"), which need a hard source before press.</div>
</div>

<div style="background:#0f172a;color:white;padding:16px 20px;border-radius:8px;margin-bottom:12px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Q2 - Lock M4 as the finalist?</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">You only edited M4 again. Want me to kill M1/M2/M3/M5 and put 100% on a press-ready M4 PDF for Thursday EOD? Or apply the same headline + footer treatment to one other mockup for a head-to-head?</div>
</div>

<p style="font-size:14px;color:#1f2937;margin:18px 0 0">PDF + standalone HTML attached. PDF is what you would hand to a printer. Reply with your caption-set pick + any tweaks; I have the cycle time to do V7 same-day.</p>

</div>

<div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `David - V6 in. Your 2026-06-03 asks applied. Plus 3 caption-set options for the headlines you asked me to suggest.

YOUR ASKS APPLIED:
- Smaller print to 2 lines: each tile description tightened + 2-line clamp safety
- Yellow words to 2 lines: ROI lines shortened ($180K per outage / 7-min RCA, $50K/yr penalty avoided / Per pilot, etc.) + same clamp
- Caption baseline alignment: solved via the 2-line clamp - all 5 names sit at the same vertical baseline regardless of description length
- Center NRECA: already centered in V5; the new 3-column footer keeps it dead center
- QR right of the URL: pulled QR out of its own column, dropped to 36px inline image immediately right of the URL inside the Colaberry footer column. Footer is now 3 cols [Colaberry+URL+QR] / [NRECA] / [David]
- dlahme@ right-justified + bold: done

CAPTION OPTIONS for the "better headline captions" question:
A - benefit-led (what the co-op gets): Outages Solved Faster / Reports Without Writing / Member Calls Answered / Rate Cases Won Quicker / Compliance Always Ready
B - action verb (what the AI does): Predict the Outage / Capture the Crew Knowledge / Triage the Storm Calls / Draft the Rate Case / Track Every Regulation
C - identity-led (who it is for): For Your Ops Center / For Your Line Crew / For Your Member-Services Desk / For Your Regulatory Team / For Your Safety Officer

My read: A is most "tells the buyer what they get" (RE Magazine readers are co-op GMs + CFOs scanning for outcomes). B is punchier + matches the "automation models" framing. C reads warmer + makes the photos make more sense. Pick one - or mix - and I rebuild as V7 in an hour.

TWO OPEN FROM V5 (still need from you):
Q1 - ROI numbers defensibility ($180K, 7-min, 38%, etc.) - which to keep / soften / source?
Q2 - Lock M4 as finalist + kill M1/M2/M3/M5? Or apply same treatment to one other for head-to-head?

PDF + standalone HTML attached. Reply with caption pick + any tweaks; V7 same-day.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9955562788,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'dlahme@colaberry.com',
    cc: ['ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Open for Advertising - RE Magazine - M4 V6 (your 2026-06-03 edits applied) + caption options',
    html: HTML,
    text: TEXT,
    attachments: [
      { filename: 'coop-ad-mockups-2026-06-02-standalone.html', content: fs.readFileSync(HTML_PATH), contentType: 'text/html' },
      { filename: 'coop-ad-mockups-2026-06-02.pdf', content: fs.readFileSync(PDF_PATH), contentType: 'application/pdf' },
      { filename: 'mockup-4-v6.png', content: fs.readFileSync(M4_THUMB), cid: 'mockup4v6' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    bcSummary: '<p>Reply to David with M4 V6 (his 2026-06-03 12:34 UTC asks applied). All 6 concrete edits landed: tighter tile descs + 2-line clamp, shortened yellow ROI lines + 2-line clamp, caption-baseline alignment via the clamp, NRECA already centered (V5 carryover), QR inline next to URL inside Colaberry column (footer dropped to 3 cols), dlahme@ right-justified + bold. PLUS 3 caption-set options (A benefit-led, B action verb, C identity-led) for the open "better headline captions" question David asked me to suggest. Q1 ROI defensibility + Q2 lock M4 as finalist still open from V5. Mandrill + BC comment + Vault upload via sendWithBcAttach. Trigger render path fix coming as a separate commit.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
