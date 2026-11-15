import {
  loadTenantServices, loadLinksInto, loadCaseStudyFacts,
  type ServiceFact, type CaseStudyFact,
} from './serviceEvidenceLoad';
import { scoreServiceEvidence, evidenceTier, type EvidenceTier } from './serviceEvidenceScore';

/**
 * publicGovServices - the catalog behind the public /government page.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE ADMIN SUMMARY
 *
 * `serviceEvidenceSummary` answers "where is our evidence thin" for Ali. This
 * answers "what can we prove to a contracting officer". Same loaders, different
 * audience, and the difference is mostly SUBTRACTION: the evidence score, the
 * inside/outside split, the suggested-link counts and the Gov-match counts are
 * all internal and never leave this file.
 *
 * LIVE READ, GATED BY THE LINK A HUMAN CONFIRMED
 *
 * Ali's decision of 15 Nov 2026. There is no publish button and no snapshot:
 * the page reads this on every load, so an admin edit shows immediately. What
 * keeps unfinished work off a page aimed at contracting officers is the gate
 * below - a service earns a CARD only when it is `active` AND at least one
 * case-study link has been moved to `confirmed`, which is already a deliberate
 * human act in the admin. Services with no confirmed proof still appear, in a
 * quieter "in preparation" list, because a catalog that hides them would
 * understate what Colaberry does.
 *
 * This is deliberately NOT the case-study publication model, which pins an
 * approved snapshot and shows nothing until someone republishes. That model
 * exists because case-study PROSE is a published artifact. A service row is a
 * catalog entry, and the confirmed link is its editorial act.
 *
 * WHAT THE DATA ACTUALLY SUPPORTS, measured against production on 2026-11-15
 * rather than assumed from the design package:
 *   - 14 active services; 8 have confirmed proof, 6 do not
 *   - `category` holds SIX values (Data, AI, Consulting, IT, Training,
 *     Staffing), not the four the design package assumed. Dropping the two it
 *     did not predict would have hidden four services, so the family list is
 *     derived from the data instead of hardcoded.
 *   - `past_performance` is empty on all 14, and there is no scope-bullet
 *     column at all, so neither is emitted. The page omits those sections
 *     rather than inventing filler.
 *   - `psc_codes_json` IS populated for 7 services, so PSC codes come from the
 *     database instead of being a launch placeholder.
 *   - NONE of the 36 confirmed-linked case studies is published on the
 *     enterprise surface, so every one of them is `gated` today. That is
 *     computed, not hardcoded: publish one and it flips to `public` by itself.
 */

/* ------------------------------------------------------------------ types -- */

/** Public tier wording. The admin tiers are internal and are renamed here. */
export const PUBLIC_TIER: Readonly<Record<EvidenceTier, string>> = Object.freeze({
  proven: 'Proven',
  emerging: 'Demonstrated',
  thin: 'Emerging',
  none: 'In preparation',
});

export interface PublicCaseStudyRef {
  readonly title: string;
  readonly industry: string | null;
  readonly year: number | null;
  /** `public` opens at a real URL; `gated` is sent on request. Never guessed. */
  readonly access: 'public' | 'gated';
  /** Set only when access is `public`. */
  readonly url: string | null;
  /**
   * Did Colaberry build this, or is it a library document? The page says so
   * in words. This is the per-study ORIGIN, not the inside/outside split
   * COUNTS, which stay internal: a contracting officer is entitled to know
   * whether we did the work, and not to our evidence bookkeeping.
   */
  readonly builtByColaberry: boolean;
}

export interface PublicGovService {
  readonly slug: string;
  readonly name: string;
  readonly family: string;
  readonly tier: string;
  readonly description: string | null;
  readonly naics: readonly string[];
  readonly psc: readonly string[];
  readonly industries: readonly string[];
  readonly industryCounts: Readonly<Record<string, number>>;
  readonly caseStudies: number;
  readonly freshest: number | null;
  /** True when at least one confirmed case study backs this service. */
  readonly proven: boolean;
  readonly caseStudyList: readonly PublicCaseStudyRef[];
}

export interface PublicGovCatalog {
  readonly asOf: string;
  readonly families: readonly string[];
  readonly services: readonly PublicGovService[];
}

/* -------------------------------------------------------------- internals -- */

/**
 * A URL-safe key derived from the name.
 *
 * `service_offerings` HAS NO SLUG COLUMN. Adding one is a schema change and a
 * decision for the DRI, so this derives the key instead. Two things make that
 * safe enough for this page: the key is never a URL the public can bookmark (it
 * identifies a card and rides along in a request payload), and no two active
 * service names collide today - checked against production, zero collisions.
 *
 * The cost is stated rather than hidden: renaming a service changes its key, so
 * an in-flight request form would carry the old one. The request handler stores
 * the name alongside it for exactly that reason.
 */
export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Industry labels, case-normalised for grouping.
 *
 * Production holds both `Energy` and `energy` as separate values, which would
 * render as two industries on a filter list. Grouping is case-insensitive and
 * the label kept is the first non-lowercase spelling seen, falling back to
 * title case, so the page shows "Energy" once with the counts summed.
 */
export function canonicalIndustry(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (t !== t.toLowerCase()) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Family label for a free-text `category`. Unset becomes "Other", never dropped. */
function familyOf(category: string | null): string {
  const t = (category || '').trim();
  return t || 'Other';
}

interface Visibility {
  /**
   * SLUGS, not ids, that really are retrievable on the public enterprise
   * surface. The published record exposes `candidate.slug` and no case-study
   * id, and the slug is the honest key anyway: it is what the URL is built
   * from, so a study without one could not be opened even if it were visible.
   */
  readonly publiclyVisible: ReadonlySet<string>;
}

/**
 * Which linked case studies a visitor could actually open.
 *
 * ASKED OF THE PUBLIC PIPELINE, not inferred from `source_type`. The design
 * package assumed an "inside" case study opens in a new tab; measured against
 * production, none of the 36 confirmed-linked studies is published on the
 * enterprise surface, so that assumption would have shipped 36 dead links. This
 * repo has already been bitten by exactly that - two footer links asserted by a
 * passing test while both 404'd.
 */
async function loadPublicVisibility(slugs: readonly string[]): Promise<Visibility> {
  if (!slugs.length) return { publiclyVisible: new Set() };
  const [{ loadSurfacePublications }, { isCandidatePubliclyVisible }] = await Promise.all([
    import('../caseStudy/caseStudyPublicStore'),
    import('../caseStudy/caseStudyFilterService'),
  ]);
  const wanted = new Set(slugs);
  const records = await loadSurfacePublications('enterprise');
  const visible = new Set<string>();
  for (const r of records) {
    const slug = r.candidate.slug;
    if (!slug || !wanted.has(slug)) continue;
    if (isCandidatePubliclyVisible(r.candidate, 'enterprise')) visible.add(slug);
  }
  return { publiclyVisible: visible };
}

function refFor(fact: CaseStudyFact, vis: Visibility): PublicCaseStudyRef {
  const open = Boolean(fact.slug) && vis.publiclyVisible.has(fact.slug as string);
  return {
    title: fact.title,
    industry: fact.industry ? canonicalIndustry(fact.industry) : null,
    year: fact.year,
    access: open ? 'public' : 'gated',
    url: open ? `/stories/${fact.slug}` : null,
    builtByColaberry: fact.sourceKind === 'inside',
  };
}

/* ------------------------------------------------------------------ build -- */

export interface BuildInput {
  readonly services: readonly ServiceFact[];
  readonly links: readonly { caseStudyId: string; serviceId: string }[];
  readonly caseStudies: ReadonlyMap<string, CaseStudyFact>;
  readonly visibility: Visibility;
  readonly currentYear: number;
  readonly asOf: string;
}

/** Pure, so the gate and the subtraction can be tested without a database. */
export function buildPublicCatalog(input: BuildInput): PublicGovCatalog {
  const byService = new Map<string, CaseStudyFact[]>();
  for (const link of input.links) {
    const fact = input.caseStudies.get(link.caseStudyId);
    if (!fact) continue;
    const list = byService.get(link.serviceId) || [];
    list.push(fact);
    byService.set(link.serviceId, list);
  }

  const services: PublicGovService[] = input.services.map((s) => {
    const facts = byService.get(s.id) || [];

    const counts: Record<string, number> = {};
    const labels = new Map<string, string>();
    for (const f of facts) {
      if (!f.industry) continue;
      const label = canonicalIndustry(f.industry);
      const key = label.toLowerCase();
      if (!labels.has(key)) labels.set(key, label);
      counts[labels.get(key) as string] = (counts[labels.get(key) as string] || 0) + 1;
    }

    const years = facts.map((f) => f.year).filter((y): y is number => typeof y === 'number');
    const freshest = years.length ? Math.max(...years) : null;

    /* The score is computed to pick a tier WORD and is then discarded: a
       contracting officer is told "Proven", never told "100". */
    const inside = facts.filter((f) => f.sourceKind === 'inside').length;
    const outside = facts.length - inside;
    const score = scoreServiceEvidence({
      insideCount: inside,
      outsideCount: outside,
      distinctIndustries: Object.keys(counts).length,
      newestEvidenceYear: freshest,
      currentYear: input.currentYear,
    });

    return {
      slug: deriveSlug(s.name),
      name: s.name,
      family: familyOf(s.category),
      tier: PUBLIC_TIER[evidenceTier(score.score)],
      description: s.description ?? null,
      naics: s.naicsCodes,
      psc: s.pscCodes,
      industries: Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b)),
      industryCounts: counts,
      caseStudies: facts.length,
      freshest,
      proven: facts.length > 0,
      caseStudyList: facts
        .map((f) => refFor(f, input.visibility))
        .sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title)),
    };
  });

  /* Families from the data, not a hardcoded list, so a seventh category cannot
     silently hide its services from the filter. */
  const families = [...new Set(services.map((s) => s.family))].sort();

  return {
    asOf: input.asOf,
    families,
    services: services.sort(
      (a, b) => Number(b.proven) - Number(a.proven)
        || b.caseStudies - a.caseStudies
        || a.name.localeCompare(b.name),
    ),
  };
}

/* ------------------------------------------------------------------- load -- */

/**
 * The whole public catalog for the government page.
 *
 * Returns null when the government container cannot be resolved, which the
 * route turns into a 503 rather than an empty catalog: "we have no services" is
 * a damaging thing to tell a contracting officer by accident.
 */
export async function getPublicGovCatalog(now: Date = new Date()): Promise<PublicGovCatalog | null> {
  const { lookupGovContractsContainer } = await import('../../scripts/lib/factoryDemoContainer');
  const container = await lookupGovContractsContainer();
  if (!container) return null;

  /* ACTIVE ONLY. `growth` means "in development, excluded from fit matching",
     and such a service has no business on a public page. */
  const services = await loadTenantServices(container.tenant.id, 'active');
  if (!services.length) {
    return { asOf: now.toISOString().slice(0, 10), families: [], services: [] };
  }

  const links = await loadLinksInto(services.map((s) => s.id), ['confirmed']);
  const ids = [...new Set(links.map((l) => l.caseStudyId))];
  const caseStudies = await loadCaseStudyFacts(ids, now.getUTCFullYear());
  const visibility = await loadPublicVisibility(
    [...caseStudies.values()].map((f) => f.slug).filter((x): x is string => Boolean(x)),
  );

  return buildPublicCatalog({
    services,
    links: links.map((l) => ({ caseStudyId: l.caseStudyId, serviceId: l.serviceId })),
    caseStudies,
    visibility,
    currentYear: now.getUTCFullYear(),
    asOf: now.toISOString().slice(0, 10),
  });
}
