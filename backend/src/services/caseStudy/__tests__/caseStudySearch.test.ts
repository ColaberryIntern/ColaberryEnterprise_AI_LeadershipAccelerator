import { matchesSearch, normalizeForSearch, searchTerms } from '../caseStudySearch';
import type { PublicCaseStudySummary } from '../../../types/caseStudyPublic';

/**
 * The search contract, and the one assertion here that is about privacy rather
 * than about relevance.
 *
 * `matchesSearch` takes a PROJECTED summary. By the time it runs, consent has
 * already decided whether `organizationLabel` is a real name, a descriptor, or
 * null. The test named "cannot be used to confirm a name consent removed" is the
 * reason the signature is that way round, and it is the one that must never be
 * weakened to make search feel better.
 */

const summary = (over: Partial<PublicCaseStudySummary> = {}): PublicCaseStudySummary => ({
  slug: 'a-record',
  title: 'The AI Proposes, A Verified Human Decides',
  standfirst: 'An AI operations platform for SQL Server infrastructure.',
  organizationLabel: 'Colaberry',
  industry: 'data-infrastructure-operations',
  primaryCapability: 'governed-ai-remediation',
  capabilities: ['governed-ai-remediation', 'human-in-the-loop-approval-queue'],
  stack: ['typescript', 'react'],
  programLabel: null,
  builtBy: 'learner',
  verificationClass: 'verified',
  verificationMethod: 'repository',
  headlineMetric: null,
  deliverables: ['audit-trail'],
  featured: false,
  publishedAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
  heroImageUrl: null,
  ...over,
}) as PublicCaseStudySummary;

describe('searchTerms — an absent or empty query is not a search', () => {
  it.each([null, undefined, '', '   ', '!!!', '- / -'])('treats %p as no search', (input) => {
    expect(searchTerms(input as string | null)).toEqual([]);
  });

  it('splits on anything that is not a letter or a digit', () => {
    expect(searchTerms('  SQL-Server, audit/trail ')).toEqual(['sql', 'server', 'audit', 'trail']);
  });
});

describe('normalizeForSearch', () => {
  it('folds case and strips accents, so "Séverine" is reachable by "severine"', () => {
    expect(normalizeForSearch('Séverine')).toBe('severine');
  });

  it('turns hyphenated slugs into words', () => {
    // Without this the sidebar's own vocabulary is unsearchable: a reader types
    // "remediation", the record only says `governed-ai-remediation`.
    expect(normalizeForSearch('governed-ai-remediation')).toBe('governed ai remediation');
  });
});

describe('matchesSearch — what it finds', () => {
  it('matches nothing-asked-for by returning everything', () => {
    expect(matchesSearch(summary(), [])).toBe(true);
  });

  it('finds a record by a word in its title', () => {
    expect(matchesSearch(summary(), searchTerms('verified human'))).toBe(true);
  });

  it('finds a record by its standfirst', () => {
    expect(matchesSearch(summary(), searchTerms('sql server'))).toBe(true);
  });

  it('finds a record by a taxonomy slug a reader would type as a word', () => {
    expect(matchesSearch(summary(), searchTerms('remediation'))).toBe(true);
    expect(matchesSearch(summary(), searchTerms('approval queue'))).toBe(true);
  });

  it('finds a record by its stack', () => {
    expect(matchesSearch(summary(), searchTerms('typescript'))).toBe(true);
  });

  it('requires EVERY term, so typing more narrows rather than widens', () => {
    // "verified" is in the title; "kubernetes" is nowhere.
    expect(matchesSearch(summary(), searchTerms('verified'))).toBe(true);
    expect(matchesSearch(summary(), searchTerms('verified kubernetes'))).toBe(false);
  });

  it('returns false for a term that appears nowhere', () => {
    expect(matchesSearch(summary(), searchTerms('mainframe'))).toBe(false);
  });

  it('is unaffected by punctuation the reader happens to type', () => {
    expect(matchesSearch(summary(), searchTerms('SQL-Server!'))).toBe(true);
  });
});

describe('matchesSearch — what it must NOT find', () => {
  /**
   * THE PRIVACY ASSERTION. A record whose organization consent resolved to a
   * descriptor must not be findable by the name that descriptor replaced.
   *
   * If this ever fails, anonymisation has become guessable: type a candidate
   * name, watch a record appear, and the client is identified without a single
   * name being rendered anywhere. The fix is never to relax this test - it is
   * that something upstream started handing raw snapshot text to the matcher.
   */
  it('cannot be used to confirm a name consent removed', () => {
    const anonymised = summary({ organizationLabel: 'a Fortune 500 insurer' });

    expect(matchesSearch(anonymised, searchTerms('Fortune 500 insurer'))).toBe(true);
    expect(matchesSearch(anonymised, searchTerms('Northwind Mutual'))).toBe(false);
    expect(matchesSearch(anonymised, searchTerms('Northwind'))).toBe(false);
  });

  it('finds nothing through a hidden organization, because there is no label to match', () => {
    const hidden = summary({ organizationLabel: null });
    expect(matchesSearch(hidden, searchTerms('colaberry'))).toBe(false);
    // Non-vacuity: the same record is still reachable by text that IS published.
    expect(matchesSearch(hidden, searchTerms('verified human'))).toBe(true);
  });

  it('matches only the fields a card prints, so slug is not a backdoor', () => {
    const odd = summary({ slug: 'northwind-mutual-rollout', organizationLabel: null });
    expect(matchesSearch(odd, searchTerms('northwind'))).toBe(false);
  });
});
