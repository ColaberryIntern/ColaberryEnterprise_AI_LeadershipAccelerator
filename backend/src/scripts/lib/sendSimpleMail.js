/**
 * Send one plain outbound email as Ali, with the house guards already wired.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────
 *
 * Three one-off send scripts appeared in two days (the Middlesex December plan, the reply to
 * William on pricing, and his confirmation), each repeating the same transport, the same
 * signature block, the same preflight call and the same dry-run branch. Three is the point at
 * which this repo's composition rule says to lift it, so here it is.
 *
 * `sendWithBcAttach` remains the right tool when an email belongs to a Basecamp ticket and
 * should be attached to it. This is for the rest: a body, recipients, and the guards.
 *
 * The two scripts written before this one are deliberately NOT retrofitted. They have already
 * run, they will not run again, and editing a script after the fact to tidy it makes the
 * audit trail describe something that never executed.
 *
 * What it guarantees:
 *   - the branded signature is appended exactly once, so "Ali Muwwakkil" appears once
 *   - `validateBeforeSend` runs, which hard-fails on an em-dash, a duplicated name or a
 *     double sign-off
 *   - Ali is always bcc'd, even if the caller forgets
 *   - the result logged is what the API returned (`info.accepted`), never a variable we set:
 *     a hardcoded recipient in a success line once reported the wrong address on this very
 *     engagement
 */
const nodemailer = require('nodemailer');
const { validateBeforeSend } = require('./mandrillPreflight');

const ALI = 'ali@colaberry.com';

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 24px;">
<tr><td>
<div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
<div style="color: #2b6cb0; font-weight: 600;">Managing Director / Forward Deployed AI Engineer</div>
<div style="color: #718096;">Colaberry Inc.</div>
<div style="margin-top: 10px; color: #2d3748;"><a href="mailto:${ALI}" style="color: #2b6cb0; text-decoration: none;">${ALI}</a></div>
</td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / Forward Deployed AI Engineer
Colaberry Inc.
${ALI}`;

/** Paragraphs from the plain-text body. The text part stays the source of truth. */
function htmlFromText(text) {
  return `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6;">`
    + text.split('\n\n').map((para) => {
      const safe = para.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br />');
      return `<p style="margin: 0 0 14px;">${safe}</p>`;
    }).join('\n')
    + '</div>';
}

/**
 * @param {object} o
 * @param {string|string[]} o.to
 * @param {string[]} [o.cc]
 * @param {string} o.subject
 * @param {string} o.text        Plain-text body WITHOUT the signature.
 * @param {string} [o.html]      Optional custom HTML body; defaults to paragraphs from `text`.
 * @param {'none'|'opens'|'opens,clicks'} [o.track]  Default 'none'. Use 'opens' for a client
 *   send where a read receipt matters; never 'opens,clicks' on a thread whose links must not
 *   be rewritten.
 * @param {boolean} [o.dryRun]   Defaults to the DRY_RUN=1 environment variable.
 */
async function sendSimpleMail(o) {
  const dryRun = o.dryRun !== undefined ? o.dryRun : process.env.DRY_RUN === '1';
  const text = `${o.text}\n\n${SIG_TEXT}`;
  const html = `${o.html || htmlFromText(o.text)}${SIG_HTML}`;

  validateBeforeSend(html, text);

  const to = Array.isArray(o.to) ? o.to : [o.to];
  const cc = o.cc || [];

  if (dryRun) {
    console.log('=== DRY RUN, nothing sent ===');
    console.log(`to:      ${to.join(', ')}`);
    console.log(`cc:      ${cc.join(', ') || '(none)'}`);
    console.log(`bcc:     ${ALI}`);
    console.log(`subject: ${o.subject}`);
    console.log(`track:   ${o.track || 'none'}`);
    console.log(`em-dashes: ${(text.match(/—|–/g) || []).length}`);
    console.log(`"Ali Muwwakkil" occurrences: ${(text.match(/Ali Muwwakkil/g) || []).length}`);
    console.log(`\n----- TEXT BODY -----\n\n${text}`);
    return null;
  }

  if (!process.env.MANDRILL_API_KEY) throw new Error('MANDRILL_API_KEY is not set');

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    auth: {
      user: process.env.MANDRILL_USERNAME || ALI,
      pass: process.env.MANDRILL_API_KEY,
    },
  });

  const info = await transport.sendMail({
    from: `"Ali Muwwakkil" <${ALI}>`,
    to,
    cc,
    bcc: [ALI],
    replyTo: ALI,
    subject: o.subject,
    html,
    text,
    headers: { 'X-MC-Track': o.track || 'none', 'X-MC-AutoText': 'false' },
  });

  console.log(JSON.stringify({
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
  }, null, 2));
  return info;
}

module.exports = { sendSimpleMail, SIG_TEXT, SIG_HTML };
