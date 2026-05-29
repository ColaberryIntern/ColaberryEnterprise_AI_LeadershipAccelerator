#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const pdfPath = path.resolve(__dirname, '../../../docs/alcohol-brain-visual-summary.pdf');

const TEXT_BODY = `Resend - the previous PDF only went to ali@colaberry.com. This one fans out to all 3 of your inboxes.

PDF attached: 8-section visual writeup, icons + imagery + diagrams. Same content as v1 but visually denser.

Ali`;

const HTML_BODY = `<div style="font-family:arial,sans-serif;font-size:14px;color:#2d3748;line-height:1.65">
<p>Resend - the previous PDF only went to ali@colaberry.com. This one fans out to all 3 of your inboxes.</p>
<p><strong>PDF attached</strong>: 8-section visual writeup, icons + imagery + diagrams. Same content as v1 but visually denser.</p>
<p>Ali</p>
</div>`;

const RECIPIENTS = [
  'ali@colaberry.com',
  'alimuwwakkil@gmail.com',
  'ali_muwwakkil@hotmail.com',
];

if (!process.env.MANDRILL_API_KEY) { console.error('MANDRILL_API_KEY required'); process.exit(1); }

const transport = nodemailer.createTransport({
  host: 'smtp.mandrillapp.com', port: 587,
  auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
});

(async () => {
  for (const to of RECIPIENTS) {
    try {
      const r = await transport.sendMail({
        from: '"Ali Muwwakkil" <ali@colaberry.com>',
        to,
        subject: 'Resend (PDF): Alcohol and the brain - visual writeup',
        text: TEXT_BODY,
        html: HTML_BODY,
        attachments: [
          { filename: 'alcohol-brain-visual-summary.pdf', path: pdfPath, contentType: 'application/pdf' },
        ],
        headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
      });
      console.log(`Sent to ${to}: ${r.messageId}`);
    } catch (e) {
      console.error(`FAIL ${to}: ${e.message}`);
    }
  }
})();
