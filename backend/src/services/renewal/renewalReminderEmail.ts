/**
 * The note a student gets before their membership period runs out.
 *
 * Pure rendering, no transport and no database, so the words that actually
 * reach a paying customer can be asserted in a unit test instead of reviewed by
 * eye in a dry run. Mirrors renderStudentBuildReadyEmail.js, which is the house
 * pattern for an outbound student email.
 *
 * Tone, per the program's standing email rules: plain and human, no em-dashes,
 * no marketing voice, one instruction. The student is being told four things
 * and nothing else - what ends, when it ends, what the next term costs, and the
 * link that pays it.
 *
 * Two things this copy deliberately does NOT say:
 *
 *  - It never says the membership "renews" or "will be charged". Nothing
 *    charges automatically on this platform. Implying otherwise would set up a
 *    student to do nothing and then be surprised, which is the exact failure
 *    the reminder exists to prevent.
 *  - It never promises a coverage end date. activateByRef anchors the new
 *    period on PAYMENT time, not on the old period end, so a student who pays
 *    three days early gets a period that starts three days early. Printing
 *    "covers you through September 18" would be wrong for everyone who acts on
 *    the email before the last day.
 */

import type { ReminderKind } from './renewalReminderSelection';

export const SUPPORT_REPLY_TO = 'ali@colaberry.com';

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 24px;">
  <tr><td>
    <div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
    <div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
    <div style="color: #718096;">Colaberry Inc.</div>
    <div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
    <div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
  </td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com  |  enterprise.colaberry.ai`;

export interface RenewalReminderEmailInput {
  full_name?: string | null;
  email?: string | null;
  /** 'monthly' | 'annual'. Anything else is treated as a generic term. */
  plan: string;
  kind: ReminderKind;
  /** ISO timestamp of current_period_end. */
  period_end: string;
  /** Full list price of the next term, in cents. */
  amount_cents: number;
  /** Account credit being applied to this checkout, in cents. 0 when none. */
  applied_credit_cents?: number;
  /**
   * True when a PaySimple schedule collects this automatically.
   *
   * Changes what the mail IS. On auto-pay it is a heads-up that money is about
   * to move and there is nothing to do; otherwise it is a request that only
   * works if the member acts. Telling an auto-pay member to go and pay would
   * invite a second payment for the same period.
   */
  autopay?: boolean;
  /** The hosted checkout URL the student clicks. */
  payment_link: string;
  /** Whole Central calendar days to the renewal date: 0 is today, 1 tomorrow.
   *  The urgency line is derived from this rather than from the reminder kind,
   *  because the daily job fires at a fixed hour and the period ends are spread
   *  across the clock. Saying "tomorrow" on the day itself is the exact error
   *  this parameter exists to prevent. Omitted means say nothing. */
  day_delta?: number;
}

function esc(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * A first name we are willing to put at the top of an email, or the local part
 * of the address when the stored name is unusable. Anything with digits or
 * punctuation in it is not a first name.
 */
export function firstName(fullName?: string | null, email?: string | null): string {
  const n = String(fullName || '').trim().split(/\s+/)[0];
  if (n && /^[A-Za-z][A-Za-z'-]*$/.test(n)) return n;
  return String(email || '').split('@')[0] || 'there';
}

export function formatMoney(cents: number): string {
  const n = Number.isFinite(cents) ? cents : 0;
  return `$${(Math.round(n) / 100).toFixed(2)}`;
}

/**
 * The renewal date as the student thinks of it. Rendered in US Central, which
 * is the program's operating timezone: current_period_end is a UTC instant, and
 * several of the live anchors sit in the evening UTC, so formatting in UTC would
 * print tomorrow's date to a student in Texas.
 */
export function formatPeriodEnd(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Chicago',
  }).format(new Date(ms));
}

function termNoun(plan: string): string {
  if (plan === 'annual') return 'year';
  if (plan === 'monthly') return 'month';
  return 'term';
}

/** "today" / "tomorrow" / null, from the Central calendar delta. Never guessed
 *  from the reminder kind. */
export function urgencyWord(dayDelta: number | undefined): 'today' | 'tomorrow' | null {
  if (dayDelta === 0) return 'today';
  if (dayDelta === 1) return 'tomorrow';
  return null;
}

export function renewalSubject(
  input: Pick<RenewalReminderEmailInput, 'plan' | 'period_end' | 'day_delta' | 'autopay'>,
): string {
  const ms = Date.parse(input.period_end);
  const short = Number.isFinite(ms)
    ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Chicago' }).format(new Date(ms))
    : '';
  // States the fact, not the ask. "Payment is due" is accurate and it is what a
  // student scanning an inbox needs to see without opening anything.
  // A lapsed member must never be told a payment "is due <a date that has passed>".
  // day_delta is negative once the period has ended.
  if (typeof input.day_delta === 'number' && input.day_delta < 0) {
    return 'Your Colaberry membership payment';
  }
  const word = urgencyWord(input.day_delta);
  // On auto-pay "payment is due" is the wrong fact and it contradicts the body,
  // which says there is nothing to do. The subject is read in the inbox list
  // before the body is opened at all, so a member who only ever sees the subject
  // would go and pay something a schedule is about to collect. Renewing is what
  // is actually happening to them.
  if (input.autopay === true) {
    if (!short) return 'Your Colaberry membership renews automatically';
    return word
      ? `Your Colaberry membership renews ${word}, ${short}`
      : `Your Colaberry membership renews ${short}`;
  }
  if (!short) return 'Your Colaberry membership payment is due';
  return word
    ? `Your Colaberry membership payment is due ${word}, ${short}`
    : `Your Colaberry membership payment is due ${short}`;
}

/**
 * @returns the subject and both bodies, ready for a transport.
 */
export function renderRenewalReminderEmail(
  input: RenewalReminderEmailInput,
): { subject: string; text: string; html: string } {
  const name = firstName(input.full_name, input.email);
  const when = formatPeriodEnd(input.period_end);
  const term = termNoun(input.plan);
  const full = Math.max(0, Number(input.amount_cents) || 0);
  const credit = Math.max(0, Number(input.applied_credit_cents) || 0);
  const charge = Math.max(0, full - credit);
  const link = String(input.payment_link || '');

  // Once the date has passed the whole framing has to change. "Paid through
  // <past date>" reads as an accusation and "the next month" is ambiguous about
  // whether they are being billed for time they did not have. What we are
  // actually selling after a lapse is a FORWARD month starting when they pay;
  // the elapsed period is written off and is never charged for.
  const lapsed = typeof input.day_delta === 'number' && input.day_delta < 0;

  const endsLine = lapsed
    ? 'Your Colaberry membership renewal has come due and it looks like the payment has not gone through yet.'
    : (when
      ? `Your Colaberry membership is paid through ${when}.`
      : 'Your Colaberry membership term is ending.');

  // The real charge is the only number that matters to the person paying it, so
  // the credit case leads with what leaves their account and shows the maths.
  const nextTerm = lapsed ? `A further ${term}` : `The next ${term}`;
  const priceText = credit > 0
    ? `${nextTerm} is ${formatMoney(full)}. You have ${formatMoney(credit)} of account credit on file, so this payment is ${formatMoney(charge)}.`
    : `${nextTerm} is ${formatMoney(full)}.`;

  const word = lapsed ? null : urgencyWord(input.day_delta);
  const urgency = word ? `That is ${word}.` : '';

  // Nothing has been cut off, and saying so plainly is the difference between a
  // note someone acts on and one they brace against.
  // WHAT THIS SENTENCE USED TO SAY, AND WHY IT CHANGED.
  //
  // For an unscheduled member it read 'Nothing bills automatically, so this
  // payment has to come from you.' That was true, and it taught every reader
  // that lapsing was simply a matter of not clicking. Members who intended to
  // stay just stopped: 21 of them had paid exactly once since July.
  //
  // On auto-pay the honest sentence is the opposite, and it still has to be
  // said plainly. Money is about to leave their account on a known date and
  // they are entitled to hear that before it happens rather than after.
  const autopay = input.autopay === true;
  const reassurance = lapsed
    ? 'Nothing has changed on your account and your access is exactly as it was. This is not a warning.'
    : autopay
      ? 'This renews on its own using the card already on file, so there is nothing for you to do.'
      : 'Your place carries on as long as the payment goes through.';

  // The old non-lapsed closer offered 'do nothing and no payment will be taken'
  // as the way out. Silence is the easiest thing a busy person does, which made
  // leaving the default and staying the effortful choice. Cancelling is still
  // available and always will be, but it is now something a member SAYS rather
  // than something that happens to them by inaction.
  const closer = lapsed
    ? 'If you would rather stop here, reply with the word "cancel" and I will take care of it. If something went wrong at the payment page, reply and tell me what you saw and I will fix it.'
    : autopay
      ? 'If you need to change the card, pause, or stop before then, reply and tell me and I will take care of it.'
      : 'If anything above looks wrong, or you want to change or stop your membership, reply and tell me and I will sort it out.';

  // ── WHY A SCHEDULED MEMBER GETS NO PAYMENT LINK ────────────────────────────
  //
  // The link used to be unconditional, and the sentence introducing it read
  // "This link opens a checkout page for it." Combined with the auto-pay
  // reassurance above, a scheduled member was told BOTH that there is nothing
  // for them to do AND here is where to pay. A member who acts on the second
  // half pays for a period PaySimple is about to collect anyway.
  //
  // That is the same double-charge this branch was introduced to prevent, so
  // the link has to go with it. A lapsed member still gets one: their schedule,
  // if any, is not collecting for the period that already ended.
  const offerLink = !autopay || lapsed;

  const text = `${name},

${endsLine}${urgency ? ` ${urgency}` : ''} ${priceText}

${reassurance}${offerLink ? ` This link opens a checkout page for it:

${link}` : ''}

${closer}

${SIG_TEXT}
`;

  const html = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6; max-width: 640px;">
<p>${esc(name)},</p>
<p>${esc(endsLine)}${urgency ? ` <strong>${esc(urgency)}</strong>` : ''} ${esc(priceText)}</p>
<p>${esc(reassurance)}</p>
${offerLink ? `<p style="margin: 22px 0;"><a href="${esc(link)}" style="display: inline-block; background: #1a365d; color: #ffffff; padding: 11px 22px; border-radius: 4px; text-decoration: none; font-weight: 600;">Pay ${esc(formatMoney(charge))} for ${lapsed ? 'a further' : 'the next'} ${esc(term)}</a></p>` : ''}
<p>${esc(closer)}</p>
${SIG_HTML}
</div>`;

  return { subject: renewalSubject(input), text, html };
}
