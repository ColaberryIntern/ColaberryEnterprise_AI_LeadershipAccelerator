/**
 * THE PRICE OF RECORD for the membership. One place. Everything else derives from here.
 *
 * WHAT THE PRICE OF RECORD IS, AND WHY IT IS A MEASUREMENT RATHER THAN A CHOICE
 * ----------------------------------------------------------------------------
 * The membership is **$149 per month billed annually**, which charges **$1,788 once a year**.
 * Those are one fact, not two: 1788 is 149 x 12 and is derived below, never typed.
 *
 * C10.2 was raised because a revenue plan discussed on 30 October 2026 used $1,700 while the
 * system held $1,788. Measured against production on 2 November 2026, the answer is not a
 * matter of opinion:
 *
 *   - ALL 44 annual subscription rows ever created are recorded at $1,788 - 4 active,
 *     1 canceled, 17 failed, 22 pending - with zero variance since 17 July 2026.
 *   - 5 paid enrollments carry amount_paid = 1788.00, and the four active annual members
 *     agree on both columns.
 *   - $1,700 appears in NO subscription row, NO enrollment row, and nowhere in the codebase,
 *     the docs or the skills. Every `1700` in the repo is a scroll offset or a timeout.
 *
 * So $1,788 is what the business charges and has always charged. $1,700 was a planning figure
 * that never existed in the system. On a target of 30 subscriptions a month the difference is
 * $2,640 a month, and any enrollment target computed from $1,700 is about 5% optimistic.
 *
 * CHANGING the price is a different question and a governance boundary: it is a business-model
 * decision for Ali, not an implementation detail. This module is what makes such a change a
 * one-line edit instead of a hunt through forty files.
 *
 * WHY THIS MODULE HAS NO IMPORTS
 * ------------------------------
 * It is deliberately a leaf. `admissionsPricing.ts` could not import `subscriptionService`
 * because billing reaches the email service through the enrollment service and the email
 * service reads `admissionsPricing` - so importing the plans there would close a cycle. That
 * is why the contract between what checkout charges and what Maya says was previously enforced
 * by reading `subscriptionService.ts` as TEXT and regex-matching the number out of it.
 *
 * A dependency-free constant removes that constraint: both sides import this, and the guard
 * checks they REFERENCE it rather than checking two numbers happen to match. Keep it leafless.
 * Adding an import here can reintroduce the cycle for every consumer at once.
 *
 * @see scripts/checkPriceAgreement.js - the build guard over every surface that quotes a price
 */

/** The two plans, as the rate a member is quoted. These are the only typed prices. */
export const MEMBERSHIP_PRICE = {
  /** Annual plan, expressed the way it is sold and quoted: per month, billed annually. */
  annualPerMonth: 149,
  /** Month-to-month plan. */
  monthly: 199,
} as const;

/** Months in the annual term. Named so the derivation below reads as arithmetic, not a magic 12. */
export const ANNUAL_TERM_MONTHS = 12;

/**
 * What the annual plan actually charges, once a year: $1,788. DERIVED, never typed - so the
 * per-month rate above is the single thing that changes if the price ever changes.
 */
export const ANNUAL_CHARGE = MEMBERSHIP_PRICE.annualPerMonth * ANNUAL_TERM_MONTHS;

/** The annual charge in cents, for the payment gateway and for `subscriptions.amount_cents`. */
export const ANNUAL_CHARGE_CENTS = ANNUAL_CHARGE * 100;

/**
 * What a member saves over a year by taking the annual plan instead of month-to-month: $600.
 * Derived for the same reason as the annual charge - it is quoted to prospects, so it must not
 * be able to disagree with the two rates it comes from.
 */
export const ANNUAL_SAVING_VS_MONTHLY =
  (MEMBERSHIP_PRICE.monthly - MEMBERSHIP_PRICE.annualPerMonth) * ANNUAL_TERM_MONTHS;

/**
 * Prices this business does NOT charge and must never quote, with why. The guard fails the
 * build if one of these is asserted as the membership price on any surface it checks.
 *
 * 4500 is not a stale price, it is a different billing model - the retired per-participant
 * bootcamp offer. `SELECT COUNT(*) FROM enrollments WHERE amount_paid = 4500` returns 0.
 * 1700 is the planning figure C10.2 exists to retire.
 */
export const NOT_THE_PRICE: ReadonlyArray<{ value: number; why: string }> = [
  { value: 4500, why: 'the retired per-participant offer; no enrollment has ever paid it' },
  { value: 1700, why: 'a planning figure that was never in the system; the annual charge is 1788' },
];
