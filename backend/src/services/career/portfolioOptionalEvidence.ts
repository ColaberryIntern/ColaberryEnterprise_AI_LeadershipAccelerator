/**
 * portfolioOptionalEvidence - the three lookups a public portfolio page WANTS but can live
 * without, and the single policy that governs all of them.
 *
 * SPLIT OUT OF `careerPortfolioPageService.ts` when adding the reachability check pushed it
 * to 520 lines, past CLAUDE.md's 500-line ceiling.
 *
 * ## The policy, in one place instead of three
 *
 * Each of these enriches the page and none of them is the page. A case study link that will
 * not resolve, a commit list the database will not return, a GitHub call that times out:
 * every one of them costs the reader a section and none of them is allowed to cost a named
 * person their whole portfolio. So each is caught separately, logged with its own event name
 * and `error_class`, and degrades to the empty value for its own slot.
 *
 * Catching them one at a time rather than wrapping the group is the point. A single try
 * around all three would let the first failure delete the other two, which is how a page
 * ends up silently missing evidence that was available the whole time.
 */
import { caseStudyLinksForProjects } from './portfolioCaseStudyLinks';
import {
  verifiedCommitsForEnrollment, VERIFIED_COMMITS_SQL, type PublicVerifiedCommit,
} from './portfolioVerifiedCommits';
import { reachablePublicRepos } from './portfolioRepoReachability';

export interface OptionalEvidence {
  /** project_id -> case study slug. Empty when none resolve. */
  caseStudyByProject: Record<string, string>;
  /** Verified stories with a checkable commit link. Empty when the query fails. */
  verifiedCommits: PublicVerifiedCommit[];
  /** Repository URLs a logged-out stranger can open. Empty when GitHub cannot be reached. */
  reachableRepoUrls: Set<string>;
}

/** One SQL runner, injected so this is testable without a database. */
export type RowQuery = (sql: string, enrollmentId: string) => Promise<any[]>;

function warn(event: string, err: any, enrollmentId: string, at: Date): void {
  console.warn(JSON.stringify({
    timestamp: at.toISOString(), level: 'warn', service: 'backend',
    event, outcome: 'partial',
    error_class: err?.error_class || err?.name || 'Error',
    context: { enrollment_id: enrollmentId },
  }));
}

/**
 * Gather all three. Never throws.
 *
 * `repoUrls` comes from the profile and may be any mix of the two shapes `getCareerProfile`
 * has emitted over time, plus junk; `reachablePublicRepos` normalizes and discards.
 */
export async function gatherOptionalEvidence(args: {
  enrollmentId: string;
  projects: unknown[];
  repoUrls: unknown[];
  query: RowQuery;
  now: Date;
}): Promise<OptionalEvidence> {
  const { enrollmentId, projects, repoUrls, query, now } = args;

  let caseStudyByProject: Record<string, string> = {};
  try {
    // A case study that cannot be resolved costs its link, never the page.
    caseStudyByProject = await caseStudyLinksForProjects(projects as any);
  } catch (err: any) {
    warn('public_portfolio_case_study_unavailable', err, enrollmentId, now);
  }

  let verifiedCommits: PublicVerifiedCommit[] = [];
  try {
    // Losing the links costs the page its strongest evidence, never the page itself.
    verifiedCommits = await verifiedCommitsForEnrollment(
      enrollmentId, (id) => query(VERIFIED_COMMITS_SQL, id),
    );
  } catch (err: any) {
    warn('public_portfolio_verified_commits_unavailable', err, enrollmentId, now);
  }

  // WHICH REPOSITORIES A STRANGER CAN ACTUALLY OPEN, asked of GitHub rather than read from a
  // stored flag that does not exist anywhere in the schema. One answer decides two things
  // downstream: which repositories the page names, and which commits it links.
  //
  // On failure the set is empty, which names no repository and emits no commit link. That is
  // the right way round: a reader who sees nothing is better served than one who clicks a
  // 404 we promised them.
  let reachableRepoUrls = new Set<string>();
  try {
    reachableRepoUrls = await reachablePublicRepos(repoUrls);
  } catch (err: any) {
    warn('public_portfolio_repo_reachability_unavailable', err, enrollmentId, now);
  }

  return { caseStudyByProject, verifiedCommits, reachableRepoUrls };
}
