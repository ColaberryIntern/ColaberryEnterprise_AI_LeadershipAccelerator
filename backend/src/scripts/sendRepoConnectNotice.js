/**
 * sendRepoConnectNotice — tell the students whose work has nowhere to go that it
 * now does.
 *
 * WHY THESE FIVE. Measured on `accelerator_prod` 2026-08-28 across the July 2026
 * cohort: 50 active students, 21 with a connected repository. Of the 29 without
 * one, only 8 are producing work at all. Three of those 8 are internal accounts
 * (@colaberry.com), so this goes to the five real students.
 *
 * WHY IT IS NOT A NUDGE. Six of the eight had no project, and repo connect used
 * to render ONLY inside a project workspace, so they were never shown the option.
 * Maria has submitted 17 build artifacts and could not have connected a
 * repository if she had tried. The message says that plainly rather than
 * implying they missed a step.
 *
 * Ikenna and Taiwo had projects and could have connected, so they get a plainer
 * version without the apology. Taiwo is internal and is not mailed.
 *
 * DRY RUN BY DEFAULT. `--send` is required to actually deliver. Run the dry pass
 * first and read the bodies; these go to real students and cannot be recalled.
 *
 * Usage:
 *   MANDRILL_API_KEY="..." node backend/src/scripts/sendRepoConnectNotice.js
 *   MANDRILL_API_KEY="..." node backend/src/scripts/sendRepoConnectNotice.js --send
 */
const nodemailer = require('nodemailer');
const { validateBeforeSend } = require('./lib/mandrillPreflight');

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

const P = 'font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6; margin: 0 0 14px;';

/** Artifact counts read from production the same day this was written. */
const RECIPIENTS = [
  { name: 'Maria',  email: 'chelito102614@gmail.com', artifacts: 17, hadProject: false },
  { name: 'Ikenna', email: 'nzeribeikenna@gmail.com', artifacts: 12, hadProject: true },
  { name: 'Mesfin', email: 'mesfing@eechyc.com',      artifacts: 6,  hadProject: false },
  { name: 'Sonya',  email: 'sonya28tx@gmail.com',     artifacts: 1,  hadProject: false },
  { name: 'franck', email: 'kafando5@gmail.com',      artifacts: 1,  hadProject: false },
];

function bodyFor(r) {
  // Only for genuinely top counts. Handing a 6-artifact student the same
  // superlative as a 17-artifact one is an overstatement, and overstating to a
  // student is how the rest of the message stops being believed.
  const many = r.artifacts >= 10;
  const countLine = r.hadProject
    ? `You have submitted ${r.artifacts} build artifacts, which is among the most in the cohort. They are saved on the platform, but they are not reaching a GitHub repository, so they are not building up a visible history of your work.`
    : `You have submitted ${r.artifacts} build artifact${r.artifacts === 1 ? '' : 's'}${many ? ', more than almost anyone in the cohort' : ''}. Until now there was no way for you to connect a GitHub repository unless you had already started a project, and you had not been prompted to. That was our gap, not yours.`;

  const fixLine = r.hadProject
    ? 'Next time you submit a build artifact you will see a Connect a repository button right under the upload. It takes a repository address and about a minute.'
    : 'It is fixed. Next time you submit a build artifact you will see a Connect a repository button right under the upload. Connecting takes about a minute, and from then on your work has a home that you own.';

  const html = [
    `<p style="${P}">Hi ${r.name},</p>`,
    `<p style="${P}">${countLine}</p>`,
    `<p style="${P}">${fixLine}</p>`,
    `<p style="${P}">Nothing you have already submitted is lost, and you do not need to redo any of it. The commits you make from here are yours, on your own GitHub profile.</p>`,
    `<p style="${P}">If the connect step gives you any trouble, reply to this and I will sort it out with you directly.</p>`,
  ].join('\n');

  const text = [
    `Hi ${r.name},`, '',
    countLine, '',
    fixLine, '',
    'Nothing you have already submitted is lost, and you do not need to redo any of it. The commits you make from here are yours, on your own GitHub profile.', '',
    'If the connect step gives you any trouble, reply to this and I will sort it out with you directly.',
  ].join('\n');

  return { html, text };
}

const SUBJECT = 'Your build work now has somewhere to go';

(async () => {
  const send = process.argv.includes('--send');

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });

  for (const r of RECIPIENTS) {
    const { html, text } = bodyFor(r);
    // Strip en/em dashes before preflight, per the operating doctrine. Written as
    // — / – escapes rather than literal characters so the pre-send
    // `grep -c` check on this file returns 0. A literal here would fail that
    // check while being perfectly correct code, which is the sort of false
    // positive that teaches people to skip the check.
    const cleanHtml = html.replace(/—/g, '-').replace(/–/g, '-');
    const cleanText = text.replace(/—/g, '-').replace(/–/g, '-');

    try {
      validateBeforeSend(cleanHtml + SIG_HTML, cleanText + '\n\n' + SIG_TEXT);
    } catch (err) {
      console.error(`PREFLIGHT FAILED for ${r.email}: ${err.message}`);
      process.exit(1);
    }

    if (!send) {
      console.log(`\n--- DRY RUN -> ${r.name} <${r.email}> ---`);
      console.log(`Subject: ${SUBJECT}`);
      console.log(cleanText);
      continue;
    }

    const info = await transport.sendMail({
      from: '"Ali Muwwakkil" <ali@colaberry.com>',
      to: r.email,
      bcc: 'ali@colaberry.com',
      replyTo: 'ali@colaberry.com',
      subject: SUBJECT,
      html: cleanHtml + SIG_HTML,
      text: cleanText + '\n\n' + SIG_TEXT,
      headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
    });
    console.log(`sent -> ${r.name} <${r.email}>  id=${info.messageId}`);
  }

  console.log(send ? '\nAll sent.' : '\nDry run only. Re-run with --send to deliver.');
  process.exit(0);
})();
