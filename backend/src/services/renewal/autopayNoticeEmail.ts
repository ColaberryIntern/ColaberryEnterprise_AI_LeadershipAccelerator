/**
 * The one-time note telling a member their membership is now on auto-pay.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * On 2026-09-01, 20 members were migrated onto standing PaySimple schedules and
 * NOBODY TOLD THEM. Their only notice would have been the renewal reminder, which
 * fires 7 days out and again 1 day out. For the members charging soonest even that
 * failed: their 7-day reminder had already gone out BEFORE the migration, carrying
 * the old wording, so their most recent instruction from us was to go and pay a
 * link by hand. Two of them were three days from an automatic charge.
 *
 * Storing a credential and then charging it on a schedule is something a member
 * is entitled to hear about deliberately, not infer from a reminder. This is that
 * message.
 *
 * ── WHAT IT MUST AND MUST NOT DO ────────────────────────────────────────────
 *
 * It states the date and the amount, because a disclosure that says "you are on
 * auto-pay now" without saying when or how much is not a disclosure. Both come
 * from the GATEWAY, never from our own subscriptions table: the book records what
 * we intended and the gateway records what will actually happen, and on the
 * August cohort those differ by a month by design.
 *
 * It carries NO payment link, for the same reason the auto-pay renewal reminder
 * does not. Handing a payment link to someone you have just told is on automatic
 * billing is how a member pays twice for one month.
 *
 * It always says how to get out, in the same breath as the charge date, and it
 * promises action before that date. An opt-out a member has to hunt for is not
 * one.
 */
import { SIG_HTML, SIG_TEXT, firstName, formatMoney } from './renewalReminderEmail';

export interface AutopayNoticeInput {
  full_name?: string | null;
  email?: string | null;
  /** 'monthly' | 'annual'. Anything else renders as a generic term. */
  plan: string;
  /** Amount the schedule will take, in cents, as the GATEWAY reports it. */
  amount_cents: number;
  /** ISO date of the next scheduled charge, as the GATEWAY reports it. */
  next_charge_iso: string;
}

function esc(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The charge date as the member thinks of it.
 *
 * TWO INPUT SHAPES, AND TREATING THEM ALIKE PRINTS THE WRONG DAY.
 *
 * PaySimple reports NextScheduledPaymentDate as a CALENDAR DATE ("2026-09-04").
 * That is not an instant and it has no timezone. Parsing it lands on UTC
 * midnight, and UTC midnight is 7pm the PREVIOUS day in Central, so formatting it
 * in the program timezone prints September 3 for a charge that happens on the
 * 4th. Telling 20 members their card will be charged a day before it is would
 * make the disclosure worse than none.
 *
 * So a date-only string is formatted AS a calendar date, with no conversion. A
 * full timestamp is a real instant and is rendered in Central, where a member
 * in Texas reads it.
 */
export function formatChargeDate(iso: string): string {
  const raw = String(iso || '').trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    // Noon UTC, formatted in UTC: far enough from either midnight that no
    // rounding can move the day.
    const at = Date.UTC(Number(y), Number(m) - 1, Number(d), 12);
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
    }).format(new Date(at));
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    timeZone: 'America/Chicago',
  }).format(new Date(ms));
}

function cadence(plan: string): string {
  if (plan === 'annual') return 'yearly';
  if (plan === 'monthly') return 'monthly';
  return 'each term';
}

export const AUTOPAY_NOTICE_SUBJECT = 'Your Colaberry membership now renews automatically';

/**
 * @returns subject and both bodies, ready for a transport. Pure: no database,
 *          no gateway, so the words a paying member receives are unit-testable.
 */
export function renderAutopayNoticeEmail(
  input: AutopayNoticeInput,
): { subject: string; text: string; html: string } {
  const name = firstName(input.full_name, input.email);
  const when = formatChargeDate(input.next_charge_iso);
  const amount = formatMoney(input.amount_cents);
  const every = cadence(input.plan);

  // "on file" rather than "your card": three members pay by bank draft, and while
  // none of them are on a schedule today, a wrong noun in a billing disclosure is
  // the kind of detail a member is entitled to have right.
  const dateLine = when
    ? `The next payment is ${amount} on ${when}, and it will continue ${every} from then.`
    : `The next payment is ${amount}, and it will continue ${every}.`;

  const text = `${name},

I want you to know this before it happens rather than after.

Your membership now renews automatically using the payment method already on file. ${dateLine}

Nothing changes about your access or your price. What changes is that you no longer have to go and pay a link each ${every === 'yearly' ? 'year' : 'month'}.

If you would rather not be on automatic payment, or you need to change the card, pause, or stop altogether, reply and tell me. I will take care of it, and I will do it before the date above if you tell me before then.

${SIG_TEXT}
`;

  const html = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6; max-width: 640px;">
<p>${esc(name)},</p>
<p>I want you to know this before it happens rather than after.</p>
<p>Your membership now renews automatically using the payment method already on file. <strong>${esc(dateLine)}</strong></p>
<p>Nothing changes about your access or your price. What changes is that you no longer have to go and pay a link each ${esc(every === 'yearly' ? 'year' : 'month')}.</p>
<p>If you would rather not be on automatic payment, or you need to change the card, pause, or stop altogether, reply and tell me. I will take care of it, and I will do it before the date above if you tell me before then.</p>
${SIG_HTML}
</div>`;

  return { subject: AUTOPAY_NOTICE_SUBJECT, text, html };
}
