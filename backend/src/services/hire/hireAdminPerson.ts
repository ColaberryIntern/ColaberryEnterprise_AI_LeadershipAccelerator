/**
 * hireAdminPerson - WHO a Hire publication of a record would list, for the admin.
 *
 * Two shapes, two costs:
 *   hirePersonForRecord   light (the link relation + one settings read): name, portfolio
 *                         slug, listed. On every record detail, for the HIRE publish row.
 *   linkedPersonForPreview  the person-first preview's full band and proof ledger, built
 *                         from the SAME reviewer-preview projection the portfolio review
 *                         uses (getPortfolioPreview) - so the admin sees what a stranger
 *                         would, and nothing more. Only on the HIRE preview.
 *
 * Both decorate a response the admin routes already build (`withHirePerson`,
 * `withLinkedPerson`) rather than growing caseStudyAdminService.ts (473 lines) or
 * caseStudyAdminReview.ts (628, over the ceiling).
 *
 * FAILURE-FIRST. A lookup failure is LOGGED and answered with `null` - the panel then
 * shows the "no person is linked" state - and never breaks the detail or the preview. That
 * is safe because the publish gate resolves the person itself and fails closed
 * (hire_no_linked_person), so a display failure can never let a publish through.
 */
import { linkedPeopleForCaseStudy, type LinkedPersonPage } from '../career/caseStudyLinkedPerson';
import { identityAdapter } from '../career/careerEvidenceAdapters';
import { getPortfolioPreview } from '../career/careerPortfolioPageService';
import { loadHireIndex } from './hireTalentIndex';
import { readHireListingSettings } from './hireListingSettings';

export interface CaseStudyHirePerson {
  readonly name: string;
  readonly portfolioSlug: string;
  readonly listed: boolean;
}

export interface CaseStudyLinkedPerson {
  readonly portfolioSlug: string;
  readonly pageStatus: string;
  readonly pageVisibility: string;
  readonly listed: boolean;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly role: string | null;
  readonly cohort: string | null;
  readonly availability: { readonly kind: string; readonly label: string } | null;
  readonly spotlight: boolean;
  readonly proof: {
    readonly publishedCaseStudies: number;
    readonly verifiedCommits: number;
    readonly capabilitiesProven: number;
    readonly filesCommitted: number | null;
  };
}

const isListed = (p: LinkedPersonPage): boolean => p.status === 'published' && p.visibility === 'public';
const isReachable = (p: LinkedPersonPage): boolean => p.status === 'published' && (p.visibility === 'public' || p.visibility === 'unlisted');

/** The page a Hire listing would show: listed first, then reachable, then anyone, by slug. */
export function pickPage(pages: readonly LinkedPersonPage[]): LinkedPersonPage | null {
  return pages.find(isListed) ?? pages.find(isReachable) ?? pages[0] ?? null;
}

function warn(event: string, caseStudyId: string, err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event, outcome: 'partial',
    error_class: e.name || 'Error', context: { case_study_id: caseStudyId, message: e.message.slice(0, 200) },
  }));
}

export async function hirePersonForRecord(caseStudyId: string): Promise<CaseStudyHirePerson | null> {
  const page = pickPage(await linkedPeopleForCaseStudy({ id: caseStudyId }));
  if (!page) return null;
  const identity = await identityAdapter(page.enrollmentId);
  return { name: identity?.full_name || page.portfolioSlug, portfolioSlug: page.portfolioSlug, listed: isListed(page) };
}

export async function linkedPersonForPreview(caseStudyId: string): Promise<CaseStudyLinkedPerson | null> {
  const page = pickPage(await linkedPeopleForCaseStudy({ id: caseStudyId }));
  if (!page) return null;
  const [{ portfolio }, settings, index] = await Promise.all([
    getPortfolioPreview(page.enrollmentId),
    readHireListingSettings(page.enrollmentId),
    isReachable(page) ? loadHireIndex(['public', 'unlisted'], page.portfolioSlug) : Promise.resolve([]),
  ]);
  const caps = Array.isArray(portfolio.capabilities) ? portfolio.capabilities : [];
  const files = portfolio.stats?.files_committed;
  return {
    portfolioSlug: page.portfolioSlug,
    pageStatus: page.status,
    pageVisibility: page.visibility,
    listed: isListed(page),
    name: portfolio.identity.full_name,
    avatarUrl: portfolio.identity.avatar_data_url ?? null,
    role: portfolio.identity.headline ?? null,
    cohort: portfolio.identity.cohort_name ?? null,
    availability: settings.availability ? { kind: settings.availability.status, label: settings.availability.label } : null,
    spotlight: settings.spotlight,
    proof: {
      publishedCaseStudies: index[0]?.cases.length ?? 0,
      verifiedCommits: Array.isArray(portfolio.verified_commits) ? portfolio.verified_commits.length : 0,
      capabilitiesProven: caps.filter((c) => c.proven === true).length,
      filesCommitted: typeof files === 'number' && Number.isFinite(files) ? files : null,
    },
  };
}

/** Decorate the admin detail with the HIRE row's person. Never throws. */
export async function withHirePerson<T extends object>(detail: T, caseStudyId: string): Promise<T & { hirePerson: CaseStudyHirePerson | null }> {
  try {
    return { ...detail, hirePerson: await hirePersonForRecord(caseStudyId) };
  } catch (err) {
    warn('case_study_hire_person_display_failed', caseStudyId, err);
    return { ...detail, hirePerson: null };
  }
}

/** Decorate a surface preview with the person-first band, on HIRE only. Never throws. */
export async function withLinkedPerson<T extends { surfaceKey: string }>(preview: T, caseStudyId: string): Promise<T & { linkedPerson?: CaseStudyLinkedPerson | null }> {
  if (preview.surfaceKey !== 'hire') return preview;
  try {
    return { ...preview, linkedPerson: await linkedPersonForPreview(caseStudyId) };
  } catch (err) {
    warn('case_study_hire_preview_person_failed', caseStudyId, err);
    return { ...preview, linkedPerson: null };
  }
}
