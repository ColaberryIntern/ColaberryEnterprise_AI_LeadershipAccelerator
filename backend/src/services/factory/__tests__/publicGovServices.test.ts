import {
  buildPublicCatalog, deriveSlug, canonicalIndustry, PUBLIC_TIER,
  type BuildInput,
} from '../publicGovServices';
import type { ServiceFact, CaseStudyFact } from '../serviceEvidenceLoad';

/**
 * publicGovServices - the gate, and the subtraction.
 *
 * `buildPublicCatalog` is pure so both can be tested without a database, which
 * matters because the thing being protected is what a contracting officer sees.
 *
 * Every fixture below is shaped from what production actually holds, measured
 * on 2026-11-15 rather than taken from the design package: six category values
 * and not four, `Energy` and `energy` both present, and not one of the 36
 * confirmed-linked case studies published on the enterprise surface.
 */

const svc = (over: Partial<ServiceFact> = {}): ServiceFact => ({
  id: 's1',
  name: 'Applied Data Science & Predictive Analytics',
  category: 'Data',
  status: 'active',
  keywords: [],
  naicsCodes: ['541511'],
  createdAt: null,
  description: 'Forecasting and pricing models.',
  pscCodes: ['D307'],
  ...over,
});

const cs = (over: Partial<CaseStudyFact> = {}): CaseStudyFact => ({
  id: 'c1',
  title: 'Energy Demand Forecasting',
  slug: 'energy-demand-forecasting',
  status: 'approved',
  sourceKind: 'outside',
  industry: 'Utilities',
  year: 2026,
  primaryCapability: null,
  analysisTerms: [],
  ...over,
});

const build = (over: Partial<BuildInput> = {}): ReturnType<typeof buildPublicCatalog> =>
  buildPublicCatalog({
    services: [svc()],
    links: [{ caseStudyId: 'c1', serviceId: 's1' }],
    caseStudies: new Map([['c1', cs()]]),
    visibility: { publiclyVisible: new Set<string>() },
    currentYear: 2026,
    asOf: '2026-11-15',
    ...over,
  });

/* ------------------------------------------------------------------ gate -- */

describe('the gate: a service earns a card only on confirmed proof', () => {
  it('marks a service with a confirmed case study as proven', () => {
    const [s] = build().services;
    expect(s.proven).toBe(true);
    expect(s.caseStudies).toBe(1);
  });

  it('marks a service with no links as NOT proven, but still lists it', () => {
    const cat = build({ links: [], caseStudies: new Map() });
    expect(cat.services).toHaveLength(1);
    expect(cat.services[0].proven).toBe(false);
    expect(cat.services[0].caseStudies).toBe(0);
    expect(cat.services[0].tier).toBe(PUBLIC_TIER.none);
  });

  it('ignores a link whose case study is missing, rather than counting a ghost', () => {
    const cat = build({ caseStudies: new Map() });
    expect(cat.services[0].proven).toBe(false);
    expect(cat.services[0].caseStudies).toBe(0);
  });

  it('orders proven services ahead of unproven ones', () => {
    const cat = build({
      services: [svc({ id: 'empty', name: 'Zero Proof Service' }), svc()],
      links: [{ caseStudyId: 'c1', serviceId: 's1' }],
    });
    expect(cat.services.map((s) => s.proven)).toEqual([true, false]);
  });
});

/* ----------------------------------------------------------- subtraction -- */

describe('the subtraction: internal numbers never reach the payload', () => {
  it('emits a tier WORD and no score', () => {
    const s = build().services[0] as unknown as Record<string, unknown>;
    expect(typeof s.tier).toBe('string');
    expect(s.score).toBeUndefined();
    expect(s.insideCount).toBeUndefined();
    expect(s.outsideCount).toBeUndefined();
  });

  it('renames the admin tiers to the public wording', () => {
    expect(PUBLIC_TIER.proven).toBe('Proven');
    expect(PUBLIC_TIER.emerging).toBe('Demonstrated');
    expect(PUBLIC_TIER.thin).toBe('Emerging');
    expect(PUBLIC_TIER.none).toBe('In preparation');
  });

  it('exposes exactly the agreed public keys and nothing more', () => {
    expect(Object.keys(build().services[0]).sort()).toEqual([
      'caseStudies', 'caseStudyList', 'description', 'family', 'freshest',
      'industries', 'industryCounts', 'naics', 'name', 'proven', 'psc', 'slug', 'tier',
    ]);
  });
});

/* -------------------------------------------------------- case-study links */

describe('a case study opens only if the page it opens really exists', () => {
  /*
      The design package assumed an "inside" study opens in a new tab. Measured
      against production, none of the 36 confirmed-linked studies is published
      on the enterprise surface, so that assumption would have shipped 36 dead
      links. Access is computed from publication, not from source_type.
  */
  it('is gated when the study is not publicly visible, even though it is inside', () => {
    const cat = build({
      caseStudies: new Map([['c1', cs({ sourceKind: 'inside' })]]),
      visibility: { publiclyVisible: new Set() },
    });
    const [ref] = cat.services[0].caseStudyList;
    expect(ref.access).toBe('gated');
    expect(ref.url).toBeNull();
  });

  it('says whether Colaberry built it, without exposing the split counts', () => {
    const inside = build({ caseStudies: new Map([['c1', cs({ sourceKind: 'inside' })]]) });
    expect(inside.services[0].caseStudyList[0].builtByColaberry).toBe(true);
    const outside = build();
    expect(outside.services[0].caseStudyList[0].builtByColaberry).toBe(false);
  });

  it('becomes public, with a URL, the moment it is published', () => {
    const cat = build({
      visibility: { publiclyVisible: new Set(['energy-demand-forecasting']) },
    });
    const [ref] = cat.services[0].caseStudyList;
    expect(ref.access).toBe('public');
    expect(ref.url).toBe('/stories/energy-demand-forecasting');
  });

  it('stays gated when the study has no slug, because there is no URL to open', () => {
    const cat = build({
      caseStudies: new Map([['c1', cs({ slug: null })]]),
      visibility: { publiclyVisible: new Set(['energy-demand-forecasting']) },
    });
    expect(cat.services[0].caseStudyList[0].access).toBe('gated');
  });
});

/* ------------------------------------------------------- real-data shapes */

describe('the shapes production actually holds', () => {
  it('keeps all six category values as families, not the four that were assumed', () => {
    const names = ['Data', 'AI', 'Consulting', 'IT', 'Training', 'Staffing'];
    const cat = buildPublicCatalog({
      services: names.map((c, i) => svc({ id: `s${i}`, name: `Service ${i}`, category: c })),
      links: [], caseStudies: new Map(),
      visibility: { publiclyVisible: new Set() },
      currentYear: 2026, asOf: '2026-11-15',
    });
    expect(cat.families).toEqual([...names].sort());
  });

  it('calls an uncategorised service Other rather than dropping it', () => {
    const cat = build({ services: [svc({ category: null })], links: [], caseStudies: new Map() });
    expect(cat.services[0].family).toBe('Other');
    expect(cat.families).toEqual(['Other']);
  });

  it('folds Energy and energy into one industry with the counts summed', () => {
    const cat = build({
      links: [
        { caseStudyId: 'c1', serviceId: 's1' },
        { caseStudyId: 'c2', serviceId: 's1' },
        { caseStudyId: 'c3', serviceId: 's1' },
      ],
      caseStudies: new Map([
        ['c1', cs({ id: 'c1', industry: 'Energy', slug: 'a' })],
        ['c2', cs({ id: 'c2', industry: 'energy', slug: 'b' })],
        ['c3', cs({ id: 'c3', industry: 'Utilities', slug: 'c' })],
      ]),
    });
    const s = cat.services[0];
    expect(s.industries).toEqual(['Energy', 'Utilities']);
    expect(s.industryCounts).toEqual({ Energy: 2, Utilities: 1 });
  });

  it('title-cases a lowercase-only label and leaves a mixed-case one alone', () => {
    expect(canonicalIndustry('energy')).toBe('Energy');
    expect(canonicalIndustry('AgTech')).toBe('AgTech');
    expect(canonicalIndustry('  ')).toBe('');
  });

  it('takes the freshest year across the linked proof, and null when there is none', () => {
    expect(build().services[0].freshest).toBe(2026);
    expect(build({ caseStudies: new Map([['c1', cs({ year: null })]]) }).services[0].freshest)
      .toBeNull();
  });

  it('passes NAICS and PSC codes through from the database', () => {
    const s = build().services[0];
    expect(s.naics).toEqual(['541511']);
    expect(s.psc).toEqual(['D307']);
  });
});

/* ------------------------------------------------------------------ slug -- */

describe('the derived slug', () => {
  it('spells an ampersand out, so two services do not collapse together', () => {
    expect(deriveSlug('Applied Data Science & Predictive Analytics'))
      .toBe('applied-data-science-and-predictive-analytics');
  });

  it('is lowercase, hyphenated, and free of leading or trailing hyphens', () => {
    expect(deriveSlug('  Cloud Migration, Hosting & Security Operations  '))
      .toBe('cloud-migration-hosting-and-security-operations');
    expect(deriveSlug('(Hire-Train-Deploy)')).toBe('hire-train-deploy');
  });

  it('is stable for the same name', () => {
    expect(deriveSlug('Geospatial & Remote Sensing Analytics'))
      .toBe(deriveSlug('Geospatial & Remote Sensing Analytics'));
  });

  it('distinguishes all fourteen real active service names', () => {
    const real = [
      'Applied Data Science & Predictive Analytics', 'Computer Vision & Industrial AI',
      'Enterprise AI Build & System Modernization', 'Cloud Migration, Hosting & Security Operations',
      'Geospatial & Remote Sensing Analytics', 'Managed Data Services & BI Modernization',
      'AI Agents & Managed AI Workforce', 'Data Migration, Integration & Data Quality',
      'Data Talent Pipeline (Hire-Train-Deploy)', 'AI Opportunity & Readiness Assessment',
      'AI Production Pilot / Proof of Concept', 'Data Analytics & BI Training with Job Placement',
      'Government Proposal Development & Capture Support', 'Workforce AI Upskilling & Architect Accelerator',
    ];
    const slugs = real.map(deriveSlug);
    expect(new Set(slugs).size).toBe(real.length);
    expect(slugs.every((s) => /^[a-z0-9-]+$/.test(s))).toBe(true);
  });
});

/* ----------------------------------------------------------------- catalog */

describe('the catalog envelope', () => {
  it('carries the as-of date the page shows a contracting officer', () => {
    expect(build().asOf).toBe('2026-11-15');
  });

  it('sorts the linked case studies newest first', () => {
    const cat = build({
      links: [
        { caseStudyId: 'c1', serviceId: 's1' },
        { caseStudyId: 'c2', serviceId: 's1' },
      ],
      caseStudies: new Map([
        ['c1', cs({ id: 'c1', title: 'Older', year: 2023, slug: 'older' })],
        ['c2', cs({ id: 'c2', title: 'Newer', year: 2026, slug: 'newer' })],
      ]),
    });
    expect(cat.services[0].caseStudyList.map((r) => r.title)).toEqual(['Newer', 'Older']);
  });
});
