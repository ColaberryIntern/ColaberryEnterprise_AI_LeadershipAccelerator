#!/usr/bin/env node
// David M4 V9 reply. Three new edits + fixes a real rendering bug David
// flagged ("cuts off 1/3 of the bottom 4-5 times") + fixes a CSS specificity
// bug that meant V7's NRECA-black change never actually rendered.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const REPO = path.resolve(__dirname, '../../..');
const HTML_PATH = path.join(REPO, 'docs/m4-v8-standalone.html');
const PDF_CANONICAL = path.join(REPO, 'docs/m4-v9-7x4.5-canonical.pdf');
const PDF_ALT = path.join(REPO, 'docs/m4-v9-7x4.625-alt.pdf');
const PDF_CURRENT = path.join(REPO, 'docs/m4-v9-7x4.55-current.pdf');
const M4_THUMB = path.join(REPO, 'tmp/mockup-thumb-4.png');
const LOGO_PATH = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white">

<div style="background:#0f172a;color:white;padding:24px 28px">
<img src="cid:logo" alt="Colaberry" style="height:30px;display:block;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mockup 4 V9 - your 3 edits + cutoff bug fixed</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800;line-height:1.3">David - the cutoff was a real bug on my end. Fixed. Your 3 edits in. Standalone HTML rebuilt + the press PDF re-rolled to match.</h1>
</div>

<div style="padding:24px 28px">

<p style="font-size:14px;color:#1f2937;margin:0 0 14px">David,</p>

<p style="font-size:14px;color:#1f2937;margin:0 0 14px">First the bug: the standalone HTML I sent earlier had a CSS wrapper with a fixed aspect-ratio constraint. When your browser flexed the wrapper, the inner ad's intrinsic height overflowed and the bottom third got clipped. That's why you saw it 4-5 times. Dropped the aspect-ratio constraint in V9; the inner ad self-sizes now and renders complete in every browser I tested.</p>

<div style="margin:16px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<img src="cid:mockup4v9" alt="Mockup 4 V9" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
<div style="margin-top:10px;font-size:12px;color:#475569;font-style:italic">Mockup 4 V9 - what the HTML and PDF both render to</div>
</div>

<h2 style="font-size:16px;margin:20px 0 10px;color:#0f172a">Your 3 edits, applied</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:46%">Your ask</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:54%">What I changed</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Bold "All five run on your stack: on prem, AWS, Azure, or GCP. SOC 2 + NERC CIP documented. No model training on your data. Pilot in 30 days."</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Sub-line bumped to 800 weight + darker ink (#1f2937 from #64748b) so it reads bold without losing readability at half-page trim.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">Align all white bold tile names so the top line is level across the photos.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. The flex container was center-aligning - which pushed the 2-line RATE CASE / AUTOMATION block's top line up above the single-line names. Switched to flex-start. All five tile names now share the same top baseline.</td></tr>
<tr><td style="padding:10px 14px;vertical-align:top">Center and bold "Supporting Utilities for over 15 Years" directly under the NRECA badge.</td><td style="padding:10px 14px;vertical-align:top;color:#14532d">Done. New 9.5px Inter 800-weight tagline, navy, centered under the badge in the footer's NRECA column.</td></tr>
</tbody>
</table>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">One thing I caught while in there</h2>
<div style="background:#fef9c3;border:1px solid #f59e0b;border-radius:8px;padding:14px 18px;margin-bottom:14px">
<div style="font-size:13px;color:#451a03;line-height:1.55">
You asked me to flip NRECA from red to black back in V7. The CSS rule I wrote had lower specificity than the original red rule, so the black change never actually rendered. You've been looking at red NRECA in every send since (you said "red NRECA" in this email which tipped me off). Fixed in V9 - bumped the selector specificity. NRECA is now black as you originally requested. <strong>If you'd rather keep it red after all, say the word and I flip it back in V10.</strong>
</div>
</div>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">Three PDFs at three half-page horizontal trims + one HTML — pick the one that matches NRECA's spec sheet for the July issue</h2>
<p style="font-size:13px;color:#475569;margin:0 0 12px">RE Magazine half-page horizontal has been spec'd at 7" x 4.5" most often but I have seen 7" x 4.625" and 7" x 4.55" in different media kits. Sending all three so you can match whatever Sarah Faconti's spec sheet for July says exactly. The artwork is identical; only the trim + bleed dimensions differ.</p>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">File</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">Trim</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">Bleed</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">Aspect</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">m4-v9-7x4.5-canonical.pdf</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">7" x 4.5"</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">7.25" x 4.75"</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">1.555:1 (most common)</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">m4-v9-7x4.625-alt.pdf</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">7" x 4.625"</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">7.25" x 4.875"</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">1.514:1 (alt spec)</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">m4-v9-7x4.55-current.pdf</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">7" x 4.55"</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">7.25" x 4.8"</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">1.538:1 (current iteration)</td></tr>
<tr><td style="padding:10px 14px">M4-RE-Magazine-V9-standalone.html</td><td style="padding:10px 14px" colspan="3">Responsive HTML, opens in any browser, cutoff bug fixed</td></tr>
</tbody>
</table>

<p style="font-size:13px;color:#475569;margin:18px 0 0">Same Thursday EOD target if V9 holds. Ping me with the trim Sarah specifies and I drop the other two. If anything else, V10 same-day.</p>

</div>

<div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `David - the cutoff was a real bug on my end. Fixed. Your 3 edits in. Standalone HTML rebuilt + the press PDF re-rolled to match.

THE CUTOFF BUG: the standalone HTML had a CSS wrapper with a fixed aspect-ratio constraint. When your browser flexed the wrapper, the inner ad's intrinsic height overflowed and the bottom third got clipped. That's why you saw it 4-5 times. Dropped the aspect-ratio constraint in V9; the inner ad self-sizes now and renders complete in every browser.

YOUR 3 EDITS APPLIED:
1. Bold the sub-line "All five run on your stack..." - done, bumped to 800 weight + darker ink
2. Align tile-name top lines - done, switched flex container from center to flex-start so the 2-line RATE CASE / AUTOMATION block no longer pushes its top line above the single-line tiles
3. "Supporting Utilities for over 15 Years" centered + bold under NRECA - done, new 9.5px Inter 800-weight tagline

ONE THING I CAUGHT: you asked me to flip NRECA from red to black back in V7. The CSS rule had lower specificity than the original red rule, so the black change never actually rendered. You've been looking at red NRECA in every send since (you said "red NRECA" in this email which tipped me off). Fixed in V9 - NRECA is now black as you originally requested. If you'd rather keep it red, say the word and I flip back.

FOUR ARTIFACTS ATTACHED - three PDFs at three half-page horizontal trim variants, one HTML:

1. m4-v9-7x4.5-canonical.pdf - 7" x 4.5" trim, 7.25" x 4.75" bleed, 1.555:1 (most common half-page horizontal spec)
2. m4-v9-7x4.625-alt.pdf - 7" x 4.625" trim, 7.25" x 4.875" bleed, 1.514:1 (alt spec some media kits use)
3. m4-v9-7x4.55-current.pdf - 7" x 4.55" trim, 7.25" x 4.8" bleed, 1.538:1 (the iteration you have been looking at)
4. M4-RE-Magazine-V9-standalone.html - responsive HTML, opens in any browser, cutoff bug fixed

Match Sarah Faconti's NRECA media kit for the July issue and pick the trim that fits. The artwork is identical across all three; only dimensions differ.

Same Thursday EOD target if V9 holds. Ping me with the trim Sarah specifies and I drop the other two. V10 same-day if anything else.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9955562788,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'dlahme@colaberry.com',
    cc: ['ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Open for Advertising - RE Magazine - M4 V9 (3 edits + cutoff bug fixed)',
    html: HTML,
    text: TEXT,
    attachments: [
      { filename: 'm4-v9-7x4.5-canonical.pdf', content: fs.readFileSync(PDF_CANONICAL), contentType: 'application/pdf' },
      { filename: 'm4-v9-7x4.625-alt.pdf', content: fs.readFileSync(PDF_ALT), contentType: 'application/pdf' },
      { filename: 'm4-v9-7x4.55-current.pdf', content: fs.readFileSync(PDF_CURRENT), contentType: 'application/pdf' },
      { filename: 'M4-RE-Magazine-V9-standalone-2026-06-03.html', content: fs.readFileSync(HTML_PATH), contentType: 'text/html' },
      { filename: 'mockup-4-v9.png', content: fs.readFileSync(M4_THUMB), cid: 'mockup4v9' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    bcSummary: '<p>V9 to David. Acknowledged + fixed the standalone HTML cutoff bug (aspect-ratio CSS wrapper constraint clipped the bottom 1/3 - root cause + fix explained). Applied 3 edits per his 4:06 PM email: bold sub-line / tile-name top-line alignment (flex-start instead of center) / "Supporting Utilities for over 15 Years" centered + bold under NRECA. Also surfaced + fixed a CSS specificity bug from V7: the NRECA red-to-black change never actually rendered in any send since V7. Flagged in reply with offer to flip back to red if he prefers. Sent 3 PDF dimension variants (7"x4.5" canonical / 7"x4.625" alt / 7"x4.55" current) per Ali "send all of them" - David picks the one matching Sarah Faconti NRECA media kit for the July issue. Standalone HTML also attached.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
