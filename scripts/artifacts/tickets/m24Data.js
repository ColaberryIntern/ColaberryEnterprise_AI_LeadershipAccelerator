/**
 * M24 data module. Measurements and decisions only: no rendering, no I/O.
 *
 * The verdict counts here are the ones the contract document states, and the build script
 * re-derives them from INPUTS before drawing anything. That check exists because the first draft
 * of the contract said "eight of the thirteen inputs are safe" while its own table held seven.
 * Nothing caught it, so the binding test now compares the headline to the table, and this module
 * is the second place the same arithmetic has to hold.
 */

const MEASURED_ON = '17 Oct 2026';
const CODE = 'M24';
const SLUG = 'M24_SRS_INPUT_CONTRACT';
const TITLE = 'SRS input contract: is Person 360 trustworthy enough to score?';

const VERDICT = 'NO, not today.';

const TAKEAWAY = 'Seven of the thirteen inputs the Sales Readiness Score needs are safe and '
  + 'already handle absence correctly. The score cannot be built as specified because its entire '
  + 'passive-browsing component is unusable: both inputs that would feed it report 0 for a person '
  + 'we have no evidence about, so an untracked stranger is indistinguishable from a tracked '
  + 'visitor who never came back. That is the one thing this ticket forbids. Three small local '
  + 'fixes and one decision of yours stand between here and yes.';

const ASKED = 'prove Person 360 is trustworthy enough to be the Sales Readiness Score input, '
  + 'input by input, bound to the real evidence groups, ending in a yes or no.';
const DELIVERED = 'Part 6 of the contract binds 13 inputs to their evidence groups with their '
  + 'absence behavior, Part 7 gives the call, and a binding test fails when an input loses its '
  + 'evidence group.';

/** The 13 inputs, from DECISION 3, 4 and 5 of the contract. M = measured, D = derived. */
const INPUTS = [
  { component: 'Tenure', group: 'journey', field: 'daysKnown', md: 'D', absence: 'null, never 0', verdict: 'SAFE' },
  { component: 'Intent', group: 'journey', field: 'intentScore', md: 'M', absence: 'null when withheld or unknown', verdict: 'SAFE' },
  { component: 'Commitment: human reply', group: 'communications', field: 'inboundCount', md: 'M', absence: 'panel null; cap admitted by truncated', verdict: 'SAFE' },
  { component: 'Friction: payment failure', group: 'billingDetail', field: 'failuresSinceLastSuccess', md: 'D', absence: 'panel null when no enrollment', verdict: 'SAFE' },
  { component: 'Prior outcome', group: 'history', field: 'available + reason', md: 'M', absence: 'first-class availability flag, with a reason', verdict: 'SAFE' },
  { component: 'Explorer bands', group: 'explorerScore', field: 'engagement/intent/fit', md: 'M', absence: 'whole panel null, never 0/0/0', verdict: 'SAFE' },
  { component: 'Consent', group: 'acquisition', field: 'consentContact', md: 'M', absence: 'null separates never-recorded from refused', verdict: 'SAFE' },
  { component: 'Passive: site sessions', group: 'engagement', field: 'sessions', md: 'M', absence: 'reads 0 for a person never tracked', verdict: 'EXCLUDED' },
  { component: 'Passive: page events', group: 'journey', field: 'pageEvents + 3 more', md: 'M', absence: 'read 0 for anyone with no lead row', verdict: 'EXCLUDED' },
  { component: 'Commitment: enrollment', group: 'journey', field: 'enrollments', md: 'D', absence: 'counts only ids the caller may see', verdict: 'EXCLUDED' },
  { component: 'Commitment: appointment', group: 'appointments', field: 'rows', md: 'M', absence: '[] substituted when there was no key', verdict: 'EXCLUDED' },
  { component: 'Prior outcome detail', group: 'history', field: 'everHired, fees', md: 'M', absence: 'a NULL column reads false; null fees sum to 0', verdict: 'EXCLUDED' },
  { component: 'Recency', group: 'journey', field: 'lastActivity', md: 'D', absence: 'section-filtered per caller; the 150-row cap does NOT affect it', verdict: 'EXCLUDED' },
];

const COUNTS = {
  inputs: INPUTS.length,
  safe: INPUTS.filter((i) => i.verdict === 'SAFE').length,
  excluded: INPUTS.filter((i) => i.verdict === 'EXCLUDED').length,
  evidenceGroups: 22,
};

/** The two defects, both read out of the source rather than taken from a survey. */
const DEFECTS = [
  {
    id: 'A',
    title: 'engagement reads an untracked person as a tracked one with zero sessions',
    cite: 'personProfileService.ts:352',
    detail: 'The query is a bare aggregate with no GROUP BY, so it returns exactly one row even '
      + 'when its joins match nothing. The null-guard immediately below it is therefore dead '
      + 'code, and a person with no visitor record receives {sessions: 0, firstSeen: null, '
      + 'lastSeen: null, sites: []}.',
    aggravation: 'This is also the only group anchored in the registry by a bare table name '
      + 'rather than a call site, and the only one with no behavioural test of its contents.',
  },
  {
    id: 'B',
    title: 'journeyPanel breaks a promise its own docblock makes',
    cite: 'journeyPanel.ts:10 and :91',
    detail: 'The file states "A count we cannot compute is null rather than 0". Four lines below, '
      + 'six counts are coerced with ?? 0, and the query is skipped entirely when there are no '
      + 'lead ids. Only daysKnown and intentScore honour the rule.',
    aggravation: 'These are the counts that lie about exactly the rows M22 has not yet '
      + 'classified, which is why the population decision and this defect compound.',
  },
];

/** How the binding test was proved, against the real registry rather than only a fixture. */
const MUTATION = {
  what: "deleted engagement: 'visitor_sessions', from the real evidenceRegistry.test.ts",
  result: 'the contract test failed naming "engagement", and the size assertion fell 22 to 21',
  restore: 'restored from a copy and proved byte-identical with cmp',
  synthetic: 6,
  total: 14,
};

/** Four things between here and yes, in order. Three are code, one is Ali's. */
const TO_YES = [
  { n: 1, what: 'engagement returns null when there is no visitor record', who: 'code', size: 'small, local' },
  { n: 2, what: 'the journey counts honour their own docblock: null, not 0', who: 'code', size: 'small, local' },
  { n: 3, what: 'journey.enrollments and the appointments [] substitution stop writing a permission or key state into a value slot', who: 'code', size: 'small, local' },
  { n: 4, what: 'decide M22: the 37 ambiguous rows are in the scored population or they are not', who: 'Ali', size: 'a decision, not a fix' },
];

const BLOCKERS = [
  { ticket: 'M20', state: 'open', effect: 'The flake is in the suites guarding these inputs. It lowers the weight of their verdicts until a red run is known to mean a real failure. It does not make any input wrong.' },
  { ticket: 'M22', state: 'open', effect: 'Population, not correctness. Until the 37 ambiguous rows are resolved or parked, who gets scored is a default rather than a decision.' },
];

const PROCEEDS = 'M25 may start against the seven safe inputs. Its own criteria are about '
  + 'determinism, attribution and absence handling rather than about every component being '
  + 'populated, and a passive-browsing component declared and left unpopulated, with its reason '
  + 'recorded, is consistent with this contract. One fed from the two inputs above is not.';

const NOT_ESTABLISHED = [
  'That the SQL behind any evidence group parses. Every behavioural test in the package mocks '
    + 'sequelize.query, so none of them would notice. Marked UNVERIFIED in the contract.',
  'That the weights are right. Part 5 of the contract still refuses to propose any, and '
    + 'DECISION 2 keeps them provisional.',
  'That the seven safe inputs are sufficient to rank well. Only M25\'s distribution run can '
    + 'show that.',
  'It does not revisit DECISION 6\'s dependency on the suppression gap, which remains Phase 4\'s.',
];

module.exports = {
  MEASURED_ON, CODE, SLUG, TITLE, VERDICT, TAKEAWAY, ASKED, DELIVERED,
  INPUTS, COUNTS, DEFECTS, MUTATION, TO_YES, BLOCKERS, PROCEEDS, NOT_ESTABLISHED,
};
