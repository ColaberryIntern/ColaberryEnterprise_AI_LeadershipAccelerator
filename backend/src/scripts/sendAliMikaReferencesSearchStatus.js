#!/usr/bin/env node
// Status update for Ali: searched extensively for Mika's "references document
// for students" and couldn't find a clear match. Ask for a hint.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Aptos,Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:720px;margin:0 auto;background:white">

<div style="background:#0f172a;color:white;padding:24px 30px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mika references doc - search status</div>
<h1 style="margin:6px 0;font-size:20px;font-weight:800">Searched 8 different angles. Can't pinpoint the document - need a hint.</h1>
</div>

<div style="padding:24px 30px">

<div style="font-size:14px;color:#1f2937">Ran these Gmail queries:</div>

<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:10px;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:12px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:1px">Query</th>
<th style="padding:8px 12px;text-align:right;font-size:11px;letter-spacing:1px">Hits</th>
</tr></thead>
<tbody>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">from:mika "references"</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">1 (just Charlene's "Resume and Reference Help Post IPBC" thread, no attachment from Mika)</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">from:mika has:attachment</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">~17 (all commission spreadsheets)</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">from:mika "reference list" OR "reference template" OR "letter of reference"</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">1 (same Charlene thread)</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">from:mika has:drive OR has:document</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">0</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">subject:references OR subject:"reference" from:mika</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">1 (Charlene thread)</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">from:mika (resume OR portfolio OR letter OR job OR placement)</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">~12 (mostly commission, plus 2 student-facing emails about resume policy)</td></tr>
<tr><td style="padding:8px 12px;font-family:monospace;font-size:11px">to:ali from:mika -subject:commission</td><td style="padding:8px 12px;text-align:right">many (orientation announcements, Basecamp notifications, student warnings - none labeled references)</td></tr>
</tbody>
</table>

<div style="margin-top:18px;padding:14px 18px;background:#fef9e7;border-left:5px solid #d4a017;border-radius:0 6px 6px 0;font-size:13px;color:#78350f">
<strong>What I found that's adjacent (but not the doc):</strong> Mika has shared a few how-to docs to students - "TMAY document" (Tell Me About Yourself), "How_to_Create_a_Data_Portfolio_on_Canva.docx", a LinkedIn building guide. All via Basecamp Internship project, not direct email. None of these is titled or about references for students.
</div>

<div style="margin-top:18px;font-size:14px;color:#1f2937"><strong>Best guess scenarios:</strong></div>
<ol style="font-size:13px;color:#1f2937;line-height:1.7">
<li>The doc was sent to students directly without CC'ing you - it's in their inboxes, not yours.</li>
<li>It's a Basecamp upload (not Gmail) on a thread I haven't surfaced yet.</li>
<li>The doc is titled something other than "references" (e.g., "Approved Speaker List," "Industry Contacts," "Hire Refactored Reference Sheet").</li>
<li>Older than 3 years and got truncated by my date filter.</li>
</ol>

<div style="margin-top:20px;padding:16px 20px;background:#0f172a;color:white;border-radius:8px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Quickest path forward</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">Drop me any one of these and I'll find it in 30 seconds:</div>
<ul style="font-size:13px;color:#cbd5e0;margin-top:8px;line-height:1.7">
<li>Approximate date or month you remember receiving it</li>
<li>The exact filename (or partial - e.g. "_references_v3.docx")</li>
<li>The subject line of the email it came on</li>
<li>Or "check Basecamp Internship/Apprenticeship project" if you remember it being there</li>
</ul>
</div>

<div style="margin-top:18px;font-size:13px;color:#475569">Sorry for the dead end. Once you give me a thread to pull, this should take seconds.</div>

</div>

<div style="padding:16px 30px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const text = strip(`Mika references doc search - status

Ran 8 different Gmail queries against ali@colaberry.com inbox. Found Charlene's January thread "Resume and Reference Help Post IPBC" where Mika replied with policy (no attachment), and ~17 commission spreadsheets, but no document clearly labeled as a references doc for students.

Adjacent docs I did find (Basecamp Internship project, not direct email): TMAY (Tell Me About Yourself) document, How_to_Create_a_Data_Portfolio_on_Canva.docx, LinkedIn building guide. None of these is the references doc.

Best guesses for why I'm missing it:
1. Sent to students directly without cc'ing you - lives in their inboxes
2. Basecamp upload not Gmail attachment
3. Titled something other than "references" (Approved Speaker List? Industry Contacts? Hire Refactored Reference Sheet?)
4. Older than 3 years (my date filter cut it)

Quickest path forward - drop me one of: approximate date, exact/partial filename, subject line of the email, or "check Basecamp Internship project." Will find it in 30 seconds.

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
    subject: '[Mika references doc] dead end on 8 queries - need a hint to find it',
    text, html: HTML,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
