/**
 * Reply on the Gmail thread "Action needed - wire colaberry.ai forms into the
 * new lead ingestion system" (thread id 19dd440a87c57f1a) announcing the sales
 * role + 3 reps provisioned + queue live.
 *
 * Pulls the Message-ID of Ram's most recent message in the thread via Gmail
 * API so threading lands clean (In-Reply-To + References headers). Sends via
 * Mandrill. CC Sai Tejesh (he's on the existing thread). BCC Ali.
 *
 * Run: node backend/src/scripts/sendRamSalesQueueShippedReply20260604.js
 *
 * Output: Mandrill messageId + threaded Message-ID echoed.
 */
const path = require('path');
const nodemailer = require('nodemailer');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const THREAD_ID = '19dd440a87c57f1a';
const SUBJECT = 'Re: Action needed - wire colaberry.ai forms into the new lead ingestion system';

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

const HTML_BODY = [
  '<div style="font-family:arial,sans-serif;font-size:14px;color:#2d3748;line-height:1.55;">',
  '<p>Ram,</p>',
  '<p><strong>Shipped.</strong> The sales role + 3 rep accounts are live in production.</p>',
  '<p><strong>What landed:</strong></p>',
  '<ul style="margin:6px 0 14px;padding-left:22px;">',
  '<li>New <code>sales</code> role in the auth layer, scoped to read leads + update stage/temperature + log activities + book appointments. PII export, campaign management, sequence enrollment, user management, and lead deletion are all admin-only.</li>',
  '<li>3 accounts provisioned: John McBride, David Lahme, Nate Taylor. Each got a direct email with login URL, username, and temp password (BCCd to me for audit). You already have admin so you can triage TBI leads from your existing login.</li>',
  '<li>Shared queue per your call. No round-robin, no auto-routing. Any rep can claim any lead from the same list view.</li>',
  '</ul>',
  '<p><strong>Queue:</strong> <a href="https://enterprise.colaberry.ai/admin/leads" style="color:#2b6cb0;">enterprise.colaberry.ai/admin/leads</a></p>',
  '<p><strong>Two things still open, separate from this:</strong></p>',
  '<ol style="margin:6px 0 14px;padding-left:22px;">',
  '<li><strong>Auto-routing</strong> (your week-3 mention) is not in this drop. Still on the list. When you want to design the rules (round-robin, territory, lead-score-based), pull me in and we will scope.</li>',
  '<li><strong>Self-serve password change</strong> is not built yet. If any of the reps want their temp password rotated, they reply to me and I do it manually. Acceptable for 3 users; will build the endpoint when the team grows.</li>',
  '</ol>',
  '<p><strong>27 days late on this one, owning that.</strong> The 9 leads from April are sitting cold; the new accounts can start working them as soon as they log in. If anything breaks or feels off when the reps land, send me a screenshot.</p>',
  '</div>',
  HTML_SIGNATURE,
].join('\n');

const TEXT_BODY = [
  'Ram,',
  '',
  'Shipped. The sales role + 3 rep accounts are live in production.',
  '',
  'What landed:',
  '  - New sales role in the auth layer, scoped to read leads + update stage/temperature + log activities + book appointments. PII export, campaign management, sequence enrollment, user management, and lead deletion are all admin-only.',
  '  - 3 accounts provisioned: John McBride, David Lahme, Nate Taylor. Each got a direct email with login URL, username, and temp password (BCCd to me for audit). You already have admin so you can triage TBI leads from your existing login.',
  '  - Shared queue per your call. No round-robin, no auto-routing. Any rep can claim any lead from the same list view.',
  '',
  'Queue: https://enterprise.colaberry.ai/admin/leads',
  '',
  'Two things still open, separate from this:',
  '  1. Auto-routing (your week-3 mention) is not in this drop. Still on the list. When you want to design the rules (round-robin, territory, lead-score-based), pull me in and we will scope.',
  '  2. Self-serve password change is not built yet. If any of the reps want their temp password rotated, they reply to me and I do it manually. Acceptable for 3 users; will build the endpoint when the team grows.',
  '',
  '27 days late on this one, owning that. The 9 leads from April are sitting cold; the new accounts can start working them as soon as they log in. If anything breaks or feels off when the reps land, send me a screenshot.',
  PLAIN_SIGNATURE,
].join('\n');

(async () => {
  // em-dash gate
  for (const [name, body] of [['HTML', HTML_BODY], ['TEXT', TEXT_BODY], ['SUBJECT', SUBJECT]]) {
    if (body.indexOf('—') !== -1) { console.error('FATAL em-dash in ' + name); process.exit(1); }
  }
  console.log('em-dash gate OK');

  if (!process.env.MANDRILL_API_KEY) { console.error('FATAL MANDRILL_API_KEY not set'); process.exit(1); }
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    console.error('FATAL GMAIL OAuth env not set');
    process.exit(1);
  }

  // Resolve threading headers: Message-ID of the most recent message in the thread
  const tokRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const tokenJson = await tokRes.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) { console.error('FATAL Gmail token refresh failed:', JSON.stringify(tokenJson)); process.exit(1); }

  const threadRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/threads/' + THREAD_ID + '?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject', {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
  const thread = await threadRes.json();
  const messages = thread.messages || [];
  const last = messages[messages.length - 1];
  const lastHeaders = {};
  for (const h of (last.payload.headers || [])) lastHeaders[h.name.toLowerCase()] = h.value;
  const inReplyTo = lastHeaders['message-id'];
  const priorRefs = lastHeaders['references'] || '';
  const newRefs = (priorRefs + ' ' + (inReplyTo || '')).trim();
  console.log('In-Reply-To:', inReplyTo);
  console.log('References:', newRefs);

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });

  const sendRes = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ram@colaberry.com',
    cc: ['saitejesh@colaberry.com'],
    bcc: 'ali@colaberry.com',
    replyTo: 'ali@colaberry.com',
    subject: SUBJECT,
    text: TEXT_BODY,
    html: HTML_BODY,
    inReplyTo: inReplyTo,
    references: newRefs,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Mandrill sent:', sendRes.messageId);

  console.log('\nRESULT_JSON:' + JSON.stringify({ mandrillId: sendRes.messageId, inReplyTo, references: newRefs }));
})().catch((e) => { console.error('FAIL:', e.message); console.error(e); process.exit(1); });
