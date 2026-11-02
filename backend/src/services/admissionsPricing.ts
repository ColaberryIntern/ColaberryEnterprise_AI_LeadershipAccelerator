/**
 * What Maya (chat, voice, the briefing email) says the program costs: ONE sentence, from the figures below.
 *
 * The figures are no longer typed here. They come from membershipPrice.ts, the price of record, which checkout
 * reads too - so an admissions answer cannot drift from what the card is charged. This file still does not import
 * subscriptionService, and must not: billing reaches the email service through the enrollment service, and the
 * email service reads this file, so importing PLANS here would close a cycle. membershipPrice.ts is importable
 * precisely because it is a dependency-free leaf. A build guard (scripts/checkPriceAgreement.js) fails if this
 * file, checkout, the knowledge base or the forecast stop agreeing with it.
 *
 * Ali, 2026-10-23 (Campus round 3, ticket C22): quote $149/month billed annually, $199/month month-to-month, and that you can start
 * for $0 with no card. The retired $4,500 per-participant offer and the March 31, 2026 cohort date must not be quoted anywhere
 * (RETIRED_PRICE_PATTERNS below is what the knowledge seed uses to switch such rows off).
 *
 * HOW TO PITCH IT (Ali, 2026-10-24): "199 is not retired ... We want to push the yearly subscription more and 1st. Only if they push
 * back do you tell them about the month to month program." So a price answer leads with the annual membership ALONE
 * (membershipPitchSentence / membershipPitchLine); the month-to-month plan (monthToMonthSentence) is offered only when the person
 * pushes back on the price or the commitment, never in the same breath. The company knowledge base (frontend/public/knowledge,
 * served at /knowledge) says the same.
 *
 * Copy rule: never the word "free" (TWC 807.172(d)); "no card needed" instead.
 */
import { MEMBERSHIP_PRICE, ANNUAL_CHARGE, ANNUAL_SAVING_VS_MONTHLY } from './membershipPrice';

/** The rates Maya quotes, taken from the price of record. Nothing here is a typed price. */
export const MEMBERSHIP = {
  annualPerMonth: MEMBERSHIP_PRICE.annualPerMonth,
  annualPerYear: ANNUAL_CHARGE,
  monthly: MEMBERSHIP_PRICE.monthly,
} as const;

const usd = (n: number): string => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** The price answer: the annual membership alone (the founding rate), and starting for $0. */
export function membershipPitchSentence(): string {
  return `Membership is ${usd(MEMBERSHIP.annualPerMonth)} per month billed annually (${usd(MEMBERSHIP.annualPerYear)} a year). That is the founding rate, `
    + 'our best value, and it stays locked for as long as your membership is active. You can start for $0, no card needed.';
}

/** Only on pushback (the price, the commitment, "is there a monthly option?"): the month-to-month plan. */
export function monthToMonthSentence(): string {
  return `If a year is more commitment than you want right now, there is also a month-to-month plan at ${usd(MEMBERSHIP.monthly)} per month, `
    + `cancel anytime. Same full membership; the annual plan saves ${usd(ANNUAL_SAVING_VS_MONTHLY)} a year.`;
}

/** Short form for a one-line fact (email highlight box): the annual membership only. */
export function membershipPitchLine(): string {
  return `${usd(MEMBERSHIP.annualPerMonth)}/month billed annually (founding rate); start for $0, no card needed`;
}

/** The rule as one instruction, for a prompt (Maya's voice agent). */
export function pricingPitchRule(): string {
  return `Price: lead with ${usd(MEMBERSHIP.annualPerMonth)} a month billed annually, the founding rate (say "one forty-nine a month, billed annually"), `
    + 'and that they can start for $0 with no card. Do NOT mention the month-to-month plan unless they push back on the price or the '
    + `commitment, or ask for a monthly option; only then offer ${usd(MEMBERSHIP.monthly)} a month month-to-month, cancel anytime (say "one ninety-nine `
    + 'month-to-month"). Never give both prices in the same breath.';
}

/** Facts that are retired and must never be quoted: the old $4,500 offer and the past March 31, 2026 cohort. */
export const RETIRED_PRICE_PATTERNS: RegExp[] = [/\$\s?4,?500\b/, /\b4,?500 (per|a) (participant|seat)/i, /March 31(, 2026)?/i];

export function quotesRetiredFact(text: string): boolean {
  return RETIRED_PRICE_PATTERNS.some((re) => re.test(text));
}
