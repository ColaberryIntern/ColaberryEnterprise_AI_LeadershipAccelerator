// Final corrected fill + send for HireRight education verification.
// Fixes 2 bugs in the prior draft: Start Date Incorrect was checked (should
// not be), and Date Awarded was unchecked (should be marked Correct). Also
// updates "Your Information" per Ali's specs (Manager / 972-992-1024 /
// support@colaberry.com) and SENDS to HireRight directly (no more draft
// to Ali). Reply-all preserves the original thread.
//
// Runs INSIDE accelerator-backend container.

const path = require('path');
const fs = require('fs');
const axios = require('/app/node_modules/axios');
const nodemailer = require('/app/node_modules/nodemailer');
const { chromium } = require('/app/node_modules/playwright');

// Inline the sendWithBcAttach logic (helper isn't in the dist image).
async function sendAndAttach({ ticketId, from, to, cc, bcc, replyTo, subject, html, text, attachments, bcSummary }) {
  if (!ticketId) throw new Error('ticketId required');
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const sent = await transport.sendMail({
    from, to, cc, bcc, replyTo, subject, html, text, attachments,
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
  const escapeHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const recipientStr = [
    to && `<strong>To:</strong> ${escapeHtml([].concat(to).join(', '))}`,
    cc && cc.length && `<strong>Cc:</strong> ${escapeHtml([].concat(cc).join(', '))}`,
    bcc && bcc.length && `<strong>Bcc:</strong> ${escapeHtml([].concat(bcc).join(', '))}`,
  ].filter(Boolean).join(' &middot; ');
  const commentHtml = `<div style="background:#fef9e7;border-left:5px solid #d4a017;padding:14px 18px;border-radius:0 6px 6px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">Outbound email attached per operating doctrine</div>
<div style="font-size:13px;color:#78350f;margin-top:4px">Sent ${new Date().toISOString()}. Auto-attached by tmp/kagoiya_send_to_hireright.js.</div>
</div>
<div style="margin-top:12px"><strong>Subject:</strong> ${escapeHtml(subject)}</div>
<div style="margin-top:4px;font-size:13px;color:#475569">${recipientStr}</div>
<div style="margin-top:4px"><strong>Mandrill:</strong> <code>${escapeHtml(sent.messageId)}</code></div>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">
${bcSummary || ''}`;
  const commentR = await axios.post(
    `https://3.basecampapi.com/3945211/buckets/${ALI_PERSONAL_BUCKET}/recordings/${ticketId}/comments.json`,
    { content: commentHtml },
    { headers: BC_HEADERS },
  );
  return { mandrillId: sent.messageId, commentUrl: commentR.data.app_url };
}

const BC_HEADERS = {
  Authorization: `Bearer ${process.env.BASECAMP_ACCESS_TOKEN}`,
  'User-Agent': 'Colaberry kagoiya-edu-send',
  'Content-Type': 'application/json',
};

const ALI_PERSONAL_BUCKET = 7463955;
const ALI_PRODUCTS_LIST = 9939449052;
const ALI_USER_ID = 17454835;

// Filled checkbox style
const CHECKED = '<div class="checkBox" style="background:#000;color:#fff;text-align:center;font-size:11pt;line-height:11pt;font-weight:bold">&#10003;</div>';
const UNCHECKED = '<div class="checkBox"></div>';

const BLANK_HTML = fs.readFileSync('/tmp/edu_blank.html', 'utf8');

// Mark the CORRECT checkbox for a given row, scoped by field name.
// The form's row HTML is: <b><span class="c11">FIELD_NAME</span></b> ... then
// two <td align="center"><div class="checkBox"></div></td> cells (Correct, Incorrect).
// We replace only the FIRST checkbox after the field-name marker.
function checkCorrectForField(html, fieldName) {
  const marker = `<b><span class="c11">${fieldName}</span></b>`;
  const idx = html.indexOf(marker);
  if (idx < 0) throw new Error('Field marker not found: ' + fieldName);
  const cbIdx = html.indexOf(UNCHECKED, idx);
  if (cbIdx < 0) throw new Error('No checkbox after field: ' + fieldName);
  return html.slice(0, cbIdx) + CHECKED + html.slice(cbIdx + UNCHECKED.length);
}

let filled = BLANK_HTML;
filled = checkCorrectForField(filled, 'Start Date');
filled = checkCorrectForField(filled, 'End Date');
filled = checkCorrectForField(filled, 'Type of Degree');
filled = checkCorrectForField(filled, 'Date Awarded');
filled = checkCorrectForField(filled, 'Major');

// Inject Additional Comments — the SSN-not-retained explanation
filled = filled.replace(
  '<b><span class="c11">*Additional comments: </span></b>\n        </p>',
  '<b><span class="c11">*Additional comments: </span></b><br/>'
  + '<span style="font-size:9pt">'
  + 'Verified against Colaberry School of Data Analytics student record system. '
  + 'Student name, date of birth, program dates, certificate award, and major all match our records exactly. '
  + 'Colaberry does not retain Social Security Numbers; SSN field could not be verified — please rely on other sources for SSN confirmation.'
  + '</span></p>',
);

// Inject Comments cell (under the field table)
filled = filled.replace(
  '<td class="c15">\n           \n          \n        </td>',
  '<td class="c15"><span style="font-size:9pt">'
  + 'Status: Graduated. Program completion: 100%. Program: Data Analytics (Certificate). '
  + 'Class: "Data Analytics Bootcamp - Jan 16 2021 (ONLINE)". '
  + 'Colaberry School of Data Analytics is licensed by the Texas Workforce Commission (TWC). '
  + 'No GPA assigned — completion is binary (Certificate awarded upon program completion).'
  + '</span></td>',
);

// Your Information block. Use precise field-name markers to avoid the
// regex-whitespace fragility from the prior draft.
function fillInfoCell(html, label, value) {
  // The label cell is <b><span class="c11">LABEL</span></b></td><td class="c15">...empty...</td>
  // Find the label, then replace the NEXT <td class="c15"> block until its closing </td>.
  const marker = `<b><span class="c11">${label}</span></b>`;
  const idx = html.indexOf(marker);
  if (idx < 0) throw new Error('Info label not found: ' + label);
  const tdStart = html.indexOf('<td class="c15">', idx);
  if (tdStart < 0) throw new Error('No c15 cell after label: ' + label);
  const tdEnd = html.indexOf('</td>', tdStart);
  return html.slice(0, tdStart)
    + `<td class="c15"><span style="font-size:10pt">${value}</span>`
    + html.slice(tdEnd);
}

// Phone + Fax sit in a different table layout (4 cells: label / value / label / value)
function fillPhoneAndFax(html, phone, fax) {
  // Marker: <b><span class="c11">Phone</span></b>
  const marker = `<b><span class="c11">Phone</span></b>`;
  const idx = html.indexOf(marker);
  if (idx < 0) throw new Error('Phone marker not found');
  // After Phone label cell, the next <td class="c12"> is Phone value
  const phoneValStart = html.indexOf('<td class="c12">', idx);
  const phoneValEnd = html.indexOf('</td>', phoneValStart);
  let out = html.slice(0, phoneValStart)
    + `<td class="c12"><span style="font-size:10pt">${phone}</span>`
    + html.slice(phoneValEnd);
  // Find Fax label and its c12 cell after the Phone value we just filled
  const faxIdx = out.indexOf(`<b><span class="c11">Fax</span></b>`);
  if (faxIdx < 0) throw new Error('Fax marker not found');
  const faxValStart = out.indexOf('<td class="c12">', faxIdx);
  const faxValEnd = out.indexOf('</td>', faxValStart);
  out = out.slice(0, faxValStart)
    + `<td class="c12"><span style="font-size:10pt">${fax}</span>`
    + out.slice(faxValEnd);
  return out;
}

filled = fillInfoCell(filled, 'Name', 'Ali Muwwakkil');
filled = fillInfoCell(filled, 'Position', 'Manager');
filled = fillPhoneAndFax(filled, '972-992-1024', '');
filled = fillInfoCell(filled, 'Email', 'support@colaberry.com');

fs.writeFileSync('/tmp/edu_filled_final.html', filled);

(async () => {
  // 1. Render PDF
  console.log('1/3 rendering PDF...');
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setContent(filled, { waitUntil: 'load' });
  await page.pdf({
    path: '/tmp/Ignesias_Kagoiya_Education_Verification.pdf',
    format: 'Letter',
    margin: { top: '0.6in', bottom: '0.6in', left: '0.5in', right: '0.5in' },
    printBackground: true,
  });
  await browser.close();
  const pdfBuf = fs.readFileSync('/tmp/Ignesias_Kagoiya_Education_Verification.pdf');
  console.log('   PDF size:', pdfBuf.length, 'bytes');

  // 2. Create BC tracking todo in Ali Personal
  console.log('2/3 creating BC tracking todo...');
  const todo = (await axios.post(
    `https://3.basecampapi.com/3945211/buckets/${ALI_PERSONAL_BUCKET}/todolists/${ALI_PRODUCTS_LIST}/todos.json`,
    {
      content: '[Edu Verification SENT] Ignesias Kagoiya - HireRight AT-060426-2C5H3',
      description: '<div>HireRight education verification response sent for Ignesias Kagoiya. All claims verified against CCPP student record (UserID 34640, StudentID 8208). Form fields marked Correct for Start Date, End Date, Type of Degree, Date Awarded, Major. SSN row left unchecked (Colaberry does not retain SSN). Reply sent to documentation@hireright.com with admissions@colaberry.com on the original thread. Reply-To: support@colaberry.com so any HireRight follow-up routes there.</div>',
      assignee_ids: [ALI_USER_ID],
      due_on: '2026-06-15',
    },
    { headers: BC_HEADERS },
  )).data;
  console.log('   BC todo:', todo.app_url, '(id', todo.id + ')');

  // 3. Send the reply with PDF, attached to BC todo via sendWithBcAttach
  console.log('3/3 sending reply to HireRight...');

  const REPLY_HTML = `<div style="font-family:arial,sans-serif;font-size:14px;color:#2d3748;line-height:1.6;max-width:760px">
<p>Lino,</p>
<p>Please find the completed Education Verification Request for <strong>Ignesias Kagoiya</strong> (Request ID: <strong>AT-060426-2C5H3</strong>) attached as a PDF.</p>
<p>All provided fields (Start Date, End Date, Type of Degree, Date Awarded, Major) match our records and are marked Correct on the form. The SSN field could not be verified — Colaberry School of Data Analytics does not retain Social Security Numbers for our students; this is noted in the Additional Comments section. Please rely on other sources for SSN confirmation.</p>
<p>For any follow-up questions on this verification or future requests, please contact <a href="mailto:support@colaberry.com">support@colaberry.com</a> or call 972-992-1024.</p>
<p>Thank you,</p>
<p><strong>Ali Muwwakkil</strong><br/>
Manager<br/>
Colaberry School of Data Analytics<br/>
<a href="mailto:support@colaberry.com">support@colaberry.com</a> &middot; 972-992-1024</p>
</div>`;

  const REPLY_TEXT = `Lino,

Please find the completed Education Verification Request for Ignesias Kagoiya (Request ID: AT-060426-2C5H3) attached as a PDF.

All provided fields (Start Date, End Date, Type of Degree, Date Awarded, Major) match our records and are marked Correct on the form. The SSN field could not be verified - Colaberry School of Data Analytics does not retain Social Security Numbers for our students; this is noted in the Additional Comments section. Please rely on other sources for SSN confirmation.

For any follow-up questions on this verification or future requests, please contact support@colaberry.com or call 972-992-1024.

Thank you,

Ali Muwwakkil
Manager
Colaberry School of Data Analytics
support@colaberry.com  |  972-992-1024`;

  const result = await sendAndAttach({
    ticketId: todo.id,
    from: '"Ali Muwwakkil - Colaberry" <ali@colaberry.com>',
    to: 'documentation@hireright.com',
    cc: ['admissions@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'support@colaberry.com',
    subject: 'Re: Education Verification Request - Request ID: AT-060426-2C5H3',
    html: REPLY_HTML,
    text: REPLY_TEXT,
    attachments: [
      {
        filename: 'Ignesias_Kagoiya_Education_Verification.pdf',
        content: pdfBuf,
        contentType: 'application/pdf',
      },
    ],
    bcSummary: '<p>Sent the completed HireRight Education Verification PDF for Ignesias Kagoiya (Request AT-060426-2C5H3) to documentation@hireright.com. CC admissions@colaberry.com (the original thread). Reply-To support@colaberry.com so HireRight follow-up routes there. All 5 verifiable fields marked Correct; SSN left unchecked with note that Colaberry does not retain SSN. Verified against CCPP UserID 34640 / StudentID 8208.</p>',
  });

  console.log('\nDONE.');
  console.log('  Mandrill:', result.mandrillId);
  console.log('  BC comment attach:', result.commentUrl);
  console.log('  BC todo:', todo.app_url);
})().catch(e => { console.error('FAIL:', e.response?.data || e.stack || e.message); process.exit(1); });
