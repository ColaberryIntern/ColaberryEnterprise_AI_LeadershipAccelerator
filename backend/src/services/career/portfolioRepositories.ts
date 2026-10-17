/**
 * portfolioRepositories - which repositories a public page names, and which it only counts.
 *
 * SPLIT OUT OF `careerPortfolioPublicProjection.ts`, which sat at 482 lines against
 * CLAUDE.md's 500-line ceiling. This rule was the next thing to change, so it moved first.
 *
 * ## The defect this fixes, measured on the live page
 *
 * `getCareerProfile` emits each repository as `{ repo_url, repo_name, repo_owner, language,
 * file_count, last_sync_at }`. The projection read `r.html_url ?? r.url` and `r.name`. Those
 * keys do not exist in that shape, so EVERY repository fell through to the private counter.
 *
 * Fetched from production on 2026-10-17, with no login, for the one published page:
 *
 *     GET /api/public/portfolios/quincy-nkwain-ninying
 *     repositories             : []
 *     private_repository_count : 4
 *
 * All four of that learner's repositories are public and synced that morning, and 14 commits
 * inside three of them answered 200 to an anonymous request. The page was telling a hiring
 * manager the opposite of the truth about a named person, in the direction that makes them
 * look like they have shipped nothing.
 *
 * ## Why reachability is measured rather than read
 *
 * Fixing the key names alone would swing the error the other way: every connected repository
 * would be NAMED, including any that is private, because this shape carries no privacy flag
 * at all and `github_connections` has no column for one either. A repository name is itself a
 * disclosure, so that is not a safe default.
 *
 * So the caller measures it. `reachable` is the set of repository URLs a logged-out stranger
 * can actually open, from `portfolioRepoReachability`. A repository is named here only if it
 * is in that set, which makes the disclosure provably zero: this page names nothing a reader
 * could not already open for themselves.
 *
 * `reachable` is OPTIONAL and omitting it keeps the old stored-flag behavior. That is what
 * lets the pure projection stay pure and testable: the network lives in the caller.
 */
import { str, httpUrl } from './portfolioReaders';

export interface PublicRepository {
  name: string;
  url: string;
}

export interface RepositorySplit {
  repositories: PublicRepository[];
  /** Work that exists behind a repository a reader cannot open. A count, never an identity. */
  privateCount: number;
}

/** The name to show, in the order the two profile shapes supply it. */
function repoName(r: any): string {
  return str(r.repo_name) ?? str(r.name) ?? 'repository';
}

/** The URL, from either shape. `repo_url` is what `getCareerProfile` actually emits. */
function repoUrl(r: any): string | null {
  return httpUrl(r.repo_url ?? r.html_url ?? r.url);
}

/**
 * Split the connected repositories into the ones this page names and a count of the rest.
 *
 * With `reachable` supplied, that set is the ONLY authority: a repository in it is named, and
 * everything else is counted. The stored flags are not consulted, because they were the thing
 * that could not be trusted. Without it, the old rule applies.
 */
export function buildRepositories(
  rawRepos: unknown,
  reachable?: ReadonlySet<string>,
): RepositorySplit {
  const rows: any[] = Array.isArray(rawRepos) ? rawRepos : [];
  const repositories: PublicRepository[] = [];
  const seen = new Set<string>();
  let privateCount = 0;

  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const url = repoUrl(r);
    if (!url) { privateCount += 1; continue; }

    const canName = reachable
      ? reachable.has(url.replace(/\.git$/i, '').replace(/\/+$/, ''))
      : !(r.private === true || r.visibility === 'private');
    if (!canName) { privateCount += 1; continue; }

    // Two connection rows for one repository is one repository, not two, and it must not
    // inflate the count either way.
    if (seen.has(url)) continue;
    seen.add(url);
    repositories.push({ name: repoName(r), url });
  }

  return { repositories, privateCount };
}
