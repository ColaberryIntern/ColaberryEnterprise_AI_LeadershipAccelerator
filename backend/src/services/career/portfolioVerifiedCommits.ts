/**
 * portfolioVerifiedCommits - the per-commit deep link that makes verification checkable by a
 * stranger.
 *
 * SPLIT OUT OF `careerPortfolioPageService.ts`, which sits at 472 lines against CLAUDE.md's
 * 500-line ceiling and has split for this reason once before (`portfolioCaseStudyLinks.ts`).
 *
 * ## What this closes
 *
 * C5.0: "a stranger with a link can see, for one named learner and one story: what the story
 * asked for, the commit that satisfied it, and the verification result, without logging in and
 * without taking our word for it." C3.11 narrowed that: the public page already reaches the
 * REPOSITORY. What is missing is the per-commit link, so a reader cannot one-click confirm that
 * a specific award corresponds to a specific commit.
 *
 * ## The join is on PROJECT, and that is not a detail
 *
 * Measured against production on 2026-10-17:
 *
 *   joined on project_id     46 verified stories on published pages, 46 linkable
 *   joined on enrollment_id  182 verified stories on the same pages, 182 linkable
 *
 * The enrollment join inflates because 7 learners have between 2 and 6 repositories each, so it
 * fans out and would attach a commit to a repository that does not contain it. That link 404s
 * in front of exactly the hostile reader C5.0 says to assume. A wrong link is worse than no
 * link, so the join is `github_connections.project_id = projects.id` and never the enrollment.
 *
 * `projects.github_repo_url` is NOT used: it is null for all 29 projects carrying verified work,
 * measured the same day. Building on it would have shipped a feature that rendered nothing.
 *
 * ## The privacy decision, written down before building, as the ticket requires
 *
 * PUBLISHED: story id, story title, the commit sha, the commit date, the criteria passed and
 * the criteria total. Every one of these is either already public or is our own assessment.
 *
 * NEVER PUBLISHED: `reasons`, `outstanding` and `rejected_claims` from the verification record.
 * Those are the learner's failures, which is the same category as `readiness.blocking` that
 * this page already refuses to show a hiring manager. They have no shape to occupy below.
 *
 * ZERO DISCLOSURE DELTA, which is why this needed no consent change. A link is emitted only
 * from a `github_connections.repo_url` that is already on the public page. A private repository
 * has no public URL, so it yields no link, exactly as the existing projection already drops it.
 * A commit inside a repository a reader can already open is a fact that reader can already see;
 * this saves them a search rather than revealing anything. The proof requirement and the
 * privacy decision therefore do not conflict, and no escalation was needed.
 */

// ── The public shape. Nothing outside this reaches a reader. ──────────────

export interface PublicVerifiedCommit {
  /** The story identifier as the build pipeline knows it, e.g. STORY-007. */
  story_id: string;
  /** What the story asked for, in the learner's own task title. */
  title: string | null;
  /** Short form, for display beside the link. */
  commit_sha_short: string;
  /** When the work was committed, ISO-8601. Already visible in a public repository. */
  committed_at: string | null;
  /** Our assessment: how many of the story's criteria the commit satisfied. */
  criteria_passed: number | null;
  criteria_total: number | null;
  /** The deep link a stranger clicks. Always an https://github.com/ URL or absent. */
  commit_url: string;
}

/** A sha, not merely a string. Forty hex characters, or a short form of at least seven. */
const SHA = /^[0-9a-f]{7,40}$/i;

/**
 * The link, or null.
 *
 * Mirrors the guard `portfolioEvidence.composeFeatured` already applies to `repo_url`, so a
 * repository URL that is not GitHub cannot become a commit URL by a different route. A
 * trailing slash or a `.git` suffix is normalized rather than refused, because both appear in
 * stored connection rows and neither is a reason to deny a reader the evidence.
 */
export function buildCommitUrl(repoUrl: unknown, sha: unknown): string | null {
  if (typeof repoUrl !== 'string' || typeof sha !== 'string') return null;
  const s = sha.trim();
  if (!SHA.test(s)) return null;
  const base = repoUrl.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(base)) return null;
  return `${base}/commit/${s.toLowerCase()}`;
}

/** A positive integer, or null. Matches the `positive` helper in portfolioEvidence. */
const count = (v: unknown): number | null =>
  (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

/** An ISO string, or null. A junk date renders nothing rather than an Invalid Date. */
function isoOrNull(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export interface VerifiedCommitRow {
  story_id?: unknown;
  title?: unknown;
  repo_url?: unknown;
  verification_json?: unknown;
}

/**
 * One row to one public commit, or null.
 *
 * Returns null unless the record says `verified`. A row that was checked and FAILED must never
 * become a link: the page would be citing, as evidence, a commit the pipeline rejected.
 */
export function toPublicVerifiedCommit(row: VerifiedCommitRow): PublicVerifiedCommit | null {
  const v = row?.verification_json;
  if (!v || typeof v !== 'object') return null;
  const j = v as Record<string, unknown>;
  if (j.state !== 'verified') return null;

  const url = buildCommitUrl(row.repo_url, j.commit_sha);
  if (!url) return null;

  const storyId = typeof row.story_id === 'string' ? row.story_id.trim() : '';
  if (!storyId) return null;

  const sha = String(j.commit_sha);
  return {
    story_id: storyId,
    title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : null,
    commit_sha_short: sha.slice(0, 7).toLowerCase(),
    committed_at: isoOrNull(j.commit_at),
    criteria_passed: count(j.criteria_passed),
    criteria_total: count(j.criteria_total),
    commit_url: url,
  };
}

/**
 * Keep only the commits that live in a repository a stranger can actually open.
 *
 * WITHOUT THIS, 1 OF THE 129 LINKS THIS FEATURE WOULD PUBLISH IS DEAD. Probed anonymously on
 * 2026-10-17 with controls at both ends of the run: 128 returned 200 and
 * `baidhani/HomeHub` returned 404 at the commit AND at the repository root, so the whole
 * repository is private or deleted. `github_connections` records nothing that would have
 * predicted it; its only tell is a `last_sync_at` five weeks behind every sibling.
 *
 * NO SET MEANS NO LINKS. A caller that has not measured reachability gets an empty list
 * rather than an unchecked one, because the ticket's reader is assumed hostile and an
 * unchecked link is exactly what they are looking for.
 */
export function restrictCommitsToRepos(
  commits: PublicVerifiedCommit[] | undefined,
  reachable: ReadonlySet<string> | undefined,
): PublicVerifiedCommit[] {
  if (!Array.isArray(commits) || !commits.length || !reachable) return [];
  return commits.filter((c) => {
    const base = typeof c?.commit_url === 'string'
      ? c.commit_url.split('/commit/')[0] : '';
    return !!base && reachable.has(base);
  });
}

/** Injected so the rule is testable without a database, as portfolioCaseStudyLinks is. */
export type VerifiedCommitQuery = (enrollmentId: string) => Promise<VerifiedCommitRow[]>;

/**
 * Every verified story for an enrollment that a stranger can check, newest commit first.
 *
 * ## The dedupe key is the story AND its commit, and that is not a nicety
 *
 * `story_id` is scoped to a project, not to a learner. Measured for the one published page
 * on 2026-10-17: 45 verified rows carry just 14 distinct story ids, because every project
 * numbers its own stories from STORY-001. That one id names four entirely different pieces
 * of work:
 *
 *   STORY-001  066d9b2  HosPulse              Import CMS HCRIS Data
 *   STORY-001  8c371ac  relay                 Process a job with idempotency
 *   STORY-001  b55c117  ai-operations-center  Implement human approval workflow
 *   STORY-001  25c54db  ambit                 Issue and enforce a token
 *
 * Keyed on `story_id` alone this publishes 14 of 45 and silently discards 31, leaving three
 * of that learner's four projects showing nothing at all. Keyed on the story AND the commit
 * it publishes all 45, and two identical connection rows still collapse to one, which is
 * what the dedupe was for in the first place.
 *
 * Not keyed on the sha alone either: two stories in this same set share commit `cbac954`,
 * one build satisfying both, and they are two awards rather than one.
 */
export async function verifiedCommitsForEnrollment(
  enrollmentId: string,
  query: VerifiedCommitQuery,
): Promise<PublicVerifiedCommit[]> {
  if (!enrollmentId) return [];
  const rows = await query(enrollmentId);
  const out: PublicVerifiedCommit[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(rows) ? rows : []) {
    const c = toPublicVerifiedCommit(r);
    if (!c) continue;
    const key = `${c.story_id}|${c.commit_url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  out.sort((a, b) => String(b.committed_at ?? '').localeCompare(String(a.committed_at ?? '')));
  return out;
}

/**
 * The SQL. Kept beside the rule it feeds so the project join cannot drift from the comment
 * explaining why it is a project join.
 */
export const VERIFIED_COMMITS_SQL = `
  SELECT st.story_id, st.title, gc.repo_url, st.verification_json
    FROM projects pr
    JOIN student_tasks st ON st.project_id = pr.id
    JOIN github_connections gc ON gc.project_id = pr.id
   WHERE pr.enrollment_id = $1
     AND st.verified_by = 'build_pipeline:repo_verification'
     AND st.verification_json IS NOT NULL
`;
