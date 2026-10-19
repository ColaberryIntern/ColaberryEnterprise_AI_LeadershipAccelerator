/**
 * M27 data module. Score freshness, and the correction to the recency claim that came with it.
 */

const MEASURED_ON = '18 Oct 2026';
const CODE = 'M27';
const SLUG = 'M27_SCORE_FRESHNESS';
const TITLE = 'Score freshness: say when it was computed, and from what';
const TICKET = 10411539598;

const TAKEAWAY = 'A score computed a minute ago over week-old evidence is not fresh. If freshness '
  + 'came from the computation alone, re-running the batch would make every score look current '
  + 'without one new fact entering the system. So the effective as-of is the OLDER of the '
  + 'computation and the oldest dated evidence: recomputation cannot buy freshness.';

const ASKED = 'every score carries an as-of time, a stale score is labeled rather than hidden, '
  + 'and the boundary cases are tested.';
const DELIVERED = 'all three, plus the evidence date threaded onto the score so a surface can '
  + 'judge it without reassembling inputs it no longer has.';

/** The four states. "unknown" is the one most designs leave out. */
const STATES = [
  { state: 'fresh', when: 'under 24h old', shown: 'the as-of date', rank: 'rank on it' },
  { state: 'aging', when: '24h to 72h', shown: 'the age and what bound it', rank: 'ordering is softening' },
  { state: 'stale', when: 'over 72h', shown: 'the age, loudly', rank: 'do NOT rank on it' },
  { state: 'unknown', when: 'the date will not parse', shown: 'that the age is unknown', rank: 'not claimed to be current' },
];

/** What bounds the as-of, and why the older one wins. */
const BINDING = [
  ['computation', 'the evidence is newer than the computation, or nothing dated itself'],
  ['evidence', 'the evidence is OLDER than the computation, which is the case that matters'],
];

/** Each rule was broken on purpose and a named test had to notice. */
const MUTANTS = [
  { mutation: 'the evidence bound removed, so recomputation buys freshness', killed: 'is bound by the EVIDENCE when the evidence is older than the computation' },
  { mutation: 'the fresh boundary slipped from < to <=', killed: 'is fresh just under 24h and aging exactly at it' },
  { mutation: 'the negative-age clamp removed', killed: 'surfaces clock skew instead of silently clamping it away' },
  { mutation: 'the stale label stripped of its instruction', killed: 'says plainly not to rank on it, which is the actionable half' },
];

/**
 * THE CORRECTION. M24's contract gave two reasons for excluding recency and only one held.
 * Kept here rather than quietly dropped, because the artifacts already on the ticket carry it.
 */
const CORRECTION = {
  claimed: 'Recency is excluded because `lastActivity` comes from a timeline capped at 150 with '
    + 'no truncation flag, AND because it is section-filtered per caller.',
  wrong: 'The cap cannot affect that field. `getPersonTimeline` assembles with '
    + 'ORDER BY max(occurred_at) DESC and applies the limit afterwards, so the cap truncates the '
    + 'TAIL and timeline[0] is always the newest permitted event.',
  why: 'The cap genuinely does break a COUNT taken from the timeline, which is why journeyPanel '
    + 'takes its counts from the source tables and says so in its own docblock. That is the claim '
    + 'the contract borrowed without checking whether a MAX behaves like a count. It does not.',
  stands: 'The per-caller domain filter is the whole of the defect, and it is enough on its own: '
    + 'two callers with different sections read a different last activity for the same person, '
    + 'and DECISION 5 makes recency a per-component decay, so an input that varies by viewer is a '
    + 'determinism problem. Recency stays EXCLUDED.',
};

const VERIFICATION = [
  ['srsFreshness.test.ts', '17 tests'],
  ['the salesReadiness module', '71 passed, 71 total'],
  ['adminOs + salesReadiness together', '417 passed across 25 suites'],
  ['mutation', '4 mutants, each killing a named test, restores cmp-identical'],
  ['scoped tsc, real test-program options', 'exit 0, run before pushing'],
  ['the M24 binding test after the contract edit', '14 passed'],
  ['citation gate', 'citations OK, no drift'],
];

const THRESHOLDS = { fresh: 24, aging: 72 };

const NOT_ESTABLISHED = [
  'That 24h and 72h are the right thresholds. Nothing has measured how fast this evidence '
    + 'actually decays, so they are provisional like the weights and versioned with the ruleset.',
  'That freshness makes the score rank. It does not: M25 found the ruleset cannot order this '
    + 'population, and a fresh score that cannot rank is still a score that cannot rank.',
  'It does not surface anything. No UI reads this yet; M26 is the surface.',
];

module.exports = {
  MEASURED_ON, CODE, SLUG, TITLE, TICKET, TAKEAWAY, ASKED, DELIVERED,
  STATES, BINDING, MUTANTS, CORRECTION, VERIFICATION, THRESHOLDS, NOT_ESTABLISHED,
};
