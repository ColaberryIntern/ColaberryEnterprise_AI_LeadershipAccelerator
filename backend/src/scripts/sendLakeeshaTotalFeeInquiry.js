#!/usr/bin/env node
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TEXT_BODY = `Hey Keesha,

Quick one before I come back to you on the SEP question and the fee approval.

What is the total fee I'm looking at right now for the 2025 return, end to end? Your CPA fee plus any extras (e-file, state, anything else). Just want a single number so Addie and I can plan against it before I send back on the other open items.

Thanks,
Ali`;

const HTML_SIG = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 20px;"><tr><td>
<div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
<div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
<div style="color: #718096;">Colaberry Inc.</div>
<div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
<div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0;">enterprise.colaberry.ai</a></div>
</td></tr></table>`;

const HTML_BODY = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.65;">
<p>Hey Keesha,</p>
<p>Quick one before I come back to you on the SEP question and the fee approval.</p>
<p><strong>What is the total fee I'm looking at right now for the 2025 return, end to end?</strong> Your CPA fee plus any extras (e-file, state, anything else). Just want a single number so Addie and I can plan against it before I send back on the other open items.</p>
<p>Thanks,<br>Ali</p>
</div>
${HTML_SIG}`;

if (!process.env.MANDRILL_API_KEY) { console.error('MANDRILL_API_KEY required'); process.exit(1); }

nodemailer.createTransport({
  host: 'smtp.mandrillapp.com', port: 587,
  auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
}).sendMail({
  from: '"Ali Muwwakkil" <ali@colaberry.com>',
  to: 'info@lvbrownecpa.com',
  cc: 'addie.m.mack@gmail.com',
  bcc: 'ali@colaberry.com',
  subject: "Quick - what's the total fee for the 2025 return?",
  text: TEXT_BODY,
  html: HTML_BODY,
  headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
}).then(r => {
  console.log('Sent Lakeesha fee inquiry:', r.messageId);
}).catch(e => { console.error('Failed:', e.message); process.exit(1); });
