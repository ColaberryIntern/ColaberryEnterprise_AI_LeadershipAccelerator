/**
 * W10 (approved by Ali 2026-11-16; "We need to label our dept", 2026-11-17): department tags on
 * case studies, end to end on the server.
 *
 *  1. One closed vocabulary, the six the public site already speaks in.
 *  2. The admin override refuses anything outside it, before any snapshot is read or written.
 *  3. `?department=` filters (OR within the axis, AND with the others).
 *  4. The taxonomy counts departments from the candidates it is given, which the route builds
 *     from published, approved snapshots only (caseStudyPublicStore), like industries.
 */
import {
  CASE_STUDY_DEPARTMENTS,
  DEPARTMENTS_OVERRIDE_PATH,
  departmentsOverrideProblem,
} from '../caseStudyDepartments';
import {
  buildCaseStudyTaxonomy,
  isCandidatePubliclyVisible,
  matchesCaseStudyFilters,
} from '../caseStudyFilterService';
import type { CaseStudyFilterCandidate } from '../caseStudyFilterService';
import { PublicCaseStudyListQuery, toPublicFilterInput } from '../../../schemas/publicCaseStudySchema';
import { applyHumanOverride } from '../caseStudyAdminReview';

function candidate(over: Partial<CaseStudyFilterCandidate> = {}): CaseStudyFilterCandidate {
  return {
    slug: 'a-record',
    surfaceKey: 'enterprise',
    caseStudyStatus: 'approved',
    archived: false,
    publicationStatus: 'published',
    hasApprovedSnapshot: true,
    industry: 'retail-distribution',
    primaryCapability: null,
    capabilities: [],
    stack: [],
    programKey: null,
    builtBy: 'colaberry_team',
    deliverables: [],
    projectStatus: 'shipped',
    verificationClass: 'verified',
    verificationMethod: 'repo',
    repoVisibilities: [],
    featured: false,
    featuredRank: null,
    publishedAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    ...over,
  };
}

describe('W10: the department vocabulary', () => {
  it('is the six departments of the home page band, as facet slugs', () => {
    expect(CASE_STUDY_DEPARTMENTS).toEqual(['finance', 'operations', 'customer-service', 'sales', 'hr', 'it-data']);
    expect(DEPARTMENTS_OVERRIDE_PATH).toBe('taxonomy.departments');
  });

  it('accepts a list of known slugs, including the empty list that clears the tag', () => {
    expect(departmentsOverrideProblem(['finance', 'it-data'])).toBeNull();
    expect(departmentsOverrideProblem([])).toBeNull();
  });

  it('refuses a non-list, an unknown slug, and a repeat', () => {
    expect(departmentsOverrideProblem('finance')).toMatch(/must be a list/);
    expect(departmentsOverrideProblem(['finance', 'marketing'])).toMatch(/unknown department\(s\): marketing/);
    expect(departmentsOverrideProblem(['sales', 'sales'])).toMatch(/repeat/);
  });
});

describe('W10: the admin override refuses a bad tag before touching any record', () => {
  it('rejects an unknown department with a ValidationError', async () => {
    await expect(applyHumanOverride({
      caseStudyId: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
      path: 'taxonomy.departments',
      value: ['marketing'],
      actor: 'ali@colaberry.com',
    })).rejects.toMatchObject({ error_class: 'ValidationError' });
  });
});

describe('W10: ?department= on the public list', () => {
  it('parses a comma list and repeated params into the filter input', () => {
    const q = PublicCaseStudyListQuery.parse({ department: 'finance,sales' });
    expect(toPublicFilterInput(q).department).toEqual(['finance', 'sales']);
  });

  it('filters OR within departments, AND with industry', () => {
    const fin = candidate({ slug: 'fin', departments: ['finance'] });
    const ops = candidate({ slug: 'ops', departments: ['operations'], industry: 'energy' });
    const none = candidate({ slug: 'none' });
    const pick = (f: Parameters<typeof matchesCaseStudyFilters>[1]) =>
      [fin, ops, none].filter((c) => matchesCaseStudyFilters(c, f)).map((c) => c.slug);
    expect(pick({ department: ['finance'] })).toEqual(['fin']);
    expect(pick({ department: ['finance', 'operations'] })).toEqual(['fin', 'ops']);
    expect(pick({ department: ['operations'], industry: ['retail-distribution'] })).toEqual([]);
    expect(pick({})).toEqual(['fin', 'ops', 'none']);
  });
});

describe('W10: the departments facet', () => {
  it('counts each department across the published records it is given', () => {
    const facets = buildCaseStudyTaxonomy([
      candidate({ slug: 'a', departments: ['finance', 'operations'] }),
      candidate({ slug: 'b', departments: ['finance'] }),
      candidate({ slug: 'c' }),
    ]);
    expect(facets.departments).toEqual([
      { slug: 'finance', label: 'finance', count: 2 },
      { slug: 'operations', label: 'operations', count: 1 },
    ]);
  });

  it('a record that fails the public gate is never counted (the route filters first)', () => {
    const draft = candidate({ slug: 'd', departments: ['hr'], publicationStatus: 'draft' as CaseStudyFilterCandidate['publicationStatus'] });
    expect(isCandidatePubliclyVisible(draft, 'enterprise')).toBe(false);
    const counted = buildCaseStudyTaxonomy([draft].filter((c) => isCandidatePubliclyVisible(c, 'enterprise')));
    expect(counted.departments).toEqual([]);
  });
});
