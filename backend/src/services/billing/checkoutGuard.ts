/**
 * checkoutGuard — may this member start a new paid checkout right now?
 *
 * Pure: subscription rows in, decision out, no database and no clock of its own.
 *
 * Until this existed, startCheckout would mint a second hosted payment for someone
 * who had already paid. Unuforeh Iyasere paid $149 on 2026-10-29 (her $199 month
 * less a $50 deposit credit), then checked out again on 2026-10-30 and paid $199
 * more. Both charges went through, the second activation superseded the first, and
 * $199 had to be refunded by hand.
 *
 * The rule: a member with an active paid month cannot buy another one until that
 * month is within the renewal window, which is the same seven days the renewal
 * reminder email uses (`ADVANCE_LEAD_DAYS`). That reminder's link IS a checkout, so
 * the window has to stay open for it.
 *
 * A row on a standing PaySimple schedule is blocked regardless of the date. The
 * schedule charges on its own, so any checkout on top of it bills the same month
 * twice; that is the Million Abate double charge of 2026-10-19 and 2026-10-24.
 *
 * Deliberately NOT blocked:
 *  - Comp (Free Access) rows. A comped seat may still choose to pay.
 *  - Pending rows. Every click on a plan creates one, including the many checkouts
 *    people abandon, so blocking on them would lock out anyone who closed the tab.
 *  - Active rows with no period end. That state should not exist; refusing on data
 *    we cannot read would strand a paying member, so it is allowed through.
 */
import { ADVANCE_LEAD_DAYS } from '../renewal/renewalReminderSelection';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How close to the renewal date a member with an active month may check out. */
export const RENEWAL_CHECKOUT_LEAD_DAYS = ADVANCE_LEAD_DAYS;

export interface CheckoutGuardRow {
  plan: string;
  status: string;
  current_period_end: Date | string | null;
  paysimple_schedule_id?: string | number | null;
}

export type CheckoutBlock =
  | null
  | { reason: 'already_subscribed'; renews_on: string | null; auto_billed: boolean };

export function checkoutBlock(rows: CheckoutGuardRow[], nowMs: number): CheckoutBlock {
  for (const row of rows) {
    if (row.status !== 'active' || row.plan === 'comp') continue;
    const endMs = row.current_period_end != null ? new Date(row.current_period_end).getTime() : NaN;
    const renewsOn = Number.isFinite(endMs) ? new Date(endMs).toISOString() : null;
    if (row.paysimple_schedule_id) {
      return { reason: 'already_subscribed', renews_on: renewsOn, auto_billed: true };
    }
    if (Number.isFinite(endMs) && endMs - nowMs > RENEWAL_CHECKOUT_LEAD_DAYS * DAY_MS) {
      return { reason: 'already_subscribed', renews_on: renewsOn, auto_billed: false };
    }
  }
  return null;
}

/** The sentence shown to the member. American English, no "free". */
export function checkoutBlockMessage(block: NonNullable<CheckoutBlock>): string {
  const when = block.renews_on
    ? new Date(block.renews_on).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })
    : null;
  if (block.auto_billed) {
    return when
      ? `Your membership renews automatically on ${when}, so there is nothing to pay now.`
      : 'Your membership renews automatically, so there is nothing to pay now.';
  }
  return when
    ? `You are already paid through ${when}. Renewal opens ${RENEWAL_CHECKOUT_LEAD_DAYS} days before that date.`
    : 'You already have an active membership.';
}
