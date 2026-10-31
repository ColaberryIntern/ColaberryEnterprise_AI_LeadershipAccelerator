/**
 * billingPeriod — when a membership renews. Pure date arithmetic, no database and
 * no models, so both the activation path and the renewal path can share ONE
 * implementation of "a month from now".
 *
 * They did not share one before. `subscriptionService` had the calendar math and
 * `subscriptionScheduleService` had its own inline copy, and the copies disagreed
 * about which day of the month to use — which is exactly how an end-of-month
 * membership drifted (see `periodEndMs`).
 */

/**
 * Billing anchor: THE DAY THEY SIGNED UP, always. Sign up on the 3rd and the
 * membership runs to the 3rd of next month, or the 3rd of next year on annual.
 *
 * This used to anchor on the class start date whenever payment landed first, so
 * that paying early never cost a member days: pay 7/20 for a class starting 7/23
 * and the month ran 7/23 → 8/23. That was the right rule for cohort intakes and
 * the wrong one once registrations began arriving all through the month —
 * enrollment is rolling, so there is no shared start date for a period to wait for.
 *
 * It also made the answer depend on something the member cannot see. The anchor was
 * `max(payment, cohort start)`, so it varied with whichever cohort the enrollment
 * landed in: of 89 subscriptions over the 180 days to 2026-10-30, 58 anchored on the
 * signup day and 10 on a cohort start. Two people paying the same afternoon could get
 * different renewal dates. Anchoring on signup removes the coupling and the variance.
 *
 * THE COST, recorded so it is not rediscovered as a bug: a member who signs up before
 * a class begins now spends part of their first month waiting for it. Sign up 10/30
 * for a class starting 11/12 and the renewal is 11/30, eighteen days into the class
 * rather than a month. That is a deliberate trade for a predictable anniversary.
 *
 * `cohortStartDate` is retained because callers still pass it; it no longer affects
 * the result.
 */
export function billingAnchorMs(paymentMs: number, _cohortStartDate?: string | null): number {
  return paymentMs;
}

/** The day of the month a membership renews on, taken from the signup. */
export function anniversaryDayOfMonth(signupMs: number): number {
  return new Date(signupMs).getUTCDate();
}

/**
 * End of a billing period: +1 calendar month (monthly) or +1 calendar year (annual)
 * from the anchor — "a month" means the same day next month (7/23 → 8/23), clamped
 * to the last day when the target month is shorter (1/31 → 2/28).
 *
 * `anniversaryDay` is the day from the ORIGINAL signup, and it is what stops an
 * end-of-month membership walking backwards. Sign up 1/31: February clamps to 2/28,
 * and if March were then computed from the 28th the member would renew on the 28th
 * for good. PaySimple does not do that — `cadenceFor` maps day 31 to `LastofMonth`,
 * so it bills 3/31 — and our record would stop matching the charges from the third
 * month on. Carrying the signup day makes short months clamp and long months recover:
 * 1/31 → 2/28 → 3/31 → 4/30.
 *
 * Omitted or out of range, it falls back to the anchor's own day, which is correct
 * for a first period because the anchor IS the signup.
 */
export function periodEndMs(
  anchorMs: number,
  cadence: 'year' | 'month',
  anniversaryDay?: number,
): number {
  const d = new Date(anchorMs);
  const requested = anniversaryDay as number;
  const day = Number.isInteger(requested) && requested >= 1 && requested <= 31
    ? requested : d.getUTCDate();
  const targetYear = cadence === 'year' ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  const targetMonth = cadence === 'year' ? d.getUTCMonth() : d.getUTCMonth() + 1;
  const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return Date.UTC(
    targetYear, targetMonth, Math.min(day, lastDayOfTarget),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds(),
  );
}
