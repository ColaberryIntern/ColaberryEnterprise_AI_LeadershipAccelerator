/**
 * sendPortfolioResumeCampaign - one email to each paid student whose portfolio is
 * complete except for a professional baseline.
 *
 * WHY THIS EXISTS: production holds 6,503 skill-evidence rows and 332 build artifacts
 * against only 26 resumes. These 13 learners already clear the capability AND artifact
 * bars; a missing resume is the single thing between them and a publishable portfolio.
 * Quincy alone has 54 artifacts he currently cannot show anyone.
 *
 * The counts below are REAL per-student values queried from prod, not estimates. The
 * specificity is the reason this will work, so the script refuses to send a generic
 * number: every recipient carries their own.
 *
 * EXCLUDED DELIBERATELY: ram@ / swati@ / farhat@colaberry.com (internal staff, told
 * directly rather than campaigned at) and a duplicate enrollment row for Ikenna.
 *
 * Standalone send (Path B) - a cohort campaign has no originating BC ticket. Preflight
 * still runs: em-dash blocker, duplicate-name and double-signature guards.
 */
const path = require('path');
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

/** Real values from prod. first_name is never shortened from the name on file. */
const RECIPIENTS = [
  { email: 'qninying@gmail.com',           first: 'Quincy',      arts: 54, caps: 9 },
  { email: 'abdinur2468@gmail.com',        first: 'Abrahim',     arts: 21, caps: 8 },
  { email: 'chukseneh@outlook.com',        first: 'Chukwuemeka', arts: 17, caps: 9 },
  { email: 'chelito102614@gmail.com',      first: 'Maria',       arts: 15, caps: 7 },
  { email: 'shabana.zeeshan001@gmail.com', first: 'Shabana',     arts: 14, caps: 8 },
  { email: 'paulsane@yahoo.com',           first: 'Emmanuel',    arts: 13, caps: 7 },
  { email: 'jude.mofunanya@gmail.com',     first: 'Jude',        arts: 12, caps: 8 },
  { email: 'pam.manyika@gmail.com',        first: 'Pamela',      arts: 11, caps: 7 },
  { email: 'bfglz@yahoo.com',              first: 'Liza',        arts: 10, caps: 7 },
  { email: 'nzeribeikenna@gmail.com',      first: 'Ikenna',      arts: 9,  caps: 6 },
  { email: 'tanmayi.katamaraja@gmail.com', first: 'Tanmayi',     arts: 8,  caps: 4 },
  { email: 'mohsinali43@gmail.com',        first: 'Mohsin',      arts: 6,  caps: 4 },
  { email: 'mesfing@eechyc.com',           first: 'Mesfin',      arts: 6,  caps: 4 },
];

const PORTFOLIO_URL = 'https://enterprise.colaberry.ai/portal/portfolio';
const SETTINGS_URL = 'https://enterprise.colaberry.ai/portal/settings?tab=profile';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function bodyHtml(r) {
  return `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6;">
<p>Hi ${r.first},</p>

<p>Your work at Colaberry has been quietly building a portfolio for you. Right now it holds
<strong>${plural(r.arts, 'build artifact')}</strong> and <strong>${plural(r.caps, 'verified capability').replace('capabilitys', 'capabilities')}</strong>,
each one backed by evidence of work you actually did.</p>

<p>You can see it here: <a href="${PORTFOLIO_URL}" style="color: #2b6cb0;">${PORTFOLIO_URL}</a></p>

<p>There is one thing missing, and it takes about two minutes.</p>

<p>We need your professional baseline, so your existing experience sits alongside what you have
built with us rather than your Colaberry work looking like it started from nothing.</p>

<p><strong>You do not need to write a resume.</strong> If you have a LinkedIn profile, that is enough:</p>

<ol>
  <li>Open your LinkedIn profile</li>
  <li>Click <strong>More</strong>, then <strong>Save to PDF</strong></li>
  <li>Upload that file at <a href="${SETTINGS_URL}" style="color: #2b6cb0;">your profile settings</a></li>
</ol>

<p>An existing resume works exactly the same way.</p>

<p>Once it is uploaded, your portfolio is complete and ready to be reviewed for publication.</p>

<p>Nothing about your portfolio is public today, and nothing becomes public without your say so
and a review.</p>
</div>`;
}

function bodyText(r) {
  return `Hi ${r.first},

Your work at Colaberry has been quietly building a portfolio for you. Right now it holds ${plural(r.arts, 'build artifact')} and ${plural(r.caps, 'verified capability').replace('capabilitys', 'capabilities')}, each one backed by evidence of work you actually did.

You can see it here: ${PORTFOLIO_URL}

There is one thing missing, and it takes about two minutes.

We need your professional baseline, so your existing experience sits alongside what you have built with us rather than your Colaberry work looking like it started from nothing.

You do not need to write a resume. If you have a LinkedIn profile, that is enough:

1. Open your LinkedIn profile
2. Click More, then Save to PDF
3. Upload that file at ${SETTINGS_URL}

An existing resume works exactly the same way.

Once it is uploaded, your portfolio is complete and ready to be reviewed for publication.

Nothing about your portfolio is public today, and nothing becomes public without your say so and a review.`;
}

const SUBJECT = 'Your portfolio is already built. It needs one file.';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!process.env.MANDRILL_API_KEY) {
    console.error('MANDRILL_API_KEY missing. Pull it from prod and pass inline.');
    process.exit(1);
  }

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });

  // Preflight EVERY variant before sending ANY of them. A campaign that fails halfway
  // leaves some students emailed and some not, with no clean way to resume.
  for (const r of RECIPIENTS) {
    const html = bodyHtml(r).replace(/—/g, '-').replace(/–/g, '-') + SIG_HTML;
    const text = bodyText(r).replace(/—/g, '-').replace(/–/g, '-') + '\n\n' + SIG_TEXT;
    validateBeforeSend(html, text);
  }
  console.log(`preflight passed for all ${RECIPIENTS.length} variants`);

  if (dryRun) {
    console.log('\n--- DRY RUN, nothing sent ---');
    console.log(`subject: ${SUBJECT}`);
    console.log(bodyText(RECIPIENTS[0]).slice(0, 700));
    console.log('\nrecipients:', RECIPIENTS.map((r) => `${r.first} <${r.email}> ${r.arts}a/${r.caps}c`).join('\n           '));
    return;
  }

  const results = [];
  for (const r of RECIPIENTS) {
    const html = bodyHtml(r).replace(/—/g, '-').replace(/–/g, '-') + SIG_HTML;
    const text = bodyText(r).replace(/—/g, '-').replace(/–/g, '-') + '\n\n' + SIG_TEXT;
    try {
      const info = await transport.sendMail({
        from: '"Ali Muwwakkil" <ali@colaberry.com>',
        to: r.email,
        bcc: 'ali@colaberry.com',
        replyTo: 'ali@colaberry.com',
        subject: SUBJECT,
        html,
        text,
        headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
      });
      results.push({ email: r.email, ok: true, id: info.messageId });
      console.log(`sent   ${r.email}  (${r.arts} artifacts)`);
    } catch (err) {
      results.push({ email: r.email, ok: false, error: err.message });
      console.error(`FAILED ${r.email}: ${err.message}`);
    }
  }

  const ok = results.filter((x) => x.ok).length;
  console.log(`\n${ok}/${results.length} sent`);
  if (ok !== results.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
