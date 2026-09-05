import { LIFECYCLE, LIFECYCLE_STAGES } from '../lifecycle';
import {
  RESOLUTION_UNLOCKS,
  ResolutionOutcome,
  mayJoin,
  needsHumanReview,
  normalizeEmail,
  resolveByEmail,
  summariseCoverage,
} from '../identityResolution';

/** A lookup backed by a fixed table, standing in for the leads index. */
const lookupFrom = (table: Record<string, string[]>) => (email: string) => table[email] ?? [];

describe('normalizeEmail', () => {
  it('folds case and trims whitespace', () => {
    // Load-bearing, not cosmetic: enrollments holds exactly one email that
    // differs from another only by case. Matching on the raw string would split
    // that person into two.
    expect(normalizeEmail('  Ali@Colaberry.COM ')).toBe('ali@colaberry.com');
    expect(normalizeEmail('ali@colaberry.com')).toBe('ali@colaberry.com');
  });

  it('rejects anything that cannot serve as an identity key', () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail('not-an-email')).toBeNull();
  });

  it('does NOT strip dots or plus-addressing', () => {
    // Those rules merge genuinely different mailboxes at some providers, and
    // merging is the irreversible direction. Deliberately left alone.
    expect(normalizeEmail('a.b@example.com')).toBe('a.b@example.com');
    expect(normalizeEmail('ali+news@colaberry.com')).toBe('ali+news@colaberry.com');
    expect(normalizeEmail('a.b@example.com')).not.toBe(normalizeEmail('ab@example.com'));
  });
});

describe('resolveByEmail', () => {
  it('resolves a single candidate', () => {
    const outcome = resolveByEmail('ali@colaberry.com', lookupFrom({ 'ali@colaberry.com': ['lead-1'] }));
    expect(outcome.status).toBe('resolved');
    expect(outcome.personRef).toBe('lead-1');
    expect(mayJoin(outcome)).toBe(true);
    expect(needsHumanReview(outcome)).toBe(false);
  });

  it('resolves through normalisation, not around it', () => {
    const outcome = resolveByEmail(' ALI@Colaberry.com ', lookupFrom({ 'ali@colaberry.com': ['lead-1'] }));
    expect(outcome.status).toBe('resolved');
    expect(outcome.personRef).toBe('lead-1');
  });

  // ── The rule the whole module exists for ──────────────────────────────────

  it('REFUSES to merge when more than one candidate matches', () => {
    const outcome = resolveByEmail(
      'shared@example.com',
      lookupFrom({ 'shared@example.com': ['lead-1', 'lead-2'] }),
    );
    expect(outcome.status).toBe('ambiguous');
    expect(mayJoin(outcome)).toBe(false);
    expect(needsHumanReview(outcome)).toBe(true);
  });

  it('never names a person on an ambiguous outcome', () => {
    // The dangerous shape is a caller reading personRef without checking status.
    // Leaving it undefined means that mistake fails loudly instead of silently
    // joining two people who cannot be separated again.
    const outcome = resolveByEmail(
      'shared@example.com',
      lookupFrom({ 'shared@example.com': ['lead-1', 'lead-2'] }),
    );
    expect(outcome.personRef).toBeUndefined();
  });

  it('shows the reviewer every candidate it considered', () => {
    const outcome = resolveByEmail(
      'shared@example.com',
      lookupFrom({ 'shared@example.com': ['lead-1', 'lead-2', 'lead-3'] }),
    );
    expect(outcome.candidates.map((c) => c.candidateId)).toEqual(['lead-1', 'lead-2', 'lead-3']);
    expect(outcome.reason).toContain('3');
  });

  it('treats no candidate as a capture gap, not an error and not a merge', () => {
    // 86 enrolments are in this state on production. None can be resolved by any
    // available rule — phone is absent for all 86 and no name matches exactly
    // one lead — so this must not raise, and must not guess.
    const outcome = resolveByEmail('nobody@example.com', lookupFrom({}));
    expect(outcome.status).toBe('no_candidate');
    expect(outcome.personRef).toBeUndefined();
    expect(mayJoin(outcome)).toBe(false);
    expect(outcome.reason).toMatch(/capture gap/i);
  });

  it('does not queue the unresolvable for human review', () => {
    // Routing all 86 to a reviewer builds a queue of items nobody can action.
    // They are reported as coverage instead.
    const outcome = resolveByEmail('nobody@example.com', lookupFrom({}));
    expect(needsHumanReview(outcome)).toBe(false);
  });

  it('marks a record with no email unidentifiable rather than unresolved', () => {
    // Different problems: 'no_candidate' means we looked and found nothing;
    // 'unidentifiable' means there was nothing to look with.
    for (const bad of [null, undefined, '', '   ', 'no-at-sign']) {
      const outcome = resolveByEmail(bad, lookupFrom({ 'x@y.com': ['lead-1'] }));
      expect(outcome.status).toBe('unidentifiable');
      expect(mayJoin(outcome)).toBe(false);
    }
  });

  it('never joins on anything except an exact email match', () => {
    // Phone and name were measured and rejected: 0 of 86 unmatched enrolments
    // carry a usable phone, and 0 match exactly one lead by name. Any candidate
    // that reaches a join must therefore be an exact_email one.
    const outcome = resolveByEmail('ali@colaberry.com', lookupFrom({ 'ali@colaberry.com': ['lead-1'] }));
    expect(outcome.candidates.every((c) => c.method === 'exact_email')).toBe(true);
  });
});

describe('summariseCoverage', () => {
  const make = (status: ResolutionOutcome['status']): ResolutionOutcome => ({
    status,
    candidates: [],
    reason: '',
    needsReview: status === 'ambiguous',
  });

  it('counts every status without losing any', () => {
    const report = summariseCoverage([
      make('resolved'), make('resolved'), make('resolved'),
      make('ambiguous'),
      make('no_candidate'), make('no_candidate'),
      make('unidentifiable'),
    ]);
    expect(report.total).toBe(7);
    expect(report.resolved + report.ambiguous + report.noCandidate + report.unidentifiable)
      .toBe(report.total);
  });

  it('computes coverage against the whole population, not just the matched', () => {
    const report = summariseCoverage([make('resolved'), make('no_candidate')]);
    expect(report.coverageRate).toBe(0.5);
  });

  it('reports null rather than zero for an empty population', () => {
    // 0% reads as total failure; null says there was nothing to measure. This is
    // the same substitution the metric registry exists to prevent.
    const report = summariseCoverage([]);
    expect(report.coverageRate).toBeNull();
    expect(report.coverageRate).not.toBe(0);
  });

  it('reproduces the measured production shape', () => {
    // 431 resolved of 517, the figure measured on 2026-09-05. Pinning it means a
    // change to the counting rules shows up as a number nobody recognises.
    const outcomes = [
      ...Array.from({ length: 431 }, () => make('resolved')),
      ...Array.from({ length: 86 }, () => make('no_candidate')),
    ];
    const report = summariseCoverage(outcomes);
    expect(report.total).toBe(517);
    expect(report.coverageRate).toBeCloseTo(0.834, 3);
  });
});

describe('resolution and the lifecycle', () => {
  it('only claims to unlock stages the lifecycle actually knows', () => {
    for (const stage of RESOLUTION_UNLOCKS) {
      expect(LIFECYCLE_STAGES).toContain(stage);
    }
  });

  it('unlocks exactly the stages blocked by the enrolment join gap', () => {
    // Those stages are marked joinable_today: false BECAUSE enrollments has no
    // person key. Resolution is what removes that specific blocker, so the two
    // lists must agree — if they drift, either a stage silently stays blocked
    // after resolution or one claims to be unblocked that never was.
    for (const stage of RESOLUTION_UNLOCKS) {
      expect(LIFECYCLE[stage].joinable_today).toBe(false);
      expect(LIFECYCLE[stage].gap).toBeTruthy();
    }
  });

  it('does not claim to unlock returning_customer', () => {
    // That stage is blocked by a MISSING PAYMENT SOURCE, not by the join gap.
    // Resolving identity does nothing for it, and saying otherwise would promise
    // a funnel step that still cannot be computed.
    expect(RESOLUTION_UNLOCKS).not.toContain('returning_customer');
  });
});
