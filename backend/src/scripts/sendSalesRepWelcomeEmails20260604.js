/**
 * Send the sales-rep welcome email to John, David, and Nate.
 *
 * Reads provisioning results from stdin (the RESULT_JSON line emitted by
 * provisionSalesReps20260604.js). Skips emails for reps already-existing (no
 * temp password available). Pre-send em-dash gate. BCC ali@colaberry.com for
 * audit. Branded signature appended.
 *
 * Run:
 *   node backend/src/scripts/provisionSalesReps20260604.js \
 *     | grep RESULT_JSON \
 *     | sed 's/^RESULT_JSON://' \
 *     | node backend/src/scripts/sendSalesRepWelcomeEmails20260604.js
 *
 * Output: one Mandrill messageId per send on stdout.
 */
const path = require('path');
const nodemailer = require('nodemailer');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const LOGIN_URL = 'https://enterprise.colaberry.ai/admin/login';
const SUBJECT = 'Welcome to the Colaberry lead queue, your login credentials';

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

function buildHtml(rep) {
  return [
    '<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.55;">',
    `<p>Hi ${rep.name.split(' ')[0]},</p>`,
    '<p>Ram asked me to get you set up on the colaberry lead queue. New leads from our forms (colaberry.ai/request-demo, worldoftaxonomy.com, trustbeforeintelligence.ai) flow into a shared queue. Any rep can claim and work them.</p>',
    '<p><strong>Your login</strong></p>',
    `<table cellpadding="6" cellspacing="0" style="font-family: arial, sans-serif; font-size: 14px; background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin: 4px 0 12px;">`,
    '  <tr><td style="color:#718096;">URL</td><td><a href="' + LOGIN_URL + '" style="color:#2b6cb0; text-decoration:none;">' + LOGIN_URL + '</a></td></tr>',
    `  <tr><td style="color:#718096;">Username</td><td><code>${rep.email}</code></td></tr>`,
    `  <tr><td style="color:#718096;">Temp password</td><td><code style="background:#fff; padding:2px 6px; border-radius:3px;">${rep.tempPassword}</code></td></tr>`,
    '</table>',
    '<p><strong>What you can do</strong></p>',
    '<ul style="margin:6px 0 14px;padding-left:22px;">',
    '<li>See every lead in the queue (list + detail with engagement history)</li>',
    '<li>Update the pipeline stage (new, contacted, qualified, etc.)</li>',
    '<li>Update lead temperature (cold, warm, hot)</li>',
    '<li>Log activities (calls, notes, touchpoints)</li>',
    '<li>Book and reschedule appointments</li>',
    '<li>See per-lead engagement (opens, clicks, calls, campaign status) and scheduled-email content</li>',
    '</ul>',
    '<p><strong>What you cannot do (admin-only by design)</strong></p>',
    '<ul style="margin:6px 0 14px;padding-left:22px;">',
    '<li>Export the lead list as CSV (PII protection)</li>',
    '<li>Create or modify follow-up sequences (campaign management)</li>',
    '<li>Enroll or cancel leads in sequences (campaign management)</li>',
    '<li>Manually create or delete lead records (data hygiene)</li>',
    '<li>Manage users or roles (account admin)</li>',
    '</ul>',
    '<p><strong>About the temp password</strong></p>',
    '<p>The password is generated random. Self-serve password change is not yet built, so if you want it rotated, reply to this email and I will set a new one. Keep this email private until then.</p>',
    '<p><strong>First-login ask</strong></p>',
    '<p>Try logging in this week and click through a couple of leads so we know the access works end-to-end. If anything errors or feels off, send me a screenshot.</p>',
    '<p>Welcome aboard.</p>',
    '</div>',
    HTML_SIGNATURE,
  ].join('\n');
}

function buildText(rep) {
  return [
    `Hi ${rep.name.split(' ')[0]},`,
    '',
    'Ram asked me to get you set up on the colaberry lead queue. New leads from our forms (colaberry.ai/request-demo, worldoftaxonomy.com, trustbeforeintelligence.ai) flow into a shared queue. Any rep can claim and work them.',
    '',
    'Your login',
    `  URL:           ${LOGIN_URL}`,
    `  Username:      ${rep.email}`,
    `  Temp password: ${rep.tempPassword}`,
    '',
    'What you can do',
    '  - See every lead in the queue (list + detail with engagement history)',
    '  - Update the pipeline stage (new, contacted, qualified, etc.)',
    '  - Update lead temperature (cold, warm, hot)',
    '  - Log activities (calls, notes, touchpoints)',
    '  - Book and reschedule appointments',
    '  - See per-lead engagement and scheduled-email content',
    '',
    'What you cannot do (admin-only by design)',
    '  - Export the lead list as CSV (PII protection)',
    '  - Create or modify follow-up sequences (campaign management)',
    '  - Enroll or cancel leads in sequences (campaign management)',
    '  - Manually create or delete lead records (data hygiene)',
    '  - Manage users or roles (account admin)',
    '',
    'About the temp password',
    'The password is generated random. Self-serve password change is not yet built, so if you want it rotated, reply to this email and I will set a new one. Keep this email private until then.',
    '',
    'First-login ask',
    'Try logging in this week and click through a couple of leads so we know the access works end-to-end. If anything errors or feels off, send me a screenshot.',
    '',
    'Welcome aboard.',
    PLAIN_SIGNATURE,
  ].join('\n');
}

(async () => {
  if (!process.env.MANDRILL_API_KEY) { console.error('FATAL MANDRILL_API_KEY not set'); process.exit(1); }

  const stdin = await new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
  });
  let results;
  try { results = JSON.parse(stdin); }
  catch (e) { console.error('FATAL could not parse stdin as JSON:', e.message); process.exit(1); }

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });

  const sent = [];
  for (const rep of results) {
    if (rep.status !== 'provisioned') {
      console.log(`[skip] ${rep.email} (status=${rep.status})`);
      continue;
    }
    const html = buildHtml(rep);
    const text = buildText(rep);
    for (const [name, body] of [['HTML', html], ['TEXT', text], ['SUBJECT', SUBJECT]]) {
      if (body.indexOf('—') !== -1) { console.error('FATAL em-dash in ' + name + ' for ' + rep.email); process.exit(1); }
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

  console.log('\nRESULT_JSON:' + JSON.stringify({ sent }));
})().catch((e) => { console.error('FAIL:', e.message); console.error(e); process.exit(1); });
