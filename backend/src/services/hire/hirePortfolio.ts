/**
 * hirePortfolio - GET /api/public/portfolios/:slug?surface=hire, and the "Built by" link
 * on a hire case study.
 *
 * REACHABLE, NOT ONLY LISTED. A hire portfolio renders for a person who is published,
 * `public` OR `unlisted`, and has at least one visible Hire case study (SPEC §1). An
 * unlisted person is reachable by direct link and never appears in the directory; the
 * route sends noindex for them. Everyone else - unknown slug, private, draft, nobody
 * published to Hire - gets the same `null`, so the route's 404 cannot tell them apart.
 *
 * The portfolio itself is the public projection, built with case-study links resolved
 * against `hire` (not enterprise): a project links only when its case study is published
 * on Hire, which is the rule the hire site's project cards rely on.
 */
import CaseStudy from '../../models/CaseStudy';
import { getPublicPortfolioBySlug, type PublicPortfolioResult } from '../career/careerPortfolioPageService';
import { linkedPeopleForCaseStudy } from '../career/caseStudyLinkedPerson';
import { loadHireIndex } from './hireTalentIndex';
import { restrictToHireCaseStudies } from './hireCaseStudyOnly';
import { availabilityOf, signatureFor, type HireCaseStudyCard } from './hireTalentProjection';
import { readCaseStudyOrder, readPublicIntro, type PublicIntro } from './hireStudioSettings';
import { bookingSummary, type BookingSummary } from './hireInterviews';

export interface HirePortfolioBlock {
  readonly signature: HireCaseStudyCard | null;
  /** Every card carries its headline figure and its look; only the full outcome list stays on the signature. */
  readonly caseStudies: readonly Omit<HireCaseStudyCard, 'outcomes'>[];
  readonly availability: { readonly label: string; readonly kind: string } | null;
  readonly spotlight: boolean;
  /** True only for an explicit `public` opt-in. Unlisted pages stay noindex. */
  readonly indexable: boolean;
  /** The candidate's own words (kit §1.4). Null when they filled in nothing public. */
  readonly intro: PublicIntro | null;
  /** Their chosen carousel order, limited to slugs in `caseStudies`. */
  readonly caseStudyOrder: readonly string[];
  /** Interview booking (kit §1.5). `enabled: false` keeps today's Request intro. */
  readonly booking: BookingSummary;
}

const NO_BOOKING: BookingSummary = { enabled: false, nextSlots: [], formats: [] };

/**
 * The studio extras are OPTIONAL to the page: a failure to read any of them is logged and the
 * profile renders exactly as it did before Phase 2 (no card, Request intro). Never a 500.
 */
async function optional<T>(what: string, slug: string, fallback: T, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
      event: 'hire_portfolio_extra_unavailable', outcome: 'partial', error_class: e.name || 'Error',
      context: { what, slug, message: e.message.slice(0, 200) },
    }));
    return fallback;
  }
}

export interface HirePortfolioResult {
  readonly portfolio: PublicPortfolioResult['portfolio'];
  readonly hire: HirePortfolioBlock;
}

export async function getHirePortfolio(slug: string, now: Date = new Date()): Promise<HirePortfolioResult | null> {
  const [entry] = await loadHireIndex(['public', 'unlisted'], slug);
  if (!entry) return null;
  const result = await getPublicPortfolioBySlug(entry.page.slug, now, 'hire');
  if (!result) return null;
  const eid = entry.page.enrollment_id;
  const published = new Set(entry.cases.map((c) => c.slug));
  const [intro, order, booking] = await Promise.all([
    optional('intro', entry.page.slug, null, () => readPublicIntro(eid)),
    optional('case_study_order', entry.page.slug, [] as string[], () => readCaseStudyOrder(eid)),
    optional('booking', entry.page.slug, NO_BOOKING, () => bookingSummary(eid, now)),
  ]);
  return {
    // NO EMAIL ON HIRE (Ali, 2026-11-10). The enterprise portfolio keeps `identity.email`
    // (his 2026-09-03 decision: there the learner is the one being contacted). On Hire the
    // employer's route to a person is Request intro, and /intro/ promises "contact details
    // are never shown here", so the address is nulled before it leaves this surface.
    // CASE STUDIES ONLY (Ali, 2026-11-11). Projects, records, commits and repositories that are
    // not an approved, Hire-published case study never leave this surface. See hireCaseStudyOnly.
    portfolio: restrictToHireCaseStudies(
      { ...result.portfolio, identity: { ...result.portfolio.identity, email: null } },
      new Set(entry.cases.map((c) => c.slug)),
    ),
    hire: {
      // The candidate's ★ (the first case study in their saved order) leads their own profile;
      // with no saved order it is the admin-featured pick, exactly as before.
      signature: signatureFor(entry.cases, order),
      caseStudies: entry.cases.map(({ slug: s, title, summary, industry, featured, publishedAt, heroMetric, look }) => ({
        slug: s, title, summary, industry, featured, publishedAt, heroMetric, look,
      })),
      availability: availabilityOf(entry.facts),
      spotlight: entry.facts.hireSpotlight,
      indexable: entry.page.visibility === 'public' && result.indexable,
      intro,
      caseStudyOrder: order.filter((s) => published.has(s)),
      booking,
    },
  };
}

/**
 * The portfolio slug for the person who built this case study, IF they are reachable on
 * Hire (published, public or unlisted). `null` otherwise, and the chip renders unlinked.
 * Deterministic: the first reachable page in slug order.
 */
export async function builderPortfolioSlugFor(record: { id: string; project_id?: string | null }): Promise<string | null> {
  const people = await linkedPeopleForCaseStudy(record);
  const reachable = people.find((p) => p.status === 'published' && (p.visibility === 'public' || p.visibility === 'unlisted'));
  return reachable ? reachable.portfolioSlug : null;
}

/**
 * The same, from a public slug (the detail route has the slug, not the id). A failure is
 * logged and answered `null`: the "Built by" chip then renders unlinked, and the record
 * page itself is unaffected.
 */
export async function builderPortfolioSlugForCaseStudySlug(slug: string): Promise<string | null> {
  try {
    const study = await CaseStudy.findOne({ where: { slug }, attributes: ['id'] });
    return study ? await builderPortfolioSlugFor({ id: String(study.id) }) : null;
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
      event: 'hire_builder_slug_unavailable', outcome: 'partial', error_class: e.name || 'Error',
      context: { slug, message: e.message.slice(0, 200) },
    }));
    return null;
  }
}
