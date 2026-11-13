/**
 * hireCaseStudyOnly - Hire shows a person's work ONLY through approved, Hire-published case
 * studies (Ali, 2026-11-11: "We should only show projects in hire.refactored.ai that are
 * approved case study's only. No projects they are working on or that haven't been converted.").
 *
 * WHY THIS IS NEEDED. The Hire portfolio is the learner's public portfolio projection, and that
 * projection lists every project the reviewed identity froze. On 2026-11-11 three live Hire pages
 * carried work that was never a case study: two of Swati Raman's projects (rendered as "Case study
 * in review" cards), one of Obi Anamelechi's, and all ten of Obi's "verified commits", which came
 * from that same unconverted project's repository.
 *
 * THE RULE, applied to every field that names a project or points into its repository:
 *   - projects and records survive only when their case_study_slug is published on Hire;
 *   - the repositories of the surviving projects are the only repositories Hire may point into,
 *     so verified commits, the repository list and the featured capstone are restricted to them.
 * Fields that name no project (about, experience, capabilities, stats) are untouched, as is the
 * private repository COUNT, which is a number and never an identity.
 *
 * PURE and applied at the API boundary (getHirePortfolio), so the data never leaves the server;
 * the hire site's own filter is a second layer, not the guard. The enterprise portfolio, which is
 * a different surface with a different audience, is not affected.
 */

/** The fields of a public portfolio this rule reads. Everything else passes through untouched. */
export interface CaseStudyOnlyInput {
  readonly projects?: readonly { readonly case_study_slug?: string | null; readonly repo_url?: string | null }[];
  readonly records?: readonly { readonly case_study_slug?: string | null }[];
  readonly verified_commits?: readonly { readonly commit_url?: string | null }[];
  readonly repositories?: readonly { readonly url?: string | null }[];
  readonly featured?: { readonly repo_url?: string | null } | null;
}

/** `https://github.com/Owner/Repo.git/` and `https://github.com/owner/repo` are one repository. */
export function repoKey(url: unknown): string {
  if (typeof url !== 'string') return '';
  return url.trim().toLowerCase().replace(/\/+$/, '').replace(/\.git$/, '');
}

/** The repository a commit URL points into: everything before `/commit/`. */
export function commitRepoKey(commitUrl: unknown): string {
  if (typeof commitUrl !== 'string' || !commitUrl.includes('/commit/')) return '';
  return repoKey(commitUrl.split('/commit/')[0]);
}

const published = (slug: unknown, slugs: ReadonlySet<string>): boolean =>
  typeof slug === 'string' && slug.length > 0 && slugs.has(slug);

export function restrictToHireCaseStudies<T extends CaseStudyOnlyInput>(portfolio: T, hireSlugs: ReadonlySet<string>): T {
  const projects = (portfolio.projects ?? []).filter((p) => published(p?.case_study_slug, hireSlugs));
  const repos = new Set(projects.map((p) => repoKey(p.repo_url)).filter(Boolean));
  const inRepos = (url: unknown): boolean => repos.has(repoKey(url));
  const featured = portfolio.featured && inRepos(portfolio.featured.repo_url) ? portfolio.featured : null;
  return {
    ...portfolio,
    projects,
    records: (portfolio.records ?? []).filter((r) => published(r?.case_study_slug, hireSlugs)),
    verified_commits: (portfolio.verified_commits ?? []).filter((c) => repos.has(commitRepoKey(c?.commit_url))),
    repositories: (portfolio.repositories ?? []).filter((r) => inRepos(r?.url)),
    featured,
    // Every field above is the input's own element type, filtered; nothing is added or reshaped.
  } as T;
}
