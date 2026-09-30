/**
 * Send the sales-rep welcome email with login credentials.
 *
 * Supersedes sendSalesRepWelcomeEmails20260604.js. Two things changed: the
 * temp-password paragraph now points at the self-serve rotation page (built
 * 2026-08-09, it did not exist in June), and the scope list matches what the
 * shell actually renders now that the nav is role-filtered.
 *
 * Reads provisioning results from stdin (the RESULT_JSON line emitted by
 * provisionSalesReps20260809.js) and emails only the reps that came back with
 * a temp password. Pre-send em-dash gate per house style. BCC ali@colaberry.com
 * so there is an audit copy of every credential handed out.
 *
 * Run:
 *   node backend/src/scripts/provisionSalesReps20260809.js --commit --reset \
 *     | grep RESULT_JSON \
 *     | sed 's/^RESULT_JSON://' \
 *     | node backend/src/scripts/sendSalesRepWelcomeEmails20260809.js
 *
 * Add --dry-run to render and gate every email without sending any of them.
 *
 * Output: one Mandrill messageId per send on stdout.
 */
const path = require('path');
const nodemailer = require('nodemailer');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const LOGIN_URL = 'https://enterprise.colaberry.ai/admin/login';
const CHANGE_PASSWORD_URL = 'https://enterprise.colaberry.ai/admin/change-password';
const SUBJECT = 'Your Colaberry lead queue login';

const HTML_SIGNATURE = [
  '<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 20px;">',
  '  <tr><td>',
  '    <div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>',
  '    <div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>',
  '    <div style="color: #718096;">Colaberry Inc.</div>',
  '    <div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200, Plano, TX 75075</div>',
  '    <div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>',
  '  </td></tr>',
  '</table>',
].join('\n');

const PLAIN_SIGNATURE = '\n\nAli Muwwakkil\nManaging Director / AI Systems Architect\nColaberry Inc.\n\n200 Chisholm Place, Suite 200, Plano, TX 75075\nali@colaberry.com  |  enterprise.colaberry.ai';

const CAN_DO = [
  'See every lead in the shared queue (list plus detail with engagement history)',
  'Update the pipeline stage (new, contacted, qualified, and so on)',
  'Update lead temperature (cold, warm, hot)',
  'Log activities (calls, notes, touchpoints)',
  'Book and reschedule appointments',
  'See per-lead engagement (opens, clicks, calls, campaign status)',
];

const CANNOT_DO = [
  'Export the lead list as CSV (PII protection)',
  'Create or modify follow-up sequences (campaign management)',
  'Enroll or cancel leads in sequences (campaign management)',
  'Manually create or delete lead records (data hygiene)',
  'Manage users or roles (account admin)',
];

function firstName(rep) {
  return rep.name.split(' ')[0];
}

function buildHtml(rep) {
  return [
    '<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.55;">',
    `<p>Hi ${firstName(rep)},</p>`,
    '<p>You are set up on the Colaberry lead queue. Leads from our forms (colaberry.ai, worldoftaxonomy.com, trustbeforeintelligence.ai) plus the Open House signups all land in one shared queue. Any rep can claim and work them.</p>',
    '<p><strong>Your login</strong></p>',
    '<table cellpadding="6" cellspacing="0" style="font-family: arial, sans-serif; font-size: 14px; background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin: 4px 0 12px;">',
    `  <tr><td style="color:#718096;">URL</td><td><a href="${LOGIN_URL}" style="color:#2b6cb0; text-decoration:none;">${LOGIN_URL}</a></td></tr>`,
    `  <tr><td style="color:#718096;">Username</td><td><code>${rep.email}</code></td></tr>`,
    `  <tr><td style="color:#718096;">Temp password</td><td><code style="background:#fff; padding:2px 6px; border-radius:3px;">${rep.tempPassword}</code></td></tr>`,
    '</table>',
    '<p><strong>Change this password once you are in.</strong> Use the "Change password" button at the bottom of the left sidebar, or go straight to ',
    `<a href="${CHANGE_PASSWORD_URL}" style="color:#2b6cb0;">${CHANGE_PASSWORD_URL}</a>. Until you do, treat this email as the key to the queue and keep it private.</p>`,
    '<p><strong>What you can do</strong></p>',
    '<ul style="margin:6px 0 14px;padding-left:22px;">',
    ...CAN_DO.map((item) => `<li>${item}</li>`),
    '</ul>',
    '<p><strong>What you cannot do (admin only by design)</strong></p>',
    '<ul style="margin:6px 0 14px;padding-left:22px;">',
    ...CANNOT_DO.map((item) => `<li>${item}</li>`),
    '</ul>',
    '<p>Your sidebar shows Leads and Pipeline only. That is deliberate, not a broken page. The rest of the admin console is not part of this role.</p>',
    '<p><strong>One ask this week</strong></p>',
    '<p>Log in, change the password, and click through a couple of leads so we know the access works end to end. If anything errors or looks wrong, send me a screenshot.</p>',
    '<p>Welcome aboard.</p>',
    '</div>',
    HTML_SIGNATURE,
  ].join('\n');
}

function buildText(rep) {
  return [
    `Hi ${firstName(rep)},`,
    '',
    'You are set up on the Colaberry lead queue. Leads from our forms (colaberry.ai, worldoftaxonomy.com, trustbeforeintelligence.ai) plus the Open House signups all land in one shared queue. Any rep can claim and work them.',
    '',
    'Your login',
    `  URL:           ${LOGIN_URL}`,
    `  Username:      ${rep.email}`,
    `  Temp password: ${rep.tempPassword}`,
    '',
    'Change this password once you are in. Use the "Change password" button at the',
    `bottom of the left sidebar, or go straight to ${CHANGE_PASSWORD_URL}.`,
    'Until you do, treat this email as the key to the queue and keep it private.',
    '',
    'What you can do',
    ...CAN_DO.map((item) => `  - ${item}`),
    '',
    'What you cannot do (admin only by design)',
    ...CANNOT_DO.map((item) => `  - ${item}`),
    '',
    'Your sidebar shows Leads and Pipeline only. That is deliberate, not a broken',
    'page. The rest of the admin console is not part of this role.',
    '',
    'One ask this week',
    'Log in, change the password, and click through a couple of leads so we know the',
    'access works end to end. If anything errors or looks wrong, send me a screenshot.',
    '',
    'Welcome aboard.',
    PLAIN_SIGNATURE,
  ].join('\n');
}

(async () => {
  const dryRun = process.argv.slice(2).includes('--dry-run');

  if (!dryRun && !process.env.MANDRILL_API_KEY) {
    console.error('FATAL MANDRILL_API_KEY not set');
    process.exit(1);
  }

  const stdin = await new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
  });

  let results;
  try {
    results = JSON.parse(stdin);
  } catch (e) {
    console.error('FATAL could not parse stdin as JSON:', e.message);
    process.exit(1);
  }

  const transport = dryRun
    ? null
    : nodemailer.createTransport({
        host: 'smtp.mandrillapp.com',
        port: 587,
        auth: {
          user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com',
          pass: process.env.MANDRILL_API_KEY,
        },
      });

  const sent = [];
  for (const rep of results) {
    // Only reps holding a freshly-issued credential get mail. Everything else
    // (already_exists without --reset, skipped_wrong_role, would_provision)
    // has no password to deliver, so emailing them would be noise.
    if (!rep.tempPassword) {
      console.log(`[skip] ${rep.email} (status=${rep.status}, no credential issued)`);
      continue;
    }

    const html = buildHtml(rep);
    const text = buildText(rep);
    for (const [name, body] of [['HTML', html], ['TEXT', text], ['SUBJECT', SUBJECT]]) {
      if (body.indexOf('—') !== -1) {
        console.error(`FATAL em-dash in ${name} for ${rep.email}`);
        process.exit(1);
      }
    }

    if (dryRun) {
      console.log(`[dry-run] would send to ${rep.email} (${text.length} chars, gate passed)`);
      continue;
    }

    const sendRes = await transport.sendMail({
      from: '"Ali Muwwakkil" <ali@colaberry.com>',
      to: rep.email,
      bcc: 'ali@colaberry.com',
      replyTo: 'ali@colaberry.com',
      subject: SUBJECT,
      text,
      html,
      headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
    });
    sent.push({ email: rep.email, mandrillId: sendRes.messageId });
    console.log(`[sent] ${rep.email} -> ${sendRes.messageId}`);
  }

  console.log('\nRESULT_JSON:' + JSON.stringify({ sent, dryRun }));
})().catch((e) => {
  console.error('FAIL:', e.message);
  console.error(e);
  process.exit(1);
});
