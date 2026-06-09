#!/usr/bin/env node
// David M4 V10 reply. PNG-embed approach (PDF + HTML render the full ad
// with no cutoff). All 13 of David's concrete edits from the last 10
// emails verified satisfied. Includes branded signature.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const REPO = path.resolve(__dirname, '../../..');
const HTML_PATH   = path.join(REPO, 'docs/m4-v10-standalone.html');
const PDF_CANON   = path.join(REPO, 'docs/m4-v10-7x4.5-canonical.pdf');
const PDF_ALT     = path.join(REPO, 'docs/m4-v10-7x4.625-alt.pdf');
const PDF_CURRENT = path.join(REPO, 'docs/m4-v10-7x4.55-current.pdf');
const M4_PNG      = path.join(REPO, 'tmp/m4-v10-source.png');
const LOGO_PATH   = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');

// Branded signature per memory/reference_email_signature.md - locked 2026-05-27
const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 20px;">
  <tr><td>
    <div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
    <div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
    <div style="color: #718096;">Colaberry Inc.</div>
    <div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
    <div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
    <div style="margin-top: 14px;">
      <a href="https://advisor.colaberry.ai/advisory" style="display: inline-block; background: #2b6cb0; color: #ffffff; padding: 9px 18px; border-radius: 20px; text-decoration: none; font-weight: 600;">Design Your AI Organization</a>
    </div>
  </td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com  |  enterprise.colaberry.ai
Design Your AI Organization: https://advisor.colaberry.ai/advisory`;

const BODY_HTML = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.55; max-width: 760px;">

<div style="background:#0f172a;color:white;padding:24px 28px;border-radius:8px 8px 0 0">
<img src="cid:logo" alt="Colaberry" style="height:30px;display:block;margin-bottom:10px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mockup 4 V10 - full ad visible</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800;line-height:1.3;color:white">David - V10. Cutoff fixed at the root. Full ad visible in all three PDFs and the HTML. 3 edits + V7-V8 + branded signature on this email.</h1>
</div>

<div style="padding:24px 28px">

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">David,</p>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">The cutoff was a real CSS specificity + aspect-ratio conflict in my source. The multi-mockup HTML had an aspect-ratio constraint on the ad container plus overflow:hidden, which silently clipped V8 hero strip + V9 NRECA tagline content. V10 fix bypasses the conflict entirely - I now render the M4 mockup at full content width with the constraint disabled, then embed the resulting clean PNG into each PDF page. Every section is visible end to end. Same fix applied to the standalone HTML.</p>

<div style="margin:16px 0;text-align:center;padding:14px;background:#e2e8f0;border-radius:8px">
<img src="cid:mockup4v10" alt="Mockup 4 V10 - full ad" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15);border:1px solid #cbd5e1">
<div style="margin-top:10px;font-size:12px;color:#475569;font-style:italic">Mockup 4 V10 - full ad, no cutoff, ready for press</div>
</div>

<h2 style="font-family: arial, sans-serif; font-size:16px;margin:20px 0 10px;color:#1a365d">Your 3 edits from this morning's email - applied</h2>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family: arial, sans-serif; font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:46%">Your ask</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:54%">What I changed</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#2d3748">Bold "All five run on your stack: on prem, AWS, Azure, or GCP. SOC 2 + NERC CIP documented. No model training on your data. Pilot in 30 days."</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Sub-line bumped to 800 weight + darker ink for press readability.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#2d3748">Align all white bold tile names so the top line is level across the photos.</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#14532d">Done. Flex container was centering the 2-line RATE CASE / AUTOMATION block, pushing its top above single-line tiles. Switched to flex-start. All five names share the same top baseline.</td></tr>
<tr><td style="padding:10px 14px;vertical-align:top;color:#2d3748">Center and bold "Supporting Utilities for over 15 Years" directly under the NRECA badge.</td><td style="padding:10px 14px;vertical-align:top;color:#14532d">Done. New 800-weight tagline, navy, centered under the badge.</td></tr>
</tbody>
</table>

<h2 style="font-family: arial, sans-serif; font-size:16px;margin:24px 0 10px;color:#1a365d">NRECA color - one heads up</h2>
<div style="background:#fef9c3;border:1px solid #f59e0b;border-radius:8px;padding:14px 18px;margin-bottom:14px">
<div style="font-family: arial, sans-serif; font-size:13px;color:#451a03;line-height:1.55">
You asked me to flip NRECA from red to black in V7. The CSS rule I wrote had lower specificity than the original red rule, so the black change never actually rendered - you've been looking at red NRECA in every send since V7 (you said "red NRECA" in your last email which tipped me off). V10 fixes the specificity. NRECA is now black as you originally requested. If you'd rather keep it red after all, say the word and I flip it back in V11.
</div>
</div>

<h2 style="font-family: arial, sans-serif; font-size:16px;margin:24px 0 10px;color:#1a365d">Four artifacts attached - pick the trim that matches Sarah's media kit</h2>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family: arial, sans-serif; font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">File</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">Trim</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">Bleed</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#2d3748">m4-v10-7x4.5-canonical.pdf</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#2d3748">7" x 4.5" (most common)</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#2d3748">7.25" x 4.75"</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#2d3748">m4-v10-7x4.625-alt.pdf</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#2d3748">7" x 4.625" (alt spec)</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#2d3748">7.25" x 4.875"</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#2d3748">m4-v10-7x4.55-current.pdf</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#2d3748">7" x 4.55" (current iteration)</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#2d3748">7.25" x 4.8"</td></tr>
<tr><td style="padding:10px 14px;color:#2d3748">m4-v10-standalone.html</td><td style="padding:10px 14px;color:#2d3748" colspan="2">Responsive HTML, no asset folder needed, opens in any browser</td></tr>
</tbody>
</table>

<h2 style="font-family: arial, sans-serif; font-size:16px;margin:24px 0 10px;color:#1a365d">Themes you raised earlier - status</h2>
<p style="font-family: arial, sans-serif; font-size:13px;color:#475569;margin:0 0 8px">Quick pass against the broader themes from your Jun 1-2 emails so nothing falls through:</p>
<ul style="font-family: arial, sans-serif; font-size:13px;color:#2d3748;margin:0 0 14px;padding-left:22px;line-height:1.7">
<li><strong>Red for visual punch</strong> - landed: red top bar, red ROI strip</li>
<li><strong>Security focus</strong> - landed: "SOC 2 + NERC CIP documented" in hero strip and sub-line</li>
<li><strong>Workforce productivity ~15%</strong> - landed: "Cover 15% more line" in Crew Productivity</li>
<li><strong>Outage / predictive failure</strong> - landed: Outage IQ tile with "$180K per outage / 7-min RCA"</li>
<li><strong>Financial reporting ~80% cycle</strong> - landed: "80% time reduction" in Rate Case Automation</li>
<li><strong>10-year IOU heritage</strong> - NOT in V10. Easy add to the dark hero strip if you want it. Say the word and I drop it in V11.</li>
<li><strong>3-year plan messaging</strong> (Eugene Hammerisk's input) - NOT in V10. Would need a content swap somewhere. Tell me where you want it.</li>
</ul>

<p style="font-family: arial, sans-serif; font-size:14px;color:#2d3748;margin:18px 0 0">Same Thursday EOD target. Ping me with the trim Sarah specifies and I drop the other two. V11 same-day if you want the IOU heritage or 3-year plan messaging added.</p>

</div>

${SIG_HTML}

</div>`;

const BODY_TEXT = `David,

The cutoff was a real CSS specificity + aspect-ratio conflict in my source. The multi-mockup HTML had an aspect-ratio constraint on the ad container plus overflow:hidden, which silently clipped V8 hero strip + V9 NRECA tagline content. V10 fix bypasses the conflict entirely - render the M4 mockup at full content width with the constraint disabled, then embed the resulting clean PNG into each PDF page. Every section is visible end to end. Same fix applied to the standalone HTML.

YOUR 3 EDITS FROM THIS MORNING'S EMAIL - APPLIED:
1. Bold sub-line "All five run on your stack..." - done, 800 weight + darker ink
2. Tile-name top-line alignment - done, flex container switched from center to flex-start so 2-line RATE CASE / AUTOMATION no longer pushes its top above single-line tiles
3. "Supporting Utilities for over 15 Years" centered + bold under NRECA - done, new 800-weight tagline

NRECA COLOR HEADS UP: you asked me to flip NRECA from red to black in V7. The CSS rule I wrote had lower specificity than the original red rule, so the black change never actually rendered - you have been looking at red NRECA in every send since V7. V10 fixes the specificity. NRECA is now black as originally requested. If you would rather keep it red, say the word and I flip back in V11.

FOUR ARTIFACTS ATTACHED - PICK THE TRIM MATCHING SARAH'S MEDIA KIT:
- m4-v10-7x4.5-canonical.pdf - 7" x 4.5" (most common half-page horizontal), 7.25" x 4.75" bleed
- m4-v10-7x4.625-alt.pdf - 7" x 4.625" (alt spec), 7.25" x 4.875" bleed
- m4-v10-7x4.55-current.pdf - 7" x 4.55" (current iteration), 7.25" x 4.8" bleed
- m4-v10-standalone.html - responsive HTML, no asset folder needed

THEMES YOU RAISED EARLIER (Jun 1-2 emails) - STATUS:
- Red for punch: landed
- Security focus: landed ("SOC 2 + NERC CIP documented")
- Workforce productivity ~15%: landed ("Cover 15% more line")
- Outage / predictive failure: landed (Outage IQ tile)
- Financial reporting ~80% cycle: landed ("80% time reduction")
- 10-year IOU heritage: NOT in V10. Easy add to hero strip if you want it - say the word.
- 3-year plan messaging (Eugene's input): NOT in V10. Tell me where you want it placed.

Same Thursday EOD target. Ping me with the trim Sarah specifies and I drop the other two. V11 same-day if you want IOU heritage or 3-year plan added.

${SIG_TEXT}`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9955562788,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'dlahme@colaberry.com',
    cc: ['ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Open for Advertising - RE Magazine - M4 V10 (cutoff fixed, full ad visible, 3 edits applied)',
    html: BODY_HTML,
    text: BODY_TEXT,
    attachments: [
      { filename: 'm4-v10-7x4.5-canonical.pdf', content: fs.readFileSync(PDF_CANON), contentType: 'application/pdf' },
      { filename: 'm4-v10-7x4.625-alt.pdf', content: fs.readFileSync(PDF_ALT), contentType: 'application/pdf' },
      { filename: 'm4-v10-7x4.55-current.pdf', content: fs.readFileSync(PDF_CURRENT), contentType: 'application/pdf' },
      { filename: 'M4-RE-Magazine-V10-standalone.html', content: fs.readFileSync(HTML_PATH), contentType: 'text/html' },
      { filename: 'mockup-4-v10.png', content: fs.readFileSync(M4_PNG), cid: 'mockup4v10' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    bcSummary: '<p>V10 to David. Root-caused the cutoff: multi-mockup CSS had aspect-ratio 1.54/1 + overflow:hidden on .ad-mockup that silently clipped V8 hero strip + V9 NRECA tagline at smaller render widths. V10 sidesteps via PNG-embed: render M4 at full width with constraint disabled, embed clean PNG into PDF/HTML pages. All 13 of David concrete edits from last 10 emails verified satisfied. NRECA black fix from V7 also now actually rendering (CSS specificity bumped). Sent 3 PDF trims + standalone HTML. Branded signature included per memory. Tier 2 themes (10-year IOU heritage, 3-year plan messaging from Eugene Hammerisk) surfaced for V11 if David wants.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
