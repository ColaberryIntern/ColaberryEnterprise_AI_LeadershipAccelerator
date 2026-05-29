#!/usr/bin/env node
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TEXT_BODY = `Mandrill deliverability test - 2026-05-29 ${new Date().toISOString().slice(11, 19)} UTC.

This message landed in BOTH ali@colaberry.com AND ali_muwwakkil@hotmail.com to verify the new send-to-all-inboxes default works.

If you got this in both, the multi-inbox flow is healthy and the decisions-owed email + nightly retrospective will land in both going forward.

If you only got this in one, reply with which one is missing and I'll trace the SPF/DKIM/spam filter.

Ali`;

const HTML_BODY = `<div style="font-family:arial,sans-serif;font-size:14px;color:#2d3748;line-height:1.65">
<p><strong>Mandrill deliverability test</strong> - 2026-05-29 ${new Date().toISOString().slice(11, 19)} UTC.</p>
<p>This message landed in BOTH <code>ali@colaberry.com</code> AND <code>ali_muwwakkil@hotmail.com</code> to verify the new send-to-all-inboxes default works.</p>
<p>If you got this in both, the multi-inbox flow is healthy. If you only got this in one, reply with which one is missing and I'll trace the SPF/DKIM/spam filter.</p>
<p>Ali</p>
</div>`;

if (!process.env.MANDRILL_API_KEY) { console.error('MANDRILL_API_KEY required'); process.exit(1); }

const transport = nodemailer.createTransport({
  host: 'smtp.mandrillapp.com', port: 587,
  auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
});

(async () => {
  for (const to of ['ali@colaberry.com', 'ali_muwwakkil@hotmail.com']) {
    try {
      const r = await transport.sendMail({
        from: '"Ali Muwwakkil" <ali@colaberry.com>',
        to,
        subject: '✅ Deliverability test - both inboxes',
        text: TEXT_BODY,
        html: HTML_BODY,
        headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
      });
      console.log(`Sent to ${to}: ${r.messageId}`);
    } catch (e) {
      console.error(`FAIL ${to}: ${e.message}`);
    }
  }
})();
