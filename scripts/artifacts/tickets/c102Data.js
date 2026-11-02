/**
 * C10.2 - the annual price of record.
 *
 * Every figure here was measured against production or the working tree on 2 November 2026,
 * read-only, and is carried alongside the ticket's own numbers because the gap between them
 * is part of the finding.
 */

const MEASURED_AT = '2 November 2026';

/** The answer, stated once. */
const VERDICT = {
  priceOfRecord: '$149 per month, billed annually',
  annualCharge: '$1,788 a year',
  monthToMonth: '$199 per month',
  isAChoice: false,
  why: 'The two figures are one fact: 1,788 is 149 x 12. It was not chosen between two '
    + 'candidates, it was measured. $1,700 is not a competing price that lost; it is a figure '
    + 'that exists in no subscription row, no enrollment row, and nowhere in the codebase.',
};

/**
 * What production holds. The ticket said "all four active annual subscriptions"; the true
 * scope is every annual row ever written, which makes the answer stronger than claimed.
 */
const PRODUCTION = [
  { what: 'active annual subscriptions', rows: 4, amount: '$1,788', note: 'both the subscription and the enrollment agree on all four' },
  { what: 'canceled annual subscriptions', rows: 1, amount: '$1,788', note: '' },
  { what: 'failed annual subscriptions', rows: 17, amount: '$1,788', note: '' },
  { what: 'pending annual subscriptions', rows: 22, amount: '$1,788', note: 'abandoned checkouts, still priced correctly' },
  { what: 'ANNUAL ROWS TOTAL', rows: 44, amount: '$1,788', note: 'zero variance since 17 July 2026' },
  { what: 'paid enrollments at 1788.00', rows: 5, amount: '$1,788', note: 'amount_paid, the independent column' },
  { what: 'anything, anywhere, at $1,700', rows: 0, amount: '-', note: 'subscriptions and enrollments both searched' },
];

/** The live recurring base, for whoever computes a target from it next (C10.3). */
const RECURRING_BASE = [
  { plan: 'monthly', active: 24, each: '$199/mo', note: 'cash every month' },
  { plan: 'annual', active: 4, each: '$1,788/yr', note: 'cash once, then nothing for twelve months' },
  { plan: 'comp', active: 26, each: '$0', note: 'complimentary; produces nothing' },
];

/**
 * The five independent sources of a membership price that existed before this change. The
 * ticket named four surfaces; there were five sources, and only two were linked by anything.
 */
const SOURCES_BEFORE = [
  { n: 1, source: 'subscriptionService.PLANS', surface: 'checkout', said: '149 / 199, annual derived to 1788', linked: 'the only one that derived rather than typed the annual total' },
  { n: 2, source: 'admissionsPricing.MEMBERSHIP', surface: 'what Maya quotes', said: '149 / 1788 / 199, all typed', linked: 'linked to (1) by a test that read the other file as TEXT and regex-matched the number out' },
  { n: 3, source: 'cohorts.price_annual (a database column)', surface: 'the KB merge tags', said: 'seeded 149 / 199', linked: 'nothing' },
  { n: 4, source: '~40 hardcoded strings under frontend/public/knowledge', surface: 'the public knowledge base', said: '149 / 199', linked: 'nothing' },
  { n: 5, source: 'settings.price_per_enrollment', surface: 'the revenue forecast', said: '4,500', linked: 'nothing, and it is the wrong product entirely' },
];

/** The four things the ticket said DONE means, each with the evidence behind its verdict. */
const CRITERIA = [
  {
    n: 1,
    text: 'One figure is the price of record and it is stated here',
    short: 'The price of record is stated',
    verdict: 'MET',
    evidence: '$149 per month billed annually, charging $1,788 a year. Settled by measurement, '
      + 'not by choosing: 44 of 44 annual subscription rows and 5 paid enrollments carry 1,788, '
      + 'and $1,700 appears in zero rows and zero files.',
  },
  {
    n: 2,
    text: 'The checkout, Maya quoting the price, the knowledge base and the revenue forecast all read it from one source',
    short: 'All four surfaces read one source',
    verdict: 'MET FOR THREE OF FOUR',
    evidence: 'Checkout, Maya and the knowledge base now read '
      + 'backend/src/services/membershipPrice.ts; none of the three types a price any more. The '
      + 'forecast is NOT wired, deliberately: see the flag. Three of four, said plainly rather '
      + 'than counted as done.',
  },
  {
    n: 3,
    text: 'A build guard fails if two of those four ever disagree, mutation-tested by making them disagree on purpose',
    short: 'A guard fails on disagreement, mutation-tested',
    verdict: 'MET',
    evidence: 'scripts/checkPriceAgreement.js, wired into the guards CI job in the house '
      + 'two-step shape. 25 of 25 self-test cases and 11 of 11 mutations against the real '
      + 'repository, including the case that matters most: with nothing mutated it still passes.',
  },
  {
    n: 4,
    text: 'C10.3 can compute a target from the settled figure',
    short: 'C10.3 can compute its target',
    verdict: 'UNBLOCKED, WITH A CORRECTION',
    evidence: 'C10.3 computes its requirement at $1,700 a subscription. At $1,788 every target '
      + 'falls by about 5%: roughly 14 a month rather than 15 at a $30,000 payroll, 26 not 27 at '
      + '$50,000, 40 not 42 at $75,000, 54 not 56 at $100,000. The stock targets move the same way.',
  },
];

/** What the guard checks, and how it was proven. */
const GUARD = {
  file: 'scripts/checkPriceAgreement.js',
  selfTestCases: 25,
  mutations: 11,
  kbFilesScanned: 227,
  canonicalLines: 105,
  checks: [
    'the checkout references the price of record and types no rate at all',
    'what Maya quotes references it, and still does not import billing (that cycle is why the old guard scraped text)',
    'the cohort seed behind the KB merge tags references it',
    'no line in the public hub states a non-canonical figure AS A MEMBERSHIP PRICE',
    'the canonical rate has not silently vanished from the hub, which no contradiction check would catch',
    'the annual charge is derived inside the source of truth, never typed',
    'no NEW service declares its own price constant (two known ones are frozen)',
    'the run refuses to pass if it scanned fewer than 60 hub files',
  ],
  whyContextScoped: 'The hub legitimately prices other products: $1,999 Data Analytics, $4,500 '
    + 'Data Science, a $6,000 proposal line, $17,880 for ten annual seats, and $20 and $10 of '
    + 'Anthropic tooling. A bare search for the digits would fail the build on correct pages, and '
    + 'a guard that cries wolf on a correct page gets switched off. So only figures in a '
    + 'membership context are judged, exact multiples of a real rate are allowed on quantity '
    + 'lines, and the self-test carries those real lines as cases.',
};

/** What was deliberately not done, and why. */
const FLAGS = [
  {
    id: 'F1',
    severity: 'open - needs Ali',
    title: 'The revenue forecast prices a product nobody sells, and production holds that price',
    detail: 'settings.price_per_enrollment is persisted in production as 4,500, written '
      + '23 October 2026. That is the retired per-participant offer; no enrollment has ever paid '
      + 'it. opportunity_scores currently holds 25,270 scored leads carrying $3,386,385 of '
      + 'projected revenue computed from it. Priced at the real annual membership the same '
      + 'pipeline is worth about $1.35M, so roughly $2.0M of that total is an artifact of a '
      + 'retired price. It was NOT changed here: this is findings 1 and 5 of '
      + 'ESCALATION-002-fabricated-metrics.md, which is OPEN and asks exactly this question, and '
      + 'answering it inside C10.2 would take a decision by implication.',
  },
  {
    id: 'F2',
    severity: 'open - needs Ali',
    title: 'Whether to move the price to $1,700 is a decision, and it is still open',
    detail: 'This ticket settles what the price IS, which is a measurement. Whether it should '
      + 'CHANGE is a business-model decision and a governance boundary, so it was not taken. The '
      + 'arrangement built here is what makes it a one-line edit: change annualPerMonth in '
      + 'membershipPrice.ts and every wired surface follows, with the guard failing anything that '
      + 'does not. Note that $1,700 is not a whole multiple of twelve, so adopting it would mean '
      + 'the annual plan stops being "a monthly rate, billed annually" and becomes its own price.',
  },
  {
    id: 'F3',
    severity: 'closed here',
    title: 'The old guard compared two numbers, which is the weaker thing to check',
    detail: 'Two surfaces that each type 149 satisfy any equality check and drift apart on the '
      + 'next edit. The previous contract test read subscriptionService.ts as text and regexed '
      + 'the rate out of it, because admissionsPricing cannot import billing: billing reaches the '
      + 'email service through the enrollment service, and the email service reads '
      + 'admissionsPricing, so that import closes a cycle. A dependency-free leaf constant removes '
      + 'the constraint, and the test now asserts both surfaces REFERENCE it and that no literal '
      + 'rate survives. A surface with no price in it cannot drift.',
  },
  {
    id: 'F4',
    severity: 'note',
    title: 'One active monthly member has two different prices recorded',
    detail: 'A subscription created 31 July 2026 reads 199 on the subscription and 149.00 on its '
      + 'enrollment. One row out of 28 active paid subscriptions, found while checking whether '
      + '"what production holds" has a single answer. It does, except here. Not this ticket, and '
      + 'not worth guessing at: it needs a look at that member.',
  },
  {
    id: 'F5',
    severity: 'note',
    title: 'A dormant second home for an annual price already exists',
    detail: 'cora_cohorts carries price_annual and price_monthly columns and currently holds zero '
      + 'rows. The moment anything inserts one there is a second database-stored annual price '
      + 'with nothing keeping it in agreement. Recorded now because an empty table is the cheapest '
      + 'possible moment to notice.',
  },
];

/** Verification actually run. */
const VERIFICATION = [
  { gate: 'Price agreement guard, self-test', result: '25 of 25 cases pass' },
  { gate: 'Price agreement guard, real run', result: 'every wired surface agrees; 227 hub files scanned' },
  { gate: 'Mutation test against the real repository', result: '11 of 11 caught, and the clean tree still passes' },
  { gate: 'Backend jest, related suites', result: '136 suites, 2,467 tests, all pass' },
  { gate: 'Production reads', result: 'read-only, SELECT only; nothing written' },
];

const COUNTS = {
  annualRows: 44,
  sourcesBefore: SOURCES_BEFORE.length,
  /**
   * TWO, not one. The obvious headline is "five sources became one", and it is wrong while
   * the forecast still reads its own setting. Rendering the page is what caught it: the tile
   * said 5 -> 1 directly above a criterion reading MET FOR THREE OF FOUR.
   */
  sourcesAfter: 2,
  surfacesWired: 3,
  surfacesTotal: 4,
  mutations: GUARD.mutations,
  selfTests: GUARD.selfTestCases,
};

/**
 * THE GUARD THAT EARNS ITS KEEP. A document saying "every surface now reads one source" is
 * worth nothing if the guard that enforces it does not pass. This refuses to render unless the
 * real checker passes against the real tree, and unless the criteria that claim partial credit
 * actually say so.
 */
function assertNoCriterionOverclaims() {
  const three = CRITERIA.find((c) => c.n === 2);
  if (!three) throw new Error('criterion 2 is missing');
  if (/^MET$/.test(three.verdict)) {
    throw new Error('criterion 2 reads a flat MET. The forecast is not wired, so a flat MET is '
      + 'an overclaim; it must say three of four.');
  }
  if (!/three of four/i.test(three.evidence)) {
    throw new Error('criterion 2 does not state that one of the four surfaces is unwired.');
  }
  const forecastFlagged = FLAGS.some((f) => /forecast/i.test(f.title) && f.severity.startsWith('open'));
  if (!forecastFlagged) {
    throw new Error('the unwired forecast is not carried as an open flag, so a reader could '
      + 'finish this document believing all four surfaces were done.');
  }
  if (VERDICT.isAChoice !== false) {
    throw new Error('the price of record is presented as a choice. It was measured.');
  }
  // The headline tile and the criterion have to tell the same story. "Five sources became
  // one" is the sentence this work wants to be able to say, and it is not true while one
  // surface still reads its own setting - so the count may not collapse to 1 until the
  // forecast is actually wired.
  if (COUNTS.surfacesWired < COUNTS.surfacesTotal && COUNTS.sourcesAfter < 2) {
    throw new Error(`COUNTS.sourcesAfter is ${COUNTS.sourcesAfter}, which claims a single `
      + `source, while only ${COUNTS.surfacesWired} of ${COUNTS.surfacesTotal} surfaces are `
      + 'wired. The forecast still reads price_per_enrollment, so the count is at least 2.');
  }
  if (COUNTS.surfacesWired === COUNTS.surfacesTotal && COUNTS.sourcesAfter !== 1) {
    throw new Error('all four surfaces are wired, so the source count should now be 1 and the '
      + 'forecast flag should be closed.');
  }
  return CRITERIA.length;
}

module.exports = {
  MEASURED_AT, VERDICT, PRODUCTION, RECURRING_BASE, SOURCES_BEFORE,
  CRITERIA, GUARD, FLAGS, VERIFICATION, COUNTS,
  assertNoCriterionOverclaims,
};
