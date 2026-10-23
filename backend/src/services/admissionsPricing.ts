/**
 * What Maya (chat, voice, the briefing email) says the program costs: ONE sentence, from the figures below. They MUST equal the
 * billing plans (subscriptionService PLANS); a contract test fails the build if they differ, so an admissions answer can never
 * drift from what checkout charges. (Kept as a leaf module rather than importing PLANS: billing reaches the email service through
 * the enrollment service, and the email service reads this file.)
 *
 * Ali, 2026-10-23 (Campus round 3, ticket C22): quote $149/month billed annually, $199/month month-to-month, and that you can start
 * for $0 with no card. The retired $4,500 per-participant offer and the March 31, 2026 cohort date must not be quoted anywhere
 * (RETIRED_PRICE_PATTERNS below is what the knowledge seed uses to switch such rows off).
 *
 * Copy rule: never the word "free" (TWC 807.172(d)); "no card needed" instead.
 */
export const MEMBERSHIP = { annualPerMonth: 149, annualPerYear: 1788, monthly: 199 } as const;

const usd = (n: number): string => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export function membershipPriceSentence(): string {
  return `Membership is ${usd(MEMBERSHIP.annualPerMonth)} per month billed annually (${usd(MEMBERSHIP.annualPerYear)} a year), or ${usd(MEMBERSHIP.monthly)} per month month-to-month, `
    + 'cancel anytime. You can start for $0, no card needed.';
}

/** Short form for a one-line fact (voice prompt, email highlight box). */
export function membershipPriceLine(): string {
  return `${usd(MEMBERSHIP.annualPerMonth)}/month billed annually, or ${usd(MEMBERSHIP.monthly)}/month month-to-month; start for $0, no card needed`;
}

/** Facts that are retired and must never be quoted: the old $4,500 offer and the past March 31, 2026 cohort. */
export const RETIRED_PRICE_PATTERNS: RegExp[] = [/\$\s?4,?500\b/, /\b4,?500 (per|a) (participant|seat)/i, /March 31(, 2026)?/i];

export function quotesRetiredFact(text: string): boolean {
  return RETIRED_PRICE_PATTERNS.some((re) => re.test(text));
}
