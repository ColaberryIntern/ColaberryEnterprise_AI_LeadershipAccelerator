#!/usr/bin/env node
// Send Ali the 5 half-page horizontal ad mockups for review BEFORE David + Ram
// see them. PDF attached + link to the local HTML.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const HTML_PATH = path.resolve(__dirname, '../../../docs/coop-ad-mockups-2026-06-02.html');
const PDF_PATH = path.resolve(__dirname, '../../../docs/coop-ad-mockups-2026-06-02.pdf');
const PDF_BUF = fs.readFileSync(PDF_PATH);

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Aptos,Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:780px;margin:0 auto;background:white">

<div style="background:linear-gradient(135deg,#0f172a 0%,#1a365d 100%);color:white;padding:28px 34px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Co-op ad - half-page horizontal mockups for review</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800">5 visual mockups attached. David picked the placement + format + red accent direction.</h1>
<div style="font-size:14px;color:#cbd5e0">For your eyes first before David + Ram see them. PDF attached, HTML opens locally for the interactive feedback widget per mockup.</div>
</div>

<div style="padding:24px 34px">

<div style="padding:14px 18px;background:#fef2f2;border-left:5px solid #c1272d;border-radius:0 6px 6px 0;font-size:13px;color:#7f1d1d">
<strong>What David said this morning (2026-06-02):</strong> "I've booked a half page, four color, horizontal ad. All copy must be uploaded by Thursday evening at the latest. We'll need to pack a punch ... what attracts our eye's as readers? My thought is red - so lets see 'what' in red can be integrated into the ad for the 'punch'." (He's reading the rest on the flight to Charlotte.)
</div>

<h2 style="font-size:16px;color:#0f172a;margin-top:24px">The 5 mockups (each at 1.54:1 trim aspect, real typography + colors)</h2>

<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:10px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:8%">#</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:30%">Concept</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:38%">Red element (the punch)</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:24%">Best placement</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>1</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>Crew Productivity</strong><br><span style="font-size:11px;color:#94a3b8">"Your linemen shouldn't be writing reports."</span></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px">Diagonal "Trusted Co-Op Partner" red stamp, bottom right</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">RHP opp Co-op People or Forum</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>2</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>AI in Plain English</strong><br><span style="font-size:11px;color:#94a3b8">"What 837 co-op CEOs asked us about AI last quarter."</span></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px">Italic red CEO quote questions + red rounded CTA button</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">RHP opp Co-op Forum</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>3</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>7 Minutes</strong><br><span style="font-size:11px;color:#94a3b8">"From outage report to root cause."</span></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px">Oversized red "7" numeral fills the left third - the eye-magnet</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">RHP opp G&amp;T Focus</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>4</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>Five Platforms (catalog)</strong><br><span style="font-size:11px;color:#94a3b8">"Pick the one that solves your sharpest pain."</span></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px">Full-width red top bar - readable from across a desk</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">RHP opp Co-op Forum</td></tr>
<tr><td style="padding:10px 14px"><strong>5</strong></td><td style="padding:10px 14px"><strong>40% Workforce Crisis</strong><br><span style="font-size:11px;color:#94a3b8">"of your linemen retire in 8 years."</span></td><td style="padding:10px 14px;font-size:12px">Giant red "40%" + red "8 YEARS" gap label between veteran/apprentice photos</td><td style="padding:10px 14px;font-size:11px;color:#475569">LHP opp Co-op People</td></tr>
</tbody>
</table>

<div style="margin-top:22px;padding:16px 20px;background:#0f172a;color:white;border-radius:8px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">How to review (60 seconds)</div>
<ol style="font-size:13px;color:#cbd5e0;margin-top:6px;line-height:1.7">
<li>Open the attached <strong>PDF</strong> for the static visual (best for picking the direction at a glance).</li>
<li>For deeper edits, open the <strong>local HTML</strong> at <code style="background:#1e293b;color:#fbbf24;padding:2px 6px;border-radius:3px">docs/coop-ad-mockups-2026-06-02.html</code> - each mockup has a per-card feedback widget (Finalist / Keep / Edits / Drop + a notes textarea). Bottom of the page has a Generate Reply button.</li>
<li>Tell me which one to push to production (or how to remix two). I'll do the typography polish + handle photography sourcing.</li>
</ol>
</div>

<div style="margin-top:20px;padding:14px 18px;background:#fef9e7;border-left:5px solid #d4a017;border-radius:0 6px 6px 0;font-size:13px;color:#78350f">
<strong>Open questions baked into the review doc:</strong> photography path (commission / NRECA archive / typography-only fallback), NRECA Supporting Member badge usage rights, Gold-tier commitment ($9,500/yr for the 50% discount), QR codes on which mockups, and stat verification ("837 CEOs", "40% retire", "93% match"). All answerable Thursday morning once you pick the direction.
</div>

<div style="margin-top:20px;font-size:13px;color:#475569"><strong>Timeline:</strong> David's copy deadline is Thursday EOD (2026-06-04). Production round = typography polish + final art + press-ready PDF. If you lock the direction by Wed AM I can have the final PDF in your inbox by Wed EOD.</div>

</div>

<div style="padding:20px 34px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Holding here. Nothing goes to David or Ram until you say go.<br><br>
Ali
</div>

</div></body></html>`;

const text = strip(`Co-op ad - half-page horizontal mockups for review

David's response this morning: "I've booked a half page, four color, horizontal ad. All copy must be uploaded by Thursday evening at the latest. We'll need to pack a punch ... what attracts our eye's as readers? My thought is red - so lets see 'what' in red can be integrated into the ad for the 'punch'."

5 mockups built for your review first - PDF attached, interactive HTML at docs/coop-ad-mockups-2026-06-02.html.

1. Crew Productivity - "Your linemen shouldn't be writing reports." Diagonal red stamp.
2. AI in Plain English - "What 837 co-op CEOs asked us about AI last quarter." Red CTA button + italic red CEO questions.
3. 7 Minutes - "From outage report to root cause." Oversized red "7" left third.
4. Five Platforms catalog - Pick the one that solves your sharpest pain. Full-width red top bar.
5. 40% Workforce Crisis - "of your linemen retire in 8 years." Giant red "40%" + red "8 YEARS" gap label.

How to review:
- Open the PDF (attached) for the static visual.
- Open the HTML locally for the interactive feedback widget (Finalist/Keep/Edits/Drop + notes per mockup). Generate Reply button at the bottom.

Open questions for you: photography path, NRECA badge usage rights, Gold-tier commitment ($9,500/yr), QR codes, stat verification.

Timeline: David's copy deadline Thursday EOD. Final PDF in your inbox by Wed EOD if you lock direction Wed AM.

Holding here. Nothing goes to David or Ram until you say go.

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
    subject: '[For your review - DO NOT FWD YET] 5 half-page horizontal co-op ad mockups (red accent, per David)',
    text, html: HTML,
    attachments: [{ filename: 'coop-ad-mockups-2026-06-02.pdf', content: PDF_BUF, contentType: 'application/pdf' }],
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
