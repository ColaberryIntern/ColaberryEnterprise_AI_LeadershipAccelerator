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
import { availabilityOf, pickSignature, type HireCaseStudyCard } from './hireTalentProjection';

export interface HirePortfolioBlock {
  readonly signature: HireCaseStudyCard | null;
  /** Every card carries its headline figure and its look; only the full outcome list stays on the signature. */
  readonly caseStudies: readonly Omit<HireCaseStudyCard, 'outcomes'>[];
  readonly availability: { readonly label: string; readonly kind: string } | null;
  readonly spotlight: boolean;
  /** True only for an explicit `public` opt-in. Unlisted pages stay noindex. */
  readonly indexable: boolean;
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
  return {
    // NO EMAIL ON HIRE (Ali, 2026-11-10). The enterprise portfolio keeps `identity.email`
    // (his 2026-09-03 decision: there the learner is the one being contacted). On Hire the
    // employer's route to a person is Request intro, and /intro/ promises "contact details
    // are never shown here", so the address is nulled before it leaves this surface.
    portfolio: { ...result.portfolio, identity: { ...result.portfolio.identity, email: null } },
    hire: {
      signature: pickSignature(entry.cases),
      caseStudies: entry.cases.map(({ slug: s, title, summary, industry, featured, publishedAt, heroMetric, look }) => ({
        slug: s, title, summary, industry, featured, publishedAt, heroMetric, look,
      })),
      availability: availabilityOf(entry.facts),
      spotlight: entry.facts.hireSpotlight,
      indexable: entry.page.visibility === 'public' && result.indexable,
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
