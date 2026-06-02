#!/usr/bin/env node
// Reply to Kes on the "Resetting Colaberry email" thread — Ali has reset 2SV +
// password on his end, asks Kes to try signing in. Credentials are sent
// separately via SMS/WhatsApp (not in this email body).
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const HTML = `<!doctype html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:640px;margin:0 auto;padding:18px 4px">

<p style="font-size:14px;margin:0 0 10px">Hi Kes,</p>

<p style="font-size:14px;margin:0 0 12px">Done on my end. Try logging in to <strong>kes@colaberry.com</strong> now.</p>

<p style="font-size:14px;margin:0 0 6px">The flow you should see:</p>
<ol style="font-size:14px;margin:0 0 14px;padding-left:22px;line-height:1.7">
<li>Sign in with the temporary password (sent via SMS).</li>
<li>Google will force you to change the password - pick a new one.</li>
<li>At the 2-Step Verification prompt, paste one of the backup codes (also sent via SMS).</li>
<li>Once you are in, go to <a href="https://myaccount.google.com/security">myaccount.google.com/security</a> and enroll your phone as the real second factor. Throw the unused backup codes away after.</li>
</ol>

<p style="font-size:14px;margin:0 0 12px">If anything in that flow fails, text me at <strong>my mobile</strong> and we will jump on it - do not try multiple times, that can trigger another lockout.</p>

<p style="font-size:14px;margin:0 0 6px">Ali</p>

<p style="font-size:12px;color:#94a3b8;margin:12px 0 0">PS - going to add a "enroll 2SV before Day 1" item to the onboarding checklist so no one else hits this. You are the proof we needed it.</p>

</div></body></html>`;

const text = strip(`Hi Kes,

Done on my end. Try logging in to kes@colaberry.com now.

The flow you should see:
1. Sign in with the temporary password (sent via SMS).
2. Google will force you to change the password - pick a new one.
3. At the 2-Step Verification prompt, paste one of the backup codes (also sent via SMS).
4. Once you are in, go to https://myaccount.google.com/security and enroll your phone as the real second factor. Throw the unused backup codes away after.

If anything in that flow fails, text me at my mobile and we will jump on it - do not try multiple times, that can trigger another lockout.

Ali

PS - going to add a "enroll 2SV before Day 1" item to the onboarding checklist so no one else hits this. You are the proof we needed it.`);

(async () => {
  validateBeforeSend(HTML, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'kesetebirhan@gmail.com',
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Resetting Colaberry email',
    text, html: HTML,
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
