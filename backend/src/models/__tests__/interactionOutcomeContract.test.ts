import { OUTCOME_TYPES, isOutcomeType, type OutcomeType } from '../InteractionOutcome';

/**
 * `interaction_outcomes.outcome` admits exactly the values production holds.
 *
 * ## Why this test exists
 *
 * Because the type and the table disagreed for seven months and nothing noticed. `no_answer`
 * was written 407 times across 379 leads between 2026-03-23 and 2026-08-24 — the fifth most
 * common value in the table — while `OutcomeType` said it could not exist. Three things had
 * to be true at once for that to stay invisible:
 *
 *   1. the column is a bare `STRING(30)` with no database enum, so Postgres accepted it;
 *   2. the one writer used `create(... as any)`, so TypeScript never saw it; and
 *   3. nothing enumerated the legal values at runtime, so no validator could have caught it.
 *
 * (3) is the gap this file closes. `tsc` now proves `OUTCOME_TYPES` and `OutcomeType` are the
 * same set, and these tests prove that set covers what production actually contains.
 *
 * ## Why the production values are written out rather than queried
 *
 * This suite is pure and must stay that way — a test that reads the production database
 * cannot run in CI, and one that reads a dev database proves nothing about production. So the
 * measured values are recorded here as a dated fact with their counts, which is a claim a
 * reader can check rather than a number they have to trust. If a new outcome starts being
 * written, this list is what has to be revisited.
 *
 * MEASURED read-only against production 2026-11-02, every row in `interaction_outcomes`:
 *   sent 48,924 · opened 13,892 · clicked 5,837 · bounced 440 · no_answer 407 ·
 *   voicemail 114 · replied 25 · answered 22 · booked_meeting 9 · unsubscribed 1
 * Ten distinct values, 69,671 rows. The last `sent` is dated 2026-08-21, which is its own
 * finding and not this file's business.
 */

/** Exactly the values present in production on 2026-11-02. Not the whole union. */
const PRESENT_IN_PRODUCTION: readonly string[] = [
  'sent',
  'opened',
  'clicked',
  'bounced',
  'no_answer',
  'voicemail',
  'replied',
  'answered',
  'booked_meeting',
  'unsubscribed',
];

/**
 * Values the union declares that no code in the tree writes. Kept deliberately — they are a
 * legitimate target vocabulary — but recorded so nobody reads their presence as evidence that
 * something produces them. `campaignAnalyticsService` computes `conversion_rate` from
 * `converted`, which means that metric cannot currently move off zero.
 */
const DECLARED_BUT_NEVER_WRITTEN: readonly string[] = [
  'converted',
  'no_response',
  'declined',
];

describe('the outcome vocabulary covers what production holds', () => {
  it('admits every value present in production', () => {
    const missing = PRESENT_IN_PRODUCTION.filter((v) => !isOutcomeType(v));
    expect(missing).toEqual([]);
  });

  it('admits no_answer specifically, which it did not until C8.4', () => {
    // Called out on its own because it is the regression this whole change is about: 407
    // rows the type forbade. A generic "all present values" assertion would still pass if
    // somebody removed this one and the production list was edited to match.
    expect(isOutcomeType('no_answer')).toBe(true);
    expect(OUTCOME_TYPES).toContain('no_answer');
  });

  it('accounts for every declared value as either observed or unwritten', () => {
    // No value may sit in the union unexplained. Either production has it, or it is on the
    // written-by-nothing list with a reason. This is what stops the union quietly accruing
    // aspirational members that readers mistake for live signals.
    const accounted = new Set([...PRESENT_IN_PRODUCTION, ...DECLARED_BUT_NEVER_WRITTEN]);
    const unexplained = OUTCOME_TYPES.filter((v) => !accounted.has(v));
    expect(unexplained).toEqual([]);
  });

  it('has no duplicates, so the set is the size it looks', () => {
    expect(new Set(OUTCOME_TYPES).size).toBe(OUTCOME_TYPES.length);
  });
});

describe('isOutcomeType', () => {
  it('rejects a plausible-looking value that is NOT in the vocabulary', () => {
    // NEGATIVE CONTROL. Without this, a guard that returned true for everything would
    // satisfy every assertion above.
    expect(isOutcomeType('no_anwser')).toBe(false); // transposed, as a typo would be
    expect(isOutcomeType('answered_call')).toBe(false);
    expect(isOutcomeType('SENT')).toBe(false); // the column is case-sensitive
    expect(isOutcomeType('')).toBe(false);
  });

  it('rejects non-strings without throwing', () => {
    expect(isOutcomeType(undefined)).toBe(false);
    expect(isOutcomeType(null)).toBe(false);
    expect(isOutcomeType(0)).toBe(false);
    expect(isOutcomeType({ outcome: 'sent' })).toBe(false);
    expect(isOutcomeType(['sent'])).toBe(false);
  });

  it('narrows the type, so a guarded value is usable as an OutcomeType', () => {
    const fromTheWire: unknown = 'voicemail';
    expect(isOutcomeType(fromTheWire)).toBe(true);
    if (isOutcomeType(fromTheWire)) {
      const narrowed: OutcomeType = fromTheWire;
      expect(narrowed).toBe('voicemail');
    }
  });
});

describe('the three outcomes the voice webhook can produce', () => {
  // synthflowWebhookController maps a Synthflow callback to one of exactly these. All three
  // must be legal, or the write fails at runtime having compiled cleanly — which is the
  // failure mode the `as any` removal is meant to make impossible.
  it.each(['answered', 'voicemail', 'no_answer'])('%s is a legal outcome', (value) => {
    expect(isOutcomeType(value)).toBe(true);
  });
});
