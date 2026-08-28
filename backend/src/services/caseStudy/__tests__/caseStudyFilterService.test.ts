/**
 * caseStudyFilterService - the canonical filter engine. T014 AC3, AC4, AC6.
 *
 * NO DATABASE, NO NETWORK. The engine is pure, so this suite runs with
 * `DATABASE_URL` unset and imports no model.
 *
 * The tests that matter most here are the two that are easy to lose in a
 * refactor: `isCandidatePubliclyVisible` refusing a draft/review/archived/
 * unpublished record, and refusing a record published to ANOTHER SURFACE.
 */

import {
  CASE_STUDY_SURFACE_PROFILES,
  DEFAULT_PAGE_SIZE,
  buildCaseStudyLedger,
  buildCaseStudyTaxonomy,
  getCaseStudySurfaceProfile,
  isCandidatePubliclyVisible,
  matchesCaseStudyFilters,
  mergeCaseStudyFilters,
  normalizeFacetSlug,
  runCaseStudyQuery,
  sanitizeFiltersForAudience,
  sortCaseStudyCandidates,
} from '../caseStudyFilterService';
import { CASE_STUDY_SURFACE_KEYS } from '../../../types/caseStudy';
import type { CaseStudyFilterCandidate } from '../caseStudyFilterService';

function candidate(over: Partial<CaseStudyFilterCandidate> = {}): CaseStudyFilterCandidate {
  return {
    slug: 'a-record',
    surfaceKey: 'enterprise',
    caseStudyStatus: 'approved',
    archived: false,
    publicationStatus: 'published',
    hasApprovedSnapshot: true,
    industry: 'retail-distribution',
    primaryCapability: 'agentic-forecasting',
    capabilities: ['agentic-forecasting', 'data-pipelines'],
    stack: ['typescript', 'postgres'],
    programKey: 'enterprise-accelerator',
    builtBy: 'colaberry_team',
    deliverables: ['architecture'],
    projectStatus: 'shipped',
    verificationClass: 'verified',
    verificationMethod: 'repo',
    repoVisibilities: ['public', 'private'],
    featured: false,
    featuredRank: null,
    publishedAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    ...over,
  };
}

/* ----------------------------------------------------------- visibility --- */

describe('the public visibility gate (AC3)', () => {
  it('admits an approved, published, non-archived record with an approved snapshot', () => {
    expect(isCandidatePubliclyVisible(candidate(), 'enterprise')).toBe(true);
  });

  it('refuses a DRAFT Case Study', () => {
    expect(isCandidatePubliclyVisible(candidate({ caseStudyStatus: 'draft' }), 'enterprise'))
      .toBe(false);
  });

  it('refuses a Case Study still in REVIEW', () => {
    expect(isCandidatePubliclyVisible(candidate({ caseStudyStatus: 'review' }), 'enterprise'))
      .toBe(false);
  });

  it('refuses an ARCHIVED Case Study, by status and by stamp', () => {
    expect(isCandidatePubliclyVisible(candidate({ caseStudyStatus: 'archived' }), 'enterprise'))
      .toBe(false);
    expect(isCandidatePubliclyVisible(candidate({ archived: true }), 'enterprise')).toBe(false);
  });

  it('refuses an UNPUBLISHED publication, and a publication still in draft', () => {
    expect(isCandidatePubliclyVisible(candidate({ publicationStatus: 'unpublished' }), 'enterprise'))
      .toBe(false);
    expect(isCandidatePubliclyVisible(candidate({ publicationStatus: 'draft' }), 'enterprise'))
      .toBe(false);
  });

  it('refuses a publication whose pin does not resolve to an approved snapshot', () => {
    expect(isCandidatePubliclyVisible(candidate({ hasApprovedSnapshot: false }), 'enterprise'))
      .toBe(false);
  });
});

describe('surface isolation (AC4)', () => {
  it('a training-only publication is invisible to enterprise', () => {
    const training = candidate({ surfaceKey: 'training' });
    expect(isCandidatePubliclyVisible(training, 'enterprise')).toBe(false);
    expect(isCandidatePubliclyVisible(training, 'training')).toBe(true);
  });

  it('the predicate rejects a cross-surface record even when a filter asks for it', () => {
    const training = candidate({ surfaceKey: 'training' });
    const paged = runCaseStudyQuery([training], {
      filters: { surface: 'enterprise' }, sort: 'newest', page: 1, limit: 10,
    });
    expect(paged.items).toEqual([]);
  });

  it('the surface is a parameter, not a constant: all four keys have a profile', () => {
    for (const key of CASE_STUDY_SURFACE_KEYS) {
      expect(getCaseStudySurfaceProfile(key).surfaceKey).toBe(key);
    }
    expect(Object.keys(CASE_STUDY_SURFACE_PROFILES).sort())
      .toEqual([...CASE_STUDY_SURFACE_KEYS].sort());
  });

  it('only enterprise is publishable in Phase 1', () => {
    expect(CASE_STUDY_SURFACE_PROFILES.enterprise.publishable).toBe(true);
    expect(CASE_STUDY_SURFACE_PROFILES.training.publishable).toBe(false);
    expect(CASE_STUDY_SURFACE_PROFILES['ai-flotation'].publishable).toBe(false);
    expect(CASE_STUDY_SURFACE_PROFILES.refactored.publishable).toBe(false);
  });

  it('every surface hides illustrative records by default (spec §14)', () => {
    for (const key of CASE_STUDY_SURFACE_KEYS) {
      expect(getCaseStudySurfaceProfile(key).defaultFilters.verificationClass)
        .toEqual(['verified', 'anonymized']);
    }
  });
});

/* --------------------------------------------------------------- audience --- */

describe('the admin-only repo_visibility facet (AC6)', () => {
  it('is dropped for a public audience', () => {
    const filters = sanitizeFiltersForAudience(
      { repoVisibility: ['private'], capability: ['agents'] }, 'public',
    );
    expect(filters.repoVisibility).toBeUndefined();
    expect(filters.capability).toEqual(['agents']);
  });

  it('is honoured for an admin audience', () => {
    const filters = sanitizeFiltersForAudience({ repoVisibility: ['private'] }, 'admin');
    expect(filters.repoVisibility).toEqual(['private']);
    expect(matchesCaseStudyFilters(candidate(), filters)).toBe(true);
    expect(matchesCaseStudyFilters(candidate({ repoVisibilities: ['public'] }), filters))
      .toBe(false);
  });

  it('drops `collection` too - it is a saved filter set, resolved by the caller', () => {
    expect(sanitizeFiltersForAudience({ collection: 'agents' }, 'public').collection)
      .toBeUndefined();
  });
});

/* ---------------------------------------------------------------- filters --- */

describe('filter matching', () => {
  it('matches OR within an axis and AND across axes', () => {
    const c = candidate();
    expect(matchesCaseStudyFilters(c, { stack: ['postgres', 'rust'] })).toBe(true);
    expect(matchesCaseStudyFilters(c, { stack: ['rust'] })).toBe(false);
    expect(matchesCaseStudyFilters(c, { stack: ['postgres'], industry: ['energy'] })).toBe(false);
  });

  it('normalises spelling on both sides, so "Agentic AI" and "agentic-ai" agree', () => {
    expect(normalizeFacetSlug('  Agentic AI ')).toBe('agentic-ai');
    expect(normalizeFacetSlug('Agentic_AI')).toBe('agentic-ai');
    expect(normalizeFacetSlug('Node.js')).toBe('node.js');
    expect(normalizeFacetSlug(42)).toBe('');
    expect(matchesCaseStudyFilters(candidate(), { capability: ['Agentic Forecasting'] }))
      .toBe(true);
  });

  it('treats the primary capability as a capability', () => {
    const c = candidate({ capabilities: [], primaryCapability: 'agentic-forecasting' });
    expect(matchesCaseStudyFilters(c, { capability: ['agentic-forecasting'] })).toBe(true);
  });

  it('an unknown facet value narrows to nothing - never widens to everything', () => {
    const paged = runCaseStudyQuery([candidate()], {
      filters: { capability: ['no-such-capability'] }, sort: 'newest', page: 1, limit: 10,
    });
    expect(paged.total).toBe(0);
    expect(paged.items).toEqual([]);
  });

  it('honours the featured boolean in both directions', () => {
    expect(matchesCaseStudyFilters(candidate({ featured: true }), { featured: true })).toBe(true);
    expect(matchesCaseStudyFilters(candidate({ featured: true }), { featured: false })).toBe(false);
  });

  it('never evaluates `collection` as a facet', () => {
    expect(matchesCaseStudyFilters(candidate(), { collection: 'anything-at-all' })).toBe(true);
  });

  it('merges a query over a preset, later winning per axis', () => {
    const merged = mergeCaseStudyFilters(
      { verificationClass: ['verified'], capability: ['agents'] },
      { verificationClass: ['illustrative'], stack: [] },
    );
    expect(merged.verificationClass).toEqual(['illustrative']);
    expect(merged.capability).toEqual(['agents']);
    expect(merged.stack).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ sort --- */

describe('deterministic sorts', () => {
  const a = candidate({
    slug: 'a', featured: true, featuredRank: 2, verificationClass: 'illustrative',
    publishedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  });
  const b = candidate({
    slug: 'b', featured: true, featuredRank: 1, verificationClass: 'anonymized',
    publishedAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  });
  const c = candidate({
    slug: 'c', featured: false, featuredRank: null, verificationClass: 'verified',
    publishedAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
  });

  it('featured: flag, then rank, then recency', () => {
    expect(sortCaseStudyCandidates([a, b, c], 'featured').map((x) => x.slug)).toEqual(['b', 'a', 'c']);
  });

  it('newest: publication date', () => {
    expect(sortCaseStudyCandidates([a, b, c], 'newest').map((x) => x.slug)).toEqual(['c', 'b', 'a']);
  });

  it('strongest-proof: verification class', () => {
    expect(sortCaseStudyCandidates([a, b, c], 'strongest-proof').map((x) => x.slug))
      .toEqual(['c', 'b', 'a']);
  });

  it('recently-updated: update stamp', () => {
    expect(sortCaseStudyCandidates([a, b, c], 'recently-updated').map((x) => x.slug))
      .toEqual(['a', 'b', 'c']);
  });

  it('breaks ties on slug, so two runs agree', () => {
    const tied = [candidate({ slug: 'z' }), candidate({ slug: 'y' })];
    expect(sortCaseStudyCandidates(tied, 'newest').map((x) => x.slug)).toEqual(['y', 'z']);
    expect(sortCaseStudyCandidates([...tied].reverse(), 'newest').map((x) => x.slug))
      .toEqual(['y', 'z']);
  });
});

/* ------------------------------------------------------------ pagination --- */

describe('pagination', () => {
  const many = Array.from({ length: 30 }, (_, i) => candidate({
    slug: `record-${String(i).padStart(2, '0')}`,
    publishedAt: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));

  it('pages without wrapping and reports the true total', () => {
    const page1 = runCaseStudyQuery(many, { filters: {}, sort: 'newest', page: 1, limit: 10 });
    expect(page1.items).toHaveLength(10);
    expect(page1.total).toBe(30);
    expect(page1.hasMore).toBe(true);
    const page3 = runCaseStudyQuery(many, { filters: {}, sort: 'newest', page: 3, limit: 10 });
    expect(page3.hasMore).toBe(false);
    const page9 = runCaseStudyQuery(many, { filters: {}, sort: 'newest', page: 9, limit: 10 });
    expect(page9.items).toEqual([]);
    expect(page9.total).toBe(30);
  });

  it('clamps a hostile limit and a hostile page', () => {
    const huge = runCaseStudyQuery(many, { filters: {}, sort: 'newest', page: 1, limit: 10_000 });
    expect(huge.limit).toBeLessThanOrEqual(48);
    const zero = runCaseStudyQuery(many, { filters: {}, sort: 'newest', page: 0, limit: 0 });
    expect(zero.page).toBe(1);
    expect(zero.limit).toBe(DEFAULT_PAGE_SIZE);
  });
});

/* ----------------------------------------------------- taxonomy + ledger --- */

describe('taxonomy and ledger are derived, never hardcoded', () => {
  it('an empty surface yields empty facets and a zero ledger', () => {
    expect(buildCaseStudyTaxonomy([])).toEqual({
      capabilities: [], industries: [], stack: [], programs: [],
      builtBy: [], verificationClasses: [],
    });
    expect(buildCaseStudyLedger([]))
      .toEqual({ projects: 0, verifiedOutcomes: 0, publicRepositories: 0, shipped: 0 });
  });

  it('counts facets across records, strongest first', () => {
    const facets = buildCaseStudyTaxonomy([
      candidate({ slug: 'a', stack: ['typescript', 'postgres'] }),
      candidate({ slug: 'b', stack: ['typescript'], industry: 'energy' }),
    ]);
    expect(facets.stack).toEqual([
      { slug: 'typescript', label: 'typescript', count: 2 },
      { slug: 'postgres', label: 'postgres', count: 1 },
    ]);
    expect(facets.industries.map((f) => f.slug).sort()).toEqual(['energy', 'retail-distribution']);
  });

  it('never reports a `pending` verification facet', () => {
    const facets = buildCaseStudyTaxonomy([
      candidate({ slug: 'a', verificationClass: 'pending' }),
      candidate({ slug: 'b', verificationClass: 'verified' }),
    ]);
    expect(facets.verificationClasses).toEqual([{ slug: 'verified', count: 1 }]);
  });

  it('counts the ledger from the records themselves', () => {
    expect(buildCaseStudyLedger([
      candidate({ slug: 'a', repoVisibilities: ['public', 'public', 'private'] }),
      candidate({ slug: 'b', verificationClass: 'anonymized', projectStatus: 'in_progress' }),
    ])).toEqual({ projects: 2, verifiedOutcomes: 1, publicRepositories: 3, shipped: 1 });
  });
});
