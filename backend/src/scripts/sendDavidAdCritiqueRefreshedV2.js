#!/usr/bin/env node
// Refreshed critique email to David (CC Ram, BCC Ali). HTML attachment is the
// updated downloadable critique tool with Colaberry logo + machine-readable
// [CB-AD-CRITIQUE-V1] marker so Ali's auto-processor can ingest the reply.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const REPO = path.resolve(__dirname, '../../..');
const PDF_PATH = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.pdf');
const HTML_PATH = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.html');
const LOGO_PATH = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/logo-colaberry-dark.png');

const EMAIL = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:720px;margin:0 auto;background:white">

<div style="background:linear-gradient(135deg,#0f172a 0%,#1a365d 100%);color:white;padding:28px 32px">
<img src="cid:logo" alt="Colaberry" style="height:36px;display:block;margin-bottom:14px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">RE Magazine - half-page horizontal ad - refreshed critique tool</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">David - the downloadable HTML you asked for. Critique with red pen, paste back to me.</h1>
<div style="font-size:13px;color:#cbd5e0">Same review-tool pattern as the About Colaberry overview - 5 concepts, per-concept widgets (Finalist / Keep / Edits / Drop + free-text notes), Generate Reply button at the bottom. PDF + HTML both attached.</div>
</div>

<div style="padding:24px 32px">

<p style="font-size:14px;color:#1f2937;margin:0 0 12px">David,</p>

<p style="font-size:14px;color:#1f2937;margin:0 0 12px">Per your note this morning. Here is the refreshed critique tool with the Colaberry logo embedded + same widget pattern you used for the About Colaberry overview review.</p>

<div style="padding:16px 20px;background:#fef9e7;border-left:5px solid #d4a017;border-radius:0 6px 6px 0;font-size:13px;color:#78350f;margin-bottom:18px">
<strong>How to use:</strong>
<ol style="margin:6px 0 0;padding-left:20px;line-height:1.7">
<li>Download the attached <strong>coop-ad-mockups-2026-06-02.html</strong> and open it in your browser (Chrome / Safari / Edge).</li>
<li>Scroll through the 5 mockups. Each has a feedback widget at the bottom of its card.</li>
<li>Pick one verdict per concept (Finalist / Keep as-is / Keep with edits / Drop) + drop notes in the textarea.</li>
<li>Scroll to the bottom. Click <strong>Generate Reply</strong>. Enter your name when prompted. The textbox fills with a structured summary.</li>
<li>Copy that textbox content. Reply to this email and paste it.</li>
</ol>
<div style="margin-top:8px"><strong>What happens next:</strong> the moment your reply lands, the system parses your verdicts + notes per concept and posts each one as a comment on the <a href="https://app.basecamp.com/3945211/buckets/7463955/todos/9955562788" style="color:#1a365d">Basecamp tracker for this campaign</a>. I will see the full set Wednesday morning + start production design that day.</div>
</div>

<p style="font-size:14px;color:#1f2937;margin:0 0 12px">The 5 concepts:</p>

<ol style="font-size:14px;color:#1f2937;line-height:1.7;padding-left:22px">
<li><strong>Crew Productivity</strong> - "Your linemen shouldn't be writing reports." Lineman silhouette photo + diagonal red "Trusted Co-Op Partner" stamp.</li>
<li><strong>AI in Plain English</strong> - "What 837 co-op CEOs asked us about AI last quarter." Editorial portrait + italic red CEO questions + red rounded CTA button.</li>
<li><strong>7 Minutes (Outage to Insight)</strong> - oversized red "7" numeral + transmission tower at sunset + 3 metric callouts.</li>
<li><strong>Five Platforms catalog</strong> - red top bar + 5 product tiles, each with its own photo (SCADA, lineman, CSR, document signing, hard hat).</li>
<li><strong>40% Workforce Crisis</strong> - "40% of your linemen retire in 8 years." Split veteran/apprentice photos + red "8 YEARS" gap label + giant red 40%.</li>
</ol>

<p style="font-size:14px;color:#1f2937;margin:14px 0 12px">Each one has my honest designer's notes baked in - what is working, what to pressure-test, the one question I want your answer on. Red pen welcome.</p>

<div style="padding:14px 18px;background:#0f172a;color:white;border-radius:8px;font-size:13px;margin-top:12px">
<strong style="color:#fbbf24">Open questions still standing</strong> (carry over from Tuesday): Gold-tier commitment ($9,500/yr for the 50% discount), NRECA Supporting Member badge usage rights, QR code yes/no, real source data for stats (837 CEOs / 7 minutes / 40% / 93%), photography path (commissioned / NRECA archive / keep stock).
</div>

<p style="font-size:14px;color:#1f2937;margin:18px 0 0">Thursday EOD is the copy deadline. If you can get me your read by Wednesday morning I can have the press-ready PDF in your inbox by Wednesday EOD.</p>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = strip(`David,

Per your note this morning. Refreshed critique tool attached - same review pattern as the About Colaberry overview review.

How to use:
1. Download the attached coop-ad-mockups-2026-06-02.html and open in your browser.
2. Scroll through the 5 mockups. Each has a feedback widget at the bottom of its card.
3. Pick a verdict per concept (Finalist / Keep / Edits / Drop) + drop notes.
4. Scroll to the bottom. Click Generate Reply. Enter your name. Copy the textbox.
5. Reply to this email and paste it.

What happens next: the moment your reply lands, the system parses your verdicts + notes per concept and posts each one as a comment on the Basecamp tracker for this campaign. I see the full set Wednesday morning + start production design.

The 5 concepts:
1. Crew Productivity - "Your linemen shouldn't be writing reports." Lineman silhouette + diagonal red stamp.
2. AI in Plain English - "What 837 co-op CEOs asked us about AI last quarter." Editorial portrait + italic red CEO questions + red CTA.
3. 7 Minutes (Outage to Insight) - oversized red "7" + transmission tower + 3 metric callouts.
4. Five Platforms catalog - red top bar + 5 tiles, each with its own photo.
5. 40% Workforce Crisis - "40% of your linemen retire in 8 years." Split veteran/apprentice + red 8 YEARS gap + giant red 40%.

Each has my honest designer's notes baked in - what's working, what to pressure-test, the one question for you. Red pen welcome.

Open questions still: Gold-tier commitment ($9,500/yr for 50% discount), NRECA badge rights, QR code yes/no, real source data for stats, photography path.

Thursday EOD is the copy deadline. Wednesday morning gets you the press-ready PDF by EOD same day.

Ali`);

(async () => {
  validateBeforeSend(EMAIL, TEXT);
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
    subject: 'Re: Open for Advertising - RE Magazine - refreshed critique HTML (download + reply with feedback)',
    text: TEXT, html: EMAIL,
    attachments: [
      { filename: 'coop-ad-mockups-2026-06-02.html', content: fs.readFileSync(HTML_PATH), contentType: 'text/html' },
      { filename: 'coop-ad-mockups-2026-06-02.pdf', content: fs.readFileSync(PDF_PATH), contentType: 'application/pdf' },
      { filename: 'colaberry-logo.png', content: fs.readFileSync(LOGO_PATH), cid: 'logo' },
    ],
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
