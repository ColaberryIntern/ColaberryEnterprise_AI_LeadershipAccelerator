/**
 * navMenus.test.ts -- the Proof and Government header menus are BUILT FROM
 * DATA, never kept by hand. Ali: categories "where our capabilities keep
 * building out ... let them grow". These hold that: what the feed says is what
 * the menu shows, a new value appears without code, and a failed feed still
 * leaves a working "browse all" link.
 */
import {
  buildGovMenu,
  buildProofMenu,
  facetTitle,
  GovCatalog,
  PENDING_DEPARTMENTS,
  publishedTotal,
} from '../navMenus';

/* Shape of /api/public/case-study-taxonomy on 2026-11-16 (counts are the live ones). */
const taxonomy = (extra: Record<string, unknown> = {}) => ({
  facets: {
    capabilities: [],
    stack: [],
    programs: [],
    builtBy: [],
    industries: [
      { slug: 'transportation', label: 'transportation', count: 2 },
      { slug: 'education', label: 'education', count: 10 },
      { slug: 'career-services-and-technical-hiring', label: 'career-services-and-technical-hiring', count: 1 },
      { slug: 'public-sector', label: 'public-sector', count: 1 },
      { slug: 'staffing', label: 'staffing', count: 1 },
      { slug: 'workforce-development', label: 'workforce-development', count: 1 },
      { slug: 'data-infrastructure-operations', label: 'data-infrastructure-operations', count: 1 },
    ],
    verificationClasses: [{ slug: 'repository_verified', count: 18 }],
    ...extra,
  },
}) as unknown as NonNullable<Parameters<typeof buildProofMenu>[0]>;

const catalog: GovCatalog = {
  families: ['AI', 'Consulting', 'Data', 'Empty'],
  services: [
    { slug: 'agents', name: 'AI Agents & Managed AI Workforce', family: 'AI' },
    { slug: 'cv', name: 'Computer Vision & Industrial AI', family: 'AI' },
    { slug: 'assess', name: 'AI Opportunity & Readiness Assessment', family: 'Consulting' },
    { slug: 'geo', name: 'Geospatial & Remote Sensing Analytics', family: 'Data' },
  ],
};

describe('facetTitle', () => {
  it('title-cases stored slugs, keeping short joining words lower-case', () => {
    expect(facetTitle('career-services-and-technical-hiring')).toBe('Career Services and Technical Hiring');
    expect(facetTitle('education')).toBe('Education');
  });
});

describe('Proof menu', () => {
  it('lists every published industry with its count, largest first, each landing on /proof filtered', () => {
    const industry = buildProofMenu(taxonomy()).groups[0];
    expect(industry.heading).toBe('Case studies by industry');
    expect(industry.links.map((l) => l.label)).toEqual([
      'Education', 'Transportation', 'Career Services and Technical Hiring', 'Data Infrastructure Operations',
      'Public Sector', 'Staffing', 'Workforce Development',
    ]);
    expect(industry.links[0]).toMatchObject({ to: '/proof?industry=education', count: 10 });
  });

  it('grows on its own: a new industry in the feed appears with no code change', () => {
    const t = taxonomy();
    (t.facets.industries as unknown as unknown[]).push({ slug: 'healthcare', label: 'healthcare', count: 3 });
    const labels = buildProofMenu(t).groups[0].links.map((l) => l.label);
    expect(labels).toContain('Healthcare');
  });

  it('drops an industry whose count falls to zero, so no link filters to nothing', () => {
    const t = taxonomy();
    (t.facets.industries as unknown as { count: number }[])[0].count = 0;
    expect(buildProofMenu(t).groups[0].links.map((l) => l.label)).not.toContain('Transportation');
  });

  it('counts the TRUE published total, not the sum of industries (18, not 17)', () => {
    const t = taxonomy();
    expect(publishedTotal(t)).toBe(18);
    expect(buildProofMenu(t).all.label).toBe('Browse all 18 case studies');
  });

  it('shows department as pending, with no links, until the taxonomy carries a department facet', () => {
    const dept = buildProofMenu(taxonomy()).groups[1];
    expect(dept.links).toEqual([]);
    expect(dept.pending?.items).toEqual(PENDING_DEPARTMENTS);
  });

  it('switches department to real, counted links the moment the facet exists', () => {
    const dept = buildProofMenu(
      taxonomy({ departments: [{ slug: 'finance', label: 'finance', count: 4 }] }),
    ).groups[1];
    expect(dept.pending).toBeUndefined();
    expect(dept.links).toEqual([{ label: 'Finance', to: '/proof?department=finance', count: 4 }]);
  });

  it('degrades to a working browse-all link when the feed failed', () => {
    const m = buildProofMenu(null);
    expect(m.groups[0].links).toEqual([]);
    expect(m.all).toEqual({ label: 'Browse all case studies', to: '/proof' });
  });
});

describe('Government menu', () => {
  it('groups services under their family, in catalog order, each landing on the page filtered', () => {
    const m = buildGovMenu(catalog);
    expect(m.groups.map((g) => g.heading)).toEqual(['AI', 'Consulting', 'Data']);
    expect(m.groups[0].links.map((l) => l.label)).toEqual([
      'AI Agents & Managed AI Workforce', 'Computer Vision & Industrial AI',
    ]);
    expect(m.groups[0].links[0]).toMatchObject({ to: '/government/?family=AI#gv-services', external: true });
  });

  it('never shows a family with no services', () => {
    expect(buildGovMenu(catalog).groups.map((g) => g.heading)).not.toContain('Empty');
  });

  it('grows on its own: a new family and service appear with no code change', () => {
    const grown: GovCatalog = {
      families: [...catalog.families, 'Health'],
      services: [...catalog.services, { slug: 'h', name: 'Clinical AI', family: 'Health' }],
    };
    expect(buildGovMenu(grown).groups.map((g) => g.heading)).toContain('Health');
    expect(buildGovMenu(grown).all.label).toBe('All 5 government services');
  });

  it('links to the static government page with plain anchors (external), never router links', () => {
    const m = buildGovMenu(catalog);
    [...m.groups.flatMap((g) => g.links), ...(m.aside?.links ?? []), m.all].forEach((l) => {
      expect(l.external).toBe(true);
      expect(l.to.startsWith('/government/')).toBe(true);
    });
  });

  it('degrades to the page and its sections when the catalog failed', () => {
    const m = buildGovMenu(null);
    expect(m.groups).toEqual([]);
    expect(m.all.to).toBe('/government/');
    expect(m.aside?.links.length).toBeGreaterThan(1);
  });
});
