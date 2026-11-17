/**
 * Reply to William O'Connell on the Middlesex pricing proposal (13 Nov 2026).
 *
 * Internal, so tracking is off entirely rather than opens-only.
 *
 * The $10,000 "already paid" figure is retired here. Ali confirmed on 14 Nov that it was
 * never billed: he heard it from Ram and carried it forward as fact. It had reached rev3 and
 * rev4 of the pricing material and the "they are already in for $22k" framing, both of which
 * are now wrong. William caught it from the outside.
 *
 * Archive note (17 Nov 2026): one phrase differs from what was sent. Section 4 said Trimble Pay
 * was "f-r-e-e to invited subs"; here it reads "costs invited subs nothing", because a new file
 * may carry no banned word (bannedWordOutboundCopy.test.ts). The meaning is unchanged.
 *
 * Usage:
 *   DRY_RUN=1 node backend/src/scripts/sendWilliamMiddlesexPricingReply.js
 *   MANDRILL_API_KEY=... node backend/src/scripts/sendWilliamMiddlesexPricingReply.js
 */
const nodemailer = require('nodemailer');
const { validateBeforeSend } = require('./lib/mandrillPreflight');

const DRY_RUN = process.env.DRY_RUN === '1';

const TO = 'william@colaberry.com';
const CC = ['ram@colaberry.com', 'karun@colaberry.com'];
const BCC = ['ali@colaberry.com'];
const SUBJECT = 'Re: Middlesex billing: my thinking on pricing, plus a 4 minute walkthrough before Wednesday';

const BODY_TEXT = `William,

Thanks for turning this around. On the $10,000, you are right, and it is
simpler than you thought: it was never billed. That figure reached me
secondhand from Ram and I carried it forward as fact without checking it, which
is on me. Take it out of the proposal. There is nothing for accounting to
confirm.

Worth being clear eyed about what that means. Middlesex has paid us nothing for
AIA billing. We are three weeks into a build with nothing signed and nothing
invoiced, which makes getting Nick in front of this more urgent rather than
less.

Taking your four questions in order.


1. WHAT THE $12,000 COVERS

Everything through go live, which is both phases and not just the billing run.
Platform and hosting, the schedule of values, the requisition itself, the
project manager entry screen, the carry forward column, exports, and then the
February scope you named: sequential approvals, the reminder ladder, electronic
signature, the change order gate and retainage.

Two things are worth writing down as explicitly excluded. Electronic
notarization is out. Jamie told us on Friday that she and Terry both hold
physical stamps and that she has no electronic way to notarize, Massachusetts
remote online notarization is not live, and the state's statutory lien waiver
form has no notary block. We should not let a proposal imply we are solving
that. GC portal integration is also out, and that one came from Jamie
unprompted while she was showing us Trimble Pay: "this is nothing that I'm
expecting, we're not driving that."

You are right that she has not walked us through signatures and change orders.
Retainage we do understand from their own workbooks, including that it is a
percentage of work in place plus a separate percentage of stored materials, and
that it varies by contract, with Fairfield at zero. Change orders we have seen
in their data, Fairfield carries $391,472.48 of them, but not in their process.
Those two are worth twenty minutes with Jamie before the February scope is
final.


2. WHEN THE RETAINER STARTS, TERMS, AND FIRST TERM

The retainer starts the month they go live and stop using the spreadsheet, not
before. December and January are both unbilled, deliberately, because they are
measurement rather than delivery.

That month is February or March, and Ram and I still owe a decision on which.
The January run and the February build land on one builder in the same weeks,
and I would rather support January properly and go live in March than ship an
approval chain into their busiest week. Please do not put a month in the
proposal until Ram and I close that.

My suggestion on terms is monthly, net 15, with a twelve month initial term.
Ram should have the final say.


3. HOLDING A FIRM SAVINGS NUMBER UNTIL AFTER JANUARY

Yes. Hold it, and say in the proposal that we are holding it.

The first measured figure does not exist until the January run closes around
the 20th. December is now one or two project managers rather than the whole
company, so it tells us whether a project manager will use a screen instead of
a pencil, not what the company saves. Any number we put in front of Nick before
late January is modeled, and a modeled number is the one thing that would make
every other figure in the proposal suspect.

I would rather tell Nick plainly that we will measure it on his own January
billing and bring him the real number then. That is a stronger position than a
range he cannot check.


4. DROPPING THE TEXTURA COMPARISON

Drop it. You are right, and it is worse than you think.

If Textura caps at $5,000 a contract and Trimble Pay costs invited subs nothing,
then the portal comparison argues that this costs Middlesex very little today,
which is the opposite of what we want it doing. The portals are not competitors
in any case. Middlesex submits into whichever one each general contractor
demands, and still needs its own authoring and approval layer either way.

Keep Knowify and Siteline as the peers, and answer the licence objection head
on: those are licences, this is a build, so the monthly reads as roughly $400
of platform and $1,600 of continuing development.

The anchor that actually works is their own labor, and we are still missing the
number that makes it land. Please ask Nick or Jamie for two things: their
loaded hourly cost for the accounting seats, and what Middlesex bills in a
year. Jamie had a single prior month on screen at $3.3 million on Friday.


TWO CORRECTIONS FOR THE PROPOSAL

The volume is 70 requisitions a month across Middlesex Glass and Middlesex
Building Products, not 65. Three accountants and seven days is still right.

And there is a structural problem with the ladder. The step to $2,000 was
justified by Module 3, submission and the GC loop, which is the module Jamie
has now ruled out. The top of the ladder currently has nothing behind it. I am
re-scoping it this week, so either hold the ladder at $1,750 in the draft or
leave the third step undescribed until I get you the replacement.


Last thing, and it is the one that worries me most. Nick has still never seen
this. His approval is a text message you sent him two weeks ago. Before a
priced proposal reaches him, get him in front of the screen, in person if that
is easiest for you. A number lands differently when the person reading it has
already seen the thing.`;

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 24px;">
<tr><td>
<div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
<div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
<div style="color: #718096;">Colaberry Inc.</div>
<div style="margin-top: 10px; color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a></div>
</td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.
ali@colaberry.com`;

const BODY_HTML = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6;">`
  + BODY_TEXT.split('\n\n').map((para) => {
    const safe = para.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br />');
    // The numbered section headings are shouted in the text part; make them headings in HTML
    // rather than leaving a wall of capitals in a client-adjacent thread.
    return /^[0-9]\.\s[A-Z ,$]+$|^TWO CORRECTIONS/.test(para)
      ? `<div style="font-weight: 700; color: #1a365d; margin: 22px 0 8px;">${safe}</div>`
      : `<p style="margin: 0 0 14px;">${safe}</p>`;
  }).join('\n')
  + '</div>';

async function main() {
  const html = `${BODY_HTML}${SIG_HTML}`;
  const text = `${BODY_TEXT}\n\n${SIG_TEXT}`;

  validateBeforeSend(html, text);

  if (DRY_RUN) {
    console.log('=== DRY RUN, nothing sent ===');
    console.log(`to:      ${TO}`);
    console.log(`cc:      ${CC.join(', ')}`);
    console.log(`bcc:     ${BCC.join(', ')}`);
    console.log(`subject: ${SUBJECT}`);
    console.log(`em-dashes: ${(text.match(/—|–/g) || []).length}`);
    console.log(`"Ali Muwwakkil" occurrences: ${(text.match(/Ali Muwwakkil/g) || []).length}`);
    console.log(`text bytes: ${Buffer.byteLength(text)}`);
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
    // Internal thread carrying pricing. No tracking pixel, no link rewriting.
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });

  console.log(JSON.stringify({
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
  }, null, 2));
}

main().catch((e) => { console.error('SEND FAILED:', e.message); process.exit(1); });
