import { useEffect, useState } from 'react';
import { fetchCaseStudyTaxonomy } from '../../services/caseStudyApi';
import type { PublicCaseStudyTaxonomyResponse } from '../../services/caseStudyPublicTypes';

/**
 * The Proof and Government menus in the header, built from live data.
 *
 * Ali, 2026-11-16: "I would like for the Proof and Gov to be broken out into
 * categories where our capabilities keep building out ... If we could break
 * them down by both [industry and department] and let them grow."
 *
 * So NOTHING HERE IS A HAND-KEPT LIST of industries, departments, families or
 * services. Proof reads /api/public/case-study-taxonomy (counted from published
 * records only); Government reads /api/public/services (the catalog admins
 * edit). A new industry, department or service family appears in the menu the
 * day its first record goes live, and one that empties disappears.
 *
 * Every builder accepts `null` (not loaded, or the request failed) and still
 * returns a usable menu: the "browse all" destination always exists, so a
 * failed feed degrades to a short menu, never an empty panel or a broken link.
 */

export interface NavMenuLink {
  readonly label: string;
  readonly to: string;
  /** Full page load: the destination is a static file, not a router route. */
  readonly external?: boolean;
  readonly count?: number;
}

export interface NavMenuGroup {
  readonly heading: string;
  readonly links: readonly NavMenuLink[];
  /** Shown instead of links while the group has nothing published yet. */
  readonly pending?: { readonly tag: string; readonly items: readonly string[]; readonly note: string };
}

export interface NavMenu {
  readonly groups: readonly NavMenuGroup[];
  /** The side column (Government's page sections). */
  readonly aside?: NavMenuGroup;
  readonly all: NavMenuLink;
  readonly footNote: string;
}

/** The government catalog as /api/public/services returns it (the fields used here). */
export interface GovCatalog {
  readonly families: readonly string[];
  readonly services: readonly { readonly slug: string; readonly name: string; readonly family: string }[];
}

/* Facet labels are stored lower-case slugs ("career-services-and-technical-hiring").
   Title-case for the menu; short joining words stay lower-case. */
const MINOR = new Set(['and', 'of', 'the', 'for', 'in', 'on', 'to', 'a']);
export const facetTitle = (raw: string): string =>
  raw
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w, i) => (i > 0 && MINOR.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

/*
   The departments the site already speaks in (the demo-pilot form and the home
   department map). Shown as "tagging in progress" until case studies carry a
   department: the field does not exist yet (Department PR, next). Once the
   taxonomy returns a `departments` facet, the real one replaces this list.
*/
export const PENDING_DEPARTMENTS: readonly string[] = [
  'Finance',
  'Operations',
  'Customer service',
  'Sales',
  'HR',
  'IT & Data',
];

type Facet = { readonly slug: string; readonly label?: string; readonly count: number };
type TaxonomyLike = {
  readonly facets: PublicCaseStudyTaxonomyResponse['facets'] & { readonly departments?: readonly Facet[] };
};

/** Every published record carries exactly one verification class, so this is the
 *  true published total. Summing industries undercounts: a record with no
 *  industry sits in no industry bucket (18 published, 17 with one, 2026-11-16). */
export const publishedTotal = (t: TaxonomyLike): number =>
  t.facets.verificationClasses.reduce((sum, v) => sum + v.count, 0);

export function buildProofMenu(taxonomy: TaxonomyLike | null): NavMenu {
  const industries = taxonomy ? [...taxonomy.facets.industries].filter((f) => f.count > 0) : [];
  const departments = taxonomy?.facets.departments?.filter((f) => f.count > 0) ?? [];
  const facetLinks = (key: string, list: readonly Facet[]): NavMenuLink[] =>
    [...list]
      .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug))
      .map((f) => ({
        label: facetTitle(f.label || f.slug),
        to: `/proof?${key}=${encodeURIComponent(f.slug)}`,
        count: f.count,
      }));

  const total = taxonomy ? publishedTotal(taxonomy) : null;
  return {
    groups: [
      { heading: 'Case studies by industry', links: facetLinks('industry', industries) },
      departments.length > 0
        ? { heading: 'By department', links: facetLinks('department', departments) }
        : {
            heading: 'By department',
            links: [],
            pending: {
              tag: 'Tagging in progress',
              items: PENDING_DEPARTMENTS,
              note: 'Fills in as case studies are tagged. A department appears once one is.',
            },
          },
      {
        heading: 'Other proof',
        links: [
          { label: 'Trust before intelligence (the book)', to: '/book' },
          { label: 'How a demo pilot proves it', to: '/how-it-works' },
        ],
      },
    ],
    all: { label: total ? `Browse all ${total} case studies` : 'Browse all case studies', to: '/proof' },
    footNote: 'Grouped from the published records. New industries appear here on their own.',
  };
}

/** The government page's own sections, reachable from its side column. */
const GOV_SECTIONS: readonly NavMenuLink[] = [
  { label: 'Look us up by code (NAICS)', to: '/government/#gv-naics', external: true },
  { label: 'How to buy from us', to: '/government/#gv-process', external: true },
  { label: 'Case studies in preparation', to: '/government/#gv-prep', external: true },
  { label: 'Have a solicitation?', to: '/government/#gv-contact', external: true },
];

export const govFamilyHref = (family: string): string =>
  `/government/?family=${encodeURIComponent(family)}#gv-services`;

export function buildGovMenu(catalog: GovCatalog | null): NavMenu {
  const families = catalog
    ? catalog.families.filter((f) => catalog.services.some((s) => s.family === f))
    : [];
  return {
    groups: families.map((family) => ({
      heading: family,
      links: catalog!.services
        .filter((s) => s.family === family)
        .map((s) => ({ label: s.name, to: govFamilyHref(family), external: true })),
    })),
    aside: {
      heading: 'Government',
      links: [{ label: 'All government services', to: '/government/', external: true }, ...GOV_SECTIONS],
    },
    all: {
      label: catalog ? `All ${catalog.services.length} government services` : 'All government services',
      to: '/government/',
      external: true,
    },
    footNote: 'From the live catalog. Add a service or a family there and it appears here.',
  };
}

const isGovCatalog = (x: unknown): x is GovCatalog =>
  !!x &&
  Array.isArray((x as GovCatalog).families) &&
  Array.isArray((x as GovCatalog).services) &&
  (x as GovCatalog).services.every((s) => typeof s?.name === 'string' && typeof s?.family === 'string');

async function fetchGovCatalog(signal: AbortSignal): Promise<GovCatalog | null> {
  const origin = process.env.REACT_APP_API_URL || '';
  const res = await fetch(`${origin}/api/public/services?audience=gov`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) return null;
  const body: unknown = await res.json();
  return isGovCatalog(body) ? body : null;
}

/**
 * Loads both feeds once, when the header mounts. Each is independent: one
 * failing leaves the other menu complete. Failures are swallowed on purpose -
 * the menus degrade to their "browse all" links, which is the right outcome for
 * a navigation aid, and the pages behind them report their own errors.
 */
export function useNavMenus(): { proof: NavMenu; government: NavMenu } {
  const [taxonomy, setTaxonomy] = useState<TaxonomyLike | null>(null);
  const [catalog, setCatalog] = useState<GovCatalog | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchCaseStudyTaxonomy({ signal: ctrl.signal })
      .then((t) => { if (!ctrl.signal.aborted) setTaxonomy(t); })
      .catch(() => undefined);
    fetchGovCatalog(ctrl.signal)
      .then((c) => { if (!ctrl.signal.aborted && c) setCatalog(c); })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  return { proof: buildProofMenu(taxonomy), government: buildGovMenu(catalog) };
}
