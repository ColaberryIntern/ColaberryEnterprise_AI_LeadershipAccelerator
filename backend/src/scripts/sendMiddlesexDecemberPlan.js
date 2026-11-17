/**
 * Send Middlesex the December pilot plan, with the planned timeline IN THE BODY.
 *
 * Ali, 13 Nov 2026: "I like the email to jamie, but I also like gantt chart as the planned
 * timeline. If you can't put that in the email, then put together an html with a guided
 * walkthrough on all the key points. More ideal is in the email because she doesn't open
 * attachments very often. Send that out to everyone."
 *
 * ── WHY THE TIMELINE IS TEXT AND NOT A PICTURE ───────────────────────────────────────────
 *
 * Jamie has now failed to open three deliveries: the 9 Nov .html attachment ("I didn't even
 * know what to do with it"), and the 10 Nov hosted link, which on 13 Nov she described as
 * "more like a link but I can't open certain things". An image, an attachment and a URL are
 * all the same dead channel for this recipient. The email body is the only one that works.
 *
 * So the Gantt is drawn as a monospace block. It is sent twice: inside <pre> in the HTML
 * part, where it aligns exactly in Outlook and Edge (which is what she reads mail in), and
 * verbatim in the text part for anything that strips HTML. Above it sit date-labelled rows
 * that carry the same information WITHOUT depending on column alignment, so the meaning
 * survives a proportional font rendering the bars crooked.
 *
 * Usage:
 *   DRY_RUN=1 MANDRILL_API_KEY=... node backend/src/scripts/sendMiddlesexDecemberPlan.js
 *   MANDRILL_API_KEY=... node backend/src/scripts/sendMiddlesexDecemberPlan.js
 */
// Plain require, not a hardcoded relative path into node_modules: `npm ci` hoists this
// workspace's dependencies into the repository root, so resolution walks up and finds it.
// A path like `../../../node_modules/nodemailer` breaks the moment the script's depth or the
// hoist target changes, which is exactly what happens in a fresh worktree.
const nodemailer = require('nodemailer');
const { validateBeforeSend } = require('./lib/mandrillPreflight');

const DRY_RUN = process.env.DRY_RUN === '1';

const TO = 'jmorse@middlesexglass.net';
const CC = ['ram@colaberry.com', 'karun@colaberry.com', 'william@colaberry.com'];
const BCC = ['ali@colaberry.com'];
const SUBJECT = 'The December test, and what we need from you by the 1st';

/**
 * The planned timeline. ASCII only, 70 columns, so no client has to reflow it.
 *
 * Built from what Jamie said on 13 Nov, not from our own plan: she starts the December
 * requisitions "the eighth, maybe the eighth or ninth", the GC due date moves to the 18th,
 * and she is away from the 16th to the 21st. The away week is drawn as a gap rather than
 * left off, because the gap is the reason the dates moved.
 */
const LABEL_W = 14;
/** Columns per month. 13 keeps the whole chart inside 70 characters with the label gutter. */
const COLS_PER_MONTH = 13;
/** Months on the scale, in order, starting at November. */
const MONTHS = ['NOV', 'DEC', 'JAN', 'FEB'];

/** Column for a given month index and day. Nov 1 is column 0. */
function col(monthIndex, day) {
  return monthIndex * COLS_PER_MONTH + Math.round(((day - 1) / 30) * (COLS_PER_MONTH - 1));
}

/**
 * One bar, positioned by date rather than by eye.
 *
 * The first draft of this chart was hand-spaced and the "we build" bar covered the whole of
 * November when the build started on the 12th. A Gantt whose bars do not match their own
 * labels is worse than no Gantt, so every offset here is computed from the dates.
 */
function bar(label, fromCol, toCol, glyph) {
  const width = Math.max(1, toCol - fromCol + 1);
  return `  ${label.padEnd(LABEL_W - 2)}${' '.repeat(fromCol)}${glyph.repeat(width)}`;
}

const TIMELINE = [
  ' '.repeat(LABEL_W)
    + MONTHS.map((m) => m.padEnd(COLS_PER_MONTH).replace(/^/, '  ')).join('').slice(0, COLS_PER_MONTH * MONTHS.length),
  ' '.repeat(LABEL_W) + `${'|'}${`${'-'.repeat(COLS_PER_MONTH - 1)}|`.repeat(MONTHS.length)}`,
  bar('We build', col(0, 12), col(1, 5), '='),
  bar('Your test', col(1, 8), col(1, 15), '#'),
  bar('You away', col(1, 16), col(1, 21), '.'),
  bar('Full month', col(2, 5), col(2, 20), '#'),
  bar('Live', col(3, 1), col(3, 28), '='),
  ' '.repeat(LABEL_W) + `${'|'}${`${'-'.repeat(COLS_PER_MONTH - 1)}|`.repeat(MONTHS.length)}`,
  `${' '.repeat(LABEL_W)}  = we build      # you test      . you are away`,
].join('\n');

const BODY_TEXT = `Jamie,

Thanks for walking us through the whole month on Friday. Seeing the Z drive,
the red folders and the Trimble screens told us more than any call so far.

Here is the plan, and the only thing we need from you before December.


WHAT HAPPENS WHEN

  Now to December 5
  We build. Your schedule of values, the requisition itself, the project
  manager's screen, and last month's numbers carried forward automatically.

  December 8 to 15: the test, not a switch
  Pick one or two project managers. Instead of a blank requisition in a red
  folder, they fill theirs in on screen. You finalize those same jobs both
  ways and we check them against each other line by line. Brian and Nick keep
  signing on paper. Nothing changes for anyone else, and if it does not work
  you have lost nothing. We know you start around the 8th and the due date
  moves to the 18th this month, so we will be ready before you begin.

  December 16 to 21
  You are away. Nothing lands on you in that week.

  January 5 to 20: the same thing, every job
  Once December holds up, we run the full month alongside your spreadsheet,
  with Terry and Chris too. That is the month we can finally put a real
  number on what this saves you.

  After that: the red folder stops moving
  The requisition goes from you to the project manager to Brian to Nick on
  screen, with reminders ahead of each due date, so nothing is sitting on
  somebody's desk on the 18th. Everyone can see what the others changed.

${TIMELINE}


WHAT WE NEED FROM YOU BY DECEMBER 1

  1. The one or two project managers you want to test with. You already sort
     your tracker by project manager and start with whoever turns them around
     fastest, so you are the right person to pick.
  2. Their December jobs, and the schedules of values for them.
  3. November's finished requisitions for those same jobs, so the carried
     forward column starts from real numbers rather than from zero.


ONE THING WE GOT WRONG, AND HAVE FIXED

You told us the requisition goes from the project manager, to Brian, to Nick,
and then back to you, and that you are not one of the approvers. We had built
it with you approving in the middle. That is corrected: four seats, you are
the last one, and you have no approve button anywhere.

And rather than send you another link, let us get in front of a screen
together. William is nine minutes away.`;

/** The HTML part. Same words. The timeline sits in a <pre> so it aligns. */
const BODY_HTML = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6;">
${BODY_TEXT
    .split(`\n${TIMELINE}\n`)
    .map((half) => half
      .split('\n\n')
      .map((para) => `<p style="margin: 0 0 14px;">${para
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/\n/g, '<br />')}</p>`)
      .join('\n'))
    .join(`\n<pre style="font-family: Consolas, 'Courier New', monospace; font-size: 12px; `
      + `line-height: 1.5; color: #1a365d; background: #f7fafc; border-left: 3px solid #1a365d; `
      + `padding: 12px 14px; margin: 0 0 14px; overflow-x: auto;">${TIMELINE}</pre>\n`)}
</div>`;

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 24px;">
<tr><td>
<div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
<div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
<div style="color: #718096;">Colaberry Inc.</div>
<div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
<div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a></div>
</td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com`;

async function main() {
  const html = `${BODY_HTML}${SIG_HTML}`;
  const text = `${BODY_TEXT}\n\n${SIG_TEXT}`;

  // Hard-fails on an em-dash, a duplicated name, or a double sign-off.
  validateBeforeSend(html, text);

  if (DRY_RUN) {
    console.log('=== DRY RUN, nothing sent ===');
    console.log(`to:      ${TO}`);
    console.log(`cc:      ${CC.join(', ')}`);
    console.log(`bcc:     ${BCC.join(', ')}`);
    console.log(`subject: ${SUBJECT}`);
    console.log(`em-dashes: ${(text.match(/—|–/g) || []).length}`);
    console.log(`"Ali Muwwakkil" occurrences: ${(text.match(/Ali Muwwakkil/g) || []).length}`);
    console.log(`text bytes: ${Buffer.byteLength(text)}  html bytes: ${Buffer.byteLength(html)}`);
    console.log('\n----- TEXT BODY -----\n');
    console.log(text);
    return;
  }

  if (!process.env.MANDRILL_API_KEY) throw new Error('MANDRILL_API_KEY is not set');

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
    cc: CC,
    bcc: BCC,
    replyTo: 'ali@colaberry.com',
    subject: SUBJECT,
    html,
    text,
    // Opens only. The click tracker rewrites every URL, and a dead link to this exact
    // recipient is the failure this engagement has already had once.
    headers: { 'X-MC-Track': 'opens', 'X-MC-AutoText': 'false' },
  });

  // Log what the API returned, never a variable we set ourselves: a hardcoded recipient in a
  // success line once reported the wrong address on this very engagement.
  console.log(JSON.stringify({
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
  }, null, 2));
}

main().catch((e) => { console.error('SEND FAILED:', e.message); process.exit(1); });
