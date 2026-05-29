#!/usr/bin/env node
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TEXT_BODY = `Hey Angie,

Today is Mika and Shveta's last day. Both are being laid off, effective end of business today (2026-05-29).

I want to make sure we run the offboarding correctly. Could you walk me through:

1. The offboarding process on your side. Anything you need me to do or sign?
2. When they get their last paycheck and how that aligns with our normal payroll cycle.
3. How PTO payout works for laid off employees. Both have accrued time and I want to make sure we handle it right.
4. Whether there is a separation agreement or release they should sign, and the standard window for that.
5. Anything else I should be doing today on access, equipment, internal comms, COBRA notices, etc.

Let me know what you need from me to move this forward today.

Ali`;

const HTML_SIG = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 20px;"><tr><td>
<div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
<div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
<div style="color: #718096;">Colaberry Inc.</div>
<div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
<div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0;">enterprise.colaberry.ai</a></div>
<div style="margin-top: 14px;"><a href="https://advisor.colaberry.ai/advisory" style="display: inline-block; background: #2b6cb0; color: #ffffff; padding: 9px 18px; border-radius: 20px; text-decoration: none; font-weight: 600;">Design Your AI Organization</a></div>
</td></tr></table>`;

const HTML_BODY = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.65;">
<p>Hey Angie,</p>
<p>Today is Mika and Shveta's last day. Both are being laid off, effective end of business today (2026-05-29).</p>
<p>I want to make sure we run the offboarding correctly. Could you walk me through:</p>
<ol>
<li>The offboarding process on your side. Anything you need me to do or sign?</li>
<li>When they get their last paycheck and how that aligns with our normal payroll cycle.</li>
<li>How PTO payout works for laid off employees. Both have accrued time and I want to make sure we handle it right.</li>
<li>Whether there is a separation agreement or release they should sign, and the standard window for that.</li>
<li>Anything else I should be doing today on access, equipment, internal comms, COBRA notices, etc.</li>
</ol>
<p>Let me know what you need from me to move this forward today.</p>
<p>Ali</p>
</div>
${HTML_SIG}`;

if (!process.env.MANDRILL_API_KEY) { console.error('MANDRILL_API_KEY required'); process.exit(1); }

nodemailer.createTransport({
  host: 'smtp.mandrillapp.com', port: 587,
  auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
}).sendMail({
  from: '"Ali Muwwakkil" <ali@colaberry.com>',
  to: 'angie@colaberry.com',
  bcc: 'ali@colaberry.com',
  subject: 'Effective today: Mika and Shveta last day - process questions',
  text: TEXT_BODY,
  html: HTML_BODY,
  headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
}).then(r => {
  console.log('Sent:', r.messageId);
}).catch(e => { console.error('Failed:', e.message); process.exit(1); });
