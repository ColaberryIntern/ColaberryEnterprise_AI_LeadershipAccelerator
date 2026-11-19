/**
 * W26 (Ali, 2026-11-18): on /proof "the numbers don't move with the filters" and
 * "all the filters should be filtered by that selection as well."
 *
 * The list response now carries `matchLedger` (the four figures for what the
 * query matches) and `facets` (counts narrowed to the query, each axis counted
 * over the records matching the OTHER axes, so siblings in one axis stay
 * selectable).
 */
import { buildContextualTaxonomy, buildMatchLedger } from '../caseStudyContextualFacets';
import type { CaseStudyFilterCandidate } from '../caseStudyFilterService';

function candidate(over: Partial<CaseStudyFilterCandidate> = {}): CaseStudyFilterCandidate {
  return {
    slug: 'a-record',
    surfaceKey: 'enterprise',
    caseStudyStatus: 'approved',
    archived: false,
    publicationStatus: 'published',
    hasApprovedSnapshot: true,
    industry: 'technology',
    primaryCapability: null,
    capabilities: [],
    stack: [],
    programKey: null,
    builtBy: 'colaberry_team',
    deliverables: [],
    projectStatus: 'shipped',
    verificationClass: 'verified',
    verificationMethod: 'repo',
    repoVisibilities: ['public'],
    featured: false,
    featuredRank: null,
    publishedAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    ...over,
  };
}

const LIBRARY = [
  candidate({ slug: 'a', departments: ['sales'], stack: ['postgresql'], industry: 'education' }),
  candidate({ slug: 'b', departments: ['sales'], stack: ['python'], projectStatus: null }),
  candidate({ slug: 'c', departments: ['hr'], stack: ['python'], repoVisibilities: [] }),
  candidate({ slug: 'd', departments: ['operations'], stack: ['react'], verificationClass: 'illustrative' }),
];

const count = (facets: readonly { slug: string; count: number }[] | undefined, slug: string): number =>
  facets?.find((f) => f.slug === slug)?.count ?? 0;

describe('W26: the ledger for the query, not the library', () => {
  it('counts only the records the filters match', () => {
    expect(buildMatchLedger(LIBRARY, { department: ['sales'] }))
      .toEqual({ projects: 2, verifiedOutcomes: 2, publicRepositories: 2, shipped: 1 });
  });

  it('equals the library ledger when nothing is selected', () => {
    expect(buildMatchLedger(LIBRARY, {}).projects).toBe(4);
  });
});

describe('W26: facet counts narrowed to the selection', () => {
  it('narrows every OTHER axis to the selection', () => {
    const facets = buildContextualTaxonomy(LIBRARY, { department: ['sales'] });
    expect(facets.stack.map((f) => f.slug).sort()).toEqual(['postgresql', 'python']);
    expect(count(facets.stack, 'react')).toBe(0);
    expect(count(facets.industries, 'education')).toBe(1);
  });

  it('keeps the selected axis counted over the others, so a sibling can be added', () => {
    const facets = buildContextualTaxonomy(LIBRARY, { department: ['sales'], stack: ['python'] });
    // Department is counted over stack=python only: b (sales) and c (hr).
    expect(count(facets.departments, 'sales')).toBe(1);
    expect(count(facets.departments, 'hr')).toBe(1);
    expect(count(facets.departments, 'operations')).toBe(0);
    // Stack is counted over department=sales only: a and b.
    expect(count(facets.stack, 'postgresql')).toBe(1);
    expect(count(facets.stack, 'python')).toBe(1);
  });

  it('counts verification over the other axes, so the withheld-illustrative note stays honest', () => {
    const facets = buildContextualTaxonomy(LIBRARY, { verificationClass: ['verified', 'anonymized'] });
    expect(count(facets.verificationClasses, 'illustrative')).toBe(1);
    expect(facets.departments?.map((f) => f.slug).sort()).toEqual(['hr', 'sales']);
  });
});
