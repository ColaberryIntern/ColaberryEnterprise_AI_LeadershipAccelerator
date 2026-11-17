/**
 * Confirm William's 14 Nov plan for the Middlesex pricing proposal.
 *
 * He accepted all four points and asked "does the above seem to be in line with what we are
 * thinking?". This is the yes, plus the two things he could not know: Jamie is inside her
 * November billing crunch this week, and retainage is already understood from their own
 * workbooks so his ten minutes with her should go entirely to change orders.
 *
 * Usage:
 *   DRY_RUN=1 node backend/src/scripts/sendWilliamMiddlesexConfirm.js
 *   MANDRILL_API_KEY=... node backend/src/scripts/sendWilliamMiddlesexConfirm.js
 */
const { sendSimpleMail } = require('./lib/sendSimpleMail');

const TEXT = `William,

Yes, that is exactly it. Go ahead on all four, and thank you for catching the
$10,000 before it reached Nick.

Two notes on timing. Jamie is inside her November billing run right now. She
bills around the 14th to the 16th and the general contractors have pulled this
month in to the 16th or 17th because of Thanksgiving, so this is the wrong week
to ask her for the loaded hourly cost, the annual billings, or ten minutes on
anything. Ask Nick for the two numbers if you can get to him, and put the Jamie
session after the 20th.

And when you do get that session, point all of it at change orders. Retainage
we already understand from their own workbooks: it is a percentage of work in
place plus a separate percentage of stored materials, it runs 5, 7 or 10
percent depending on the contract, and Fairfield retains zero. Change orders
are the real gap. We have seen them in their data, Fairfield carries $391,472
of them, but we have never seen how they move through the office. Spending the
whole ten minutes there will get you more and cost her less.

On Nick, yes. In person, before the priced proposal, and you are nine minutes
away. That is the shortest path we have had on this engagement and it has been
open since the 9th.`;

sendSimpleMail({
  to: 'william@colaberry.com',
  cc: ['ram@colaberry.com', 'karun@colaberry.com'],
  subject: 'Re: Middlesex billing: my thinking on pricing, plus a 4 minute walkthrough before Wednesday',
  text: TEXT,
  // Internal thread carrying pricing: no tracking pixel, no link rewriting.
  track: 'none',
}).catch((e) => { console.error('SEND FAILED:', e.message); process.exit(1); });
