#!/usr/bin/env node
/**
 * One-off: answer Mihret Netsereab's internship cost question.
 *
 * Her application (b4a3e209, under_review) carries one blocking factor: she
 * answered that she does not accept the membership and tool costs. Her
 * enrollment is payment_status=paid with an ACTIVE COMP subscription, so the
 * membership side does not apply to her. The tool side does, and it is the one
 * requirement the platform never waives: her own Claude Code account and her own
 * API key with billing.
 *
 * Path B (standalone) send: no originating Basecamp ticket.
 */
const nodemailer = require('nodemailer');
const { validateBeforeSend } = require('./lib/mandrillPreflight');

const TO = 'mihretnetsereab@gmail.com';
const SUBJECT = 'Your internship application: the membership is covered, the tools are on you';

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 24px;">
<tr><td>
<div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
<div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
<div style="color: #718096;">Colaberry Inc.</div>
<div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
<div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
<div style="margin-top: 14px;">
<a href="https://advisor.colaberry.ai/advisory" style="display: inline-block; background: #2b6cb0; color: #ffffff; padding: 9px 18px; border-radius: 20px; text-decoration: none; font-weight: 600;">Design Your AI Organization</a>
</div>
</td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com  |  enterprise.colaberry.ai
Design Your AI Organization: https://advisor.colaberry.ai/advisory`;

const P = 'margin: 0 0 14px 0;';
const BODY_HTML = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6;">
<p style="${P}">Mihret,</p>

<p style="${P}">I looked at your internship application. You flagged the cost question, so let me separate the two things it covers, because only one of them applies to you.</p>

<p style="${P}"><strong>The Colaberry membership: you do not have to pay anything.</strong> Your account is already covered, so the internship costs you nothing on our side. That part of the question is settled, and you can stop worrying about it.</p>

<p style="${P}"><strong>Your own tools: these you do need, and we cannot provide them.</strong> Two things:</p>

<ul style="margin: 0 0 14px 0; padding-left: 22px;">
<li style="margin-bottom: 8px;"><strong>A Claude Code account</strong> through Anthropic, which is about $20 a month. This is what you will build with, every day.</li>
<li style="margin-bottom: 8px;"><strong>Your own API key with billing enabled</strong>, which for the work you will be doing usually runs under $10 a month.</li>
</ul>

<p style="${P}">Everyone in the programme carries their own. The account and the key stay yours: never paste your key into our platform, and no one at Colaberry will ever ask you for it.</p>

<p style="${P}">If that works for you, reply and say so and I will move your application forward. If the tool cost is a genuine obstacle right now, tell me that instead and we will talk about timing.</p>
</div>`;

const BODY_TEXT = `Mihret,

I looked at your internship application. You flagged the cost question, so let me separate the two things it covers, because only one of them applies to you.

THE COLABERRY MEMBERSHIP: you do not have to pay anything. Your account is already covered, so the internship costs you nothing on our side. That part of the question is settled, and you can stop worrying about it.

YOUR OWN TOOLS: these you do need, and we cannot provide them. Two things:

  - A Claude Code account through Anthropic, about $20 a month. This is what you will build with, every day.
  - Your own API key with billing enabled, which for the work you will be doing usually runs under $10 a month.

Everyone in the programme carries their own. The account and the key stay yours: never paste your key into our platform, and no one at Colaberry will ever ask you for it.

If that works for you, reply and say so and I will move your application forward. If the tool cost is a genuine obstacle right now, tell me that instead and we will talk about timing.`;

(async () => {
  const html = BODY_HTML.replace(/\u2014/g, '-').replace(/\u2013/g, '-');
  const text = BODY_TEXT.replace(/\u2014/g, '-').replace(/\u2013/g, '-');
  validateBeforeSend(html, text);
  console.log('[send] preflight passed');

  if (process.argv.includes('--dry-run')) {
    console.log('[send] DRY RUN, nothing sent.');
    console.log(`  to: ${TO}\n  subject: ${SUBJECT}\n  html: ${html.length} chars, text: ${text.length} chars`);
    process.exit(0);
  }

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });

  const info = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: TO,
    bcc: 'ali@colaberry.com',
    replyTo: 'ali@colaberry.com',
    subject: SUBJECT,
    html: html + SIG_HTML,
    text: text + '\n\n' + SIG_TEXT,
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
  console.log(`[send] sent to ${TO} | messageId ${info.messageId} | response ${info.response}`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
