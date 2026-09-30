/**
 * sendFarhatRepoAnswer — answer Farhat Beig's 2026-08-29 question about whether her
 * governance work is loading correctly.
 *
 * She asked a direct question and deserves a direct answer, including the part that
 * reflects badly on us: her commit was correct, and BOTH reasons it was invisible are
 * platform faults. Her upload never reached her repo at all, so the sentence in her
 * email about it appearing under `artifacts/` needs correcting rather than agreeing
 * with, or she will keep uploading into a hole.
 *
 * Dry run by default. Pass --send to actually send.
 *
 *   node backend/src/scripts/sendFarhatRepoAnswer.js
 *   MANDRILL_API_KEY=... node backend/src/scripts/sendFarhatRepoAnswer.js --send
 */
const nodemailer = require('nodemailer');
const { validateBeforeSend } = require('./lib/mandrillPreflight');

const SEND = process.argv.includes('--send');
const TO = 'farhat@colaberry.com';
/** Basecamp todo 9982045828 (bucket 7463955), so the send lands on the record. */
const TICKET_ID = 9982045828;

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

const SUBJECT = 'Re: Added Governance in Github (your work was fine, our platform was not)';

const P = 'margin: 0 0 14px 0;';
const BODY_HTML = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6;">
<p style="${P}">Hi Farhat,</p>

<p style="${P}">Short answer: your work was correct, and the reason it was not showing had nothing to do with anything you did.</p>

<p style="${P}">I checked your repository directly. <strong>governance/POLICY.md is there</strong>, committed and pushed exactly as you described. The lab is complete.</p>

<p style="${P}">Two problems on our side were hiding it, and I want to be straight with you about both.</p>

<p style="${P}"><strong>1. We were reading a six day old copy of your repository.</strong> Our platform takes a snapshot of your files when you first connect and, as it turns out, almost never refreshes it. Ours was from August 24. Your repo has 97 files today and we were still looking at 64, so everything you built in the last week was invisible to us: your governance engine, your Claude skills and commands, your architecture package, your workflows. I refreshed yours by hand this evening. Your platform record now credits <strong>seven capabilities, including the Governance Engine</strong>.</p>

<p style="${P}"><strong>2. The upload button did not put the file in your repository.</strong> This is the part of your email I have to correct, and I am sorry to be the one telling you: there is no artifacts/ folder in your repo, and there never was. Every one of your eleven uploads, from week 1 through week 11, failed to reach GitHub. They were saved on our side and then silently dropped.</p>

<p style="${P}">The cause is that our system does not have write access to your repository. It can read it, which is why the refresh above worked, but it cannot commit to it. You are not alone in this. Across the cohort, 62 of 78 uploaded files never made it to a repo, so this is our bug and it has been costing people credit for work they actually did.</p>

<p style="${P}">If you want uploads to start working, there is one thing only you can do, because it is your repository. Add our account as a collaborator with write access:</p>

<p style="${P}"><code style="background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 10px; display: block; font-size: 13px;">gh api --method PUT repos/fbeig2020-cloud/ai-support-workflow-assistant/collaborators/ColaberryIntern -f permission=push</code></p>

<p style="${P}">Or in the GitHub web interface: Settings, then Collaborators, then add <strong>ColaberryIntern</strong> with Write permission. It creates an invitation that we accept on our end.</p>

<p style="${P}">That said, please do not treat it as urgent. You are already committing your work yourself, which is the more durable habit and is exactly what the labs ask for. The upload path is a convenience we owe you, not a requirement you are failing.</p>

<p style="${P}">Thank you for asking instead of assuming it was working. You surfaced something that was quietly affecting most of the cohort, and we are fixing the underlying problem rather than patching it student by student.</p>
</div>`;

const BODY_TEXT = `Hi Farhat,

Short answer: your work was correct, and the reason it was not showing had nothing to do with anything you did.

I checked your repository directly. governance/POLICY.md is there, committed and pushed exactly as you described. The lab is complete.

Two problems on our side were hiding it, and I want to be straight with you about both.

1. We were reading a six day old copy of your repository. Our platform takes a snapshot of your files when you first connect and, as it turns out, almost never refreshes it. Ours was from August 24. Your repo has 97 files today and we were still looking at 64, so everything you built in the last week was invisible to us: your governance engine, your Claude skills and commands, your architecture package, your workflows. I refreshed yours by hand this evening. Your platform record now credits seven capabilities, including the Governance Engine.

2. The upload button did not put the file in your repository. This is the part of your email I have to correct, and I am sorry to be the one telling you: there is no artifacts/ folder in your repo, and there never was. Every one of your eleven uploads, from week 1 through week 11, failed to reach GitHub. They were saved on our side and then silently dropped.

The cause is that our system does not have write access to your repository. It can read it, which is why the refresh above worked, but it cannot commit to it. You are not alone in this. Across the cohort, 62 of 78 uploaded files never made it to a repo, so this is our bug and it has been costing people credit for work they actually did.

If you want uploads to start working, there is one thing only you can do, because it is your repository. Add our account as a collaborator with write access:

  gh api --method PUT repos/fbeig2020-cloud/ai-support-workflow-assistant/collaborators/ColaberryIntern -f permission=push

Or in the GitHub web interface: Settings, then Collaborators, then add ColaberryIntern with Write permission. It creates an invitation that we accept on our end.

That said, please do not treat it as urgent. You are already committing your work yourself, which is the more durable habit and is exactly what the labs ask for. The upload path is a convenience we owe you, not a requirement you are failing.

Thank you for asking instead of assuming it was working. You surfaced something that was quietly affecting most of the cohort, and we are fixing the underlying problem rather than patching it student by student.`;

const html = BODY_HTML.replace(/—/g, '-').replace(/–/g, '-') + SIG_HTML;
const text = BODY_TEXT.replace(/—/g, '-').replace(/–/g, '-') + '\n\n' + SIG_TEXT;

async function main() {
  validateBeforeSend(html, text);
  console.log('Preflight passed.');
  console.log('To:      ' + TO);
  console.log('Bcc:     ali@colaberry.com');
  console.log('Subject: ' + SUBJECT);
  console.log('---------------- text body ----------------');
  console.log(text);
  console.log('-------------------------------------------');

  if (!SEND) {
    console.log('\nDRY RUN. Nothing sent. Re-run with --send to deliver.');
    return;
  }
  if (!process.env.MANDRILL_API_KEY) throw new Error('MANDRILL_API_KEY not set');

  // Prefer the Basecamp-attached path so the send is on the record. It preflights
  // Basecamp BEFORE Mandrill, so a stale or missing BC token throws with NOTHING
  // sent, which is what makes falling back safe rather than a double-send risk.
  if (TICKET_ID) {
    try {
      const { sendWithBcAttach } = require('./lib/sendWithBcAttach');
      const out = await sendWithBcAttach({
        ticketId: TICKET_ID,
        to: TO,
        bcc: ['ali@colaberry.com'],
        subject: SUBJECT,
        html,
        text,
        bcSummary: '<p>Answered Farhat Beig on her governance lab. Her commit was correct; '
          + 'two platform faults hid it: a six day stale repo snapshot (resynced by hand, she now '
          + 'reads 7 capabilities including Governance Engine) and <strong>no push access</strong>, '
          + 'which stranded all 11 of her uploads. Cohort-wide 62 of 78 uploads never reached a repo.</p>',
      });
      console.log('SENT via BC-attached path. mandrillId=' + out.mandrillId);
      console.log('BC comment: ' + out.commentUrl);
      return;
    } catch (err) {
      console.log('BC path unavailable (' + err.message + ').');
      console.log('Nothing sent yet: the BC preflight runs before Mandrill. Falling back to plain send.');
    }
  }

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    auth: {
      user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com',
      pass: process.env.MANDRILL_API_KEY,
    },
  });

  const info = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: TO,
    bcc: 'ali@colaberry.com',
    replyTo: 'ali@colaberry.com',
    subject: SUBJECT,
    html,
    text,
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
  console.log('SENT. messageId=' + info.messageId);
}

main().catch((err) => { console.error('FAILED: ' + err.message); process.exit(1); });
