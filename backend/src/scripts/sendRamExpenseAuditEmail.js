#!/usr/bin/env node
// Reply to Ram on the original Expense Reimbursement thread with the
// audit summary + attached XLSX + inline HTML visual report.
// Also close the BC expense audit ticket.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));
const ops = require('./lib/launchPmoOps');

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

(async () => {
  const xlsxPath = path.resolve(__dirname, '../../../tmp/expense-audit-final-2026-06-01.xlsx');
  const htmlPath = path.resolve(__dirname, '../../../tmp/expense-audit-final-2026-06-01.html');
  const xlsxBuf = fs.readFileSync(xlsxPath);
  const visualHtml = fs.readFileSync(htmlPath, 'utf8');

  // Pull the visual report body (everything inside <body>...</body>) for inline preview
  const bodyMatch = visualHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const inlineVisual = bodyMatch ? bodyMatch[1] : visualHtml;

  // Email shell wraps the inline visual + adds the cover note for Ram
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f7fafc;font-family:arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:900px;margin:0 auto;background:white">

<!-- Cover note -->
<div style="padding:24px 32px;border-bottom:1px solid #e2e8f0">
<p style="font-size:14px;color:#1f2937;margin:0">Ram,</p>
<p style="font-size:14px;color:#1f2937">As promised, here is the cleanup from the expense list you forwarded this morning. I went through every line item on Durga's list, identified what was a real recurring subscription vs a one-time charge, and cancelled what was cancellable. I attached the full backup spreadsheet (5 tabs: Executive Summary, Cancellations, Pending Decisions, Subscriptions Kept, All 37 Expenses), but the visual summary below should tell the story quickly.</p>
<p style="font-size:14px;color:#1f2937">Headline:</p>
<ul style="font-size:14px;color:#1f2937">
<li><strong>$1,231.21 per month</strong> in recurring subscriptions confirmed cancelled today (~$14,775 annualized).</li>
<li><strong>$464</strong> additional monthly savings still in flight: Relevance AI is gated by Kes finishing the Cora migration (due 2026-06-17), Boost Mobile is in AMEX dispute, and Alpha Vantage is conditional on Sunday demoing his AegisFX project by 2026-06-15.</li>
<li>The largest line item on the audit ($3,179 Bending Spoons) was a one-time laptop purchase, not a subscription, so there was nothing to cancel there.</li>
<li>Everything we kept is operational (Anthropic + OpenAI for the agent infrastructure, Hetzner for the production VPS, GitHub, Microsoft, Google Workspace, Apollo for outbound, etc).</li>
</ul>
<p style="font-size:14px;color:#1f2937">Visual summary below, full backup attached. Let me know if anything looks off and I will pull the receipts.</p>
<p style="font-size:14px;color:#1f2937;margin:0">Ali</p>
</div>

<!-- Visual report inline -->
${inlineVisual}

</div></body></html>`;

  const text = strip(`Ram,

As promised, here is the cleanup from the expense list you forwarded this morning. Full backup spreadsheet attached.

Headline:
- $1,231.21/month in recurring subscriptions cancelled today (~$14,775/year).
- $464/month still in flight: Relevance AI gated by Cora migration (Kes, due 2026-06-17), Boost Mobile in AMEX dispute, Alpha Vantage conditional on Sunday demoing AegisFX by 2026-06-15.
- The largest line item ($3,179 Bending Spoons) was a one-time laptop, not a subscription.
- Everything kept is operational (Anthropic, OpenAI, Hetzner, GitHub, Microsoft, Google, Apollo, etc).

Visual summary in the HTML body. Spreadsheet attached has 5 tabs: Executive Summary, Cancellations, Pending Decisions, Subscriptions Kept, All 37 Expenses.

Let me know if anything looks off and I will pull receipts.

Ali

--
Ali Muwwakkil
Managing Director | Colaberry Inc.
ali@colaberry.com`);

  const htmlClean = strip(html);
  const textClean = strip(text);
  validateBeforeSend(htmlClean, textClean);

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });

  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ram@colaberry.com',
    cc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    inReplyTo: '<19e82ebe3c63678e@mail.gmail.com>',
    references: '<19e82ebe3c63678e@mail.gmail.com>',
    subject: 'Re: Expense Reimbursement List for payroll period ending 05/08/2026 - cleanup done',
    text: textClean,
    html: htmlClean,
    attachments: [
      {
        filename: 'expense-audit-final-2026-06-01.xlsx',
        content: xlsxBuf,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Email sent:', r.messageId);

  // Re-upload XLSX to BC + post a wrap-up comment that closes the loop
  console.log('Posting wrap-up comment to BC ticket...');
  const attR = await fetch(`https://3.basecampapi.com/3945211/attachments.json?name=expense-audit-final-2026-06-01.xlsx`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ops.getToken()}`, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'User-Agent': 'Colaberry ExpenseAudit' },
    body: xlsxBuf,
  });
  const attach = await attR.json();
  const wrapHtml = `<div><strong>WRAP-UP - audit closed 2026-06-01.</strong></div>
<div>Final spreadsheet attached below (5 tabs, accountant-grade: Executive Summary / Cancellations / Pending Decisions / Subscriptions Kept / All 37 Expenses).</div>
<div style="margin-top:10px;padding:12px 14px;background:#dcfce7;border-radius:6px;font-size:14px;color:#166534">
<strong>Final monthly recurring savings booked: $1,231.21</strong>
<div style="font-size:11px;color:#475569;margin-top:4px">Annualized: ~$14,775/year. ${7} subscriptions cancelled.</div>
</div>
<div style="margin-top:10px;padding:10px 14px;background:#fef3c7;border-radius:6px;font-size:13px;color:#78350f">
<strong>Still in flight ($464/mo potential additional):</strong> Relevance AI ($349, gated by Cora migration Kes 2026-06-17), Alpha Vantage ($100, gated by Sunday demo 2026-06-15), Boost Mobile ($15, AMEX dispute pending).
</div>
<div style="margin-top:10px;font-size:13px;color:#1f2937">Email reply with summary + spreadsheet sent to Ram. This ticket is now complete - moving on. Ali will follow up on Sunday + Relevance/Cora via their own tickets.</div>
<bc-attachment sgid="${attach.attachable_sgid}" caption="expense-audit-final-2026-06-01.xlsx"></bc-attachment>`;
  const c = await ops.bcPost(`/buckets/7463955/recordings/9948510922/comments.json`, { content: wrapHtml });
  console.log('Wrap-up comment:', c.id);

  // Mark the BC ticket complete
  await fetch(`https://3.basecampapi.com/3945211/buckets/7463955/todos/9948510922/completion.json`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ops.getToken()}`, 'User-Agent': 'Colaberry ExpenseAudit' },
  });
  console.log('Todo marked complete.');
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
