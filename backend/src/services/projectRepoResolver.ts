/**
 * projectRepoResolver — the ONE place that answers "which repo is this project's?".
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * There were two stores for the same fact and they disagreed. `projects
 * .github_repo_url` is the older one; `github_connections.project_id` is the
 * one the Student Build Pipeline actually writes (SBP-GH-v1 FR-037, "one repo
 * per PROJECT", enforced by the partial unique index
 * `github_connections_unique_project`).
 *
 * Measured on production 2026-08-20: of the 16 connections that carry BOTH a
 * `project_id` and a `repo_url` — every one of them a live July-2026 cohort
 * student — exactly ZERO of their projects had `github_repo_url` populated.
 * Not "most were stale". None were ever written. The column is not lagging,
 * it was abandoned, and every caller reading it was asking the wrong table and
 * concluding the student had no repo.
 *
 * So this is deliberately NOT a backfill. Copying the connection's URL into the
 * project column would repopulate a store nothing writes, and it would drift
 * again the next time a student connected a repo. The connection is the record;
 * everything else reads through it.
 *
 * ── THE FALLBACK, AND WHY IT IS NOT PERMANENT ───────────────────────────────
 *
 * `project_column` remains as a fallback because a handful of older rows carry
 * a URL that predates the connection table and nothing else knows about them.
 * `source` is returned on every answer so a caller — or a cleanup job — can see
 * which rows still depend on it. When that count reaches zero the fallback and
 * the column can both go.
 *
 * PURE CORE: `decideRepoPointer` does the deciding and touches no I/O, so the
 * precedence rule is testable from literals rather than from a database.
 */
import GitHubConnection from '../models/GitHubConnection';

/** Where the answer came from. `none` means this project genuinely has no repo. */
export type RepoPointerSource = 'connection' | 'project_column' | 'none';

export interface RepoPointer {
  url: string | null;
  owner: string | null;
  name: string | null;
  source: RepoPointerSource;
}

/** The subset of a connection row this decision needs. */
export interface ConnectionFacts {
  repo_url?: string | null;
  repo_owner?: string | null;
  repo_name?: string | null;
}

const NONE: RepoPointer = { url: null, owner: null, name: null, source: 'none' };

/** Owner/name parsed from a GitHub URL, for legacy rows that stored only a URL. */
function parseOwnerName(url: string): { owner: string | null; name: string | null } {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  return { owner: match?.[1] ?? null, name: match?.[2] ?? null };
}

const blank = (s: string | null | undefined): boolean => !s || !s.trim();

/**
 * PURE. The precedence rule, in one place: a connection that carries a repo_url
 * wins; otherwise the project's legacy column; otherwise the project has no repo.
 *
 * A connection row that exists but has no `repo_url` is NOT an answer — that is
 * a student who authorised GitHub but never picked a repo, and treating it as
 * one would report a connected repo that does not exist.
 */
export function decideRepoPointer(
  connection: ConnectionFacts | null | undefined,
  legacyProjectUrl?: string | null,
): RepoPointer {
  if (connection && !blank(connection.repo_url)) {
    const url = connection.repo_url!.trim();
    // Older connection rows landed with blank owner/name even when the URL was
    // set (see githubService.connectRepo), so derive rather than trust.
    const parsed = parseOwnerName(url);
    return {
      url,
      owner: blank(connection.repo_owner) ? parsed.owner : connection.repo_owner!.trim(),
      name: blank(connection.repo_name) ? parsed.name : connection.repo_name!.trim(),
      source: 'connection',
    };
  }

  if (!blank(legacyProjectUrl)) {
    const url = legacyProjectUrl!.trim();
    const parsed = parseOwnerName(url);
    return { url, owner: parsed.owner, name: parsed.name, source: 'project_column' };
  }

  return { ...NONE };
}

/**
 * Resolve one project's repo. Pass the project's legacy column when the caller
 * already has the row loaded, so this costs one query rather than two.
 */
export async function resolveProjectRepo(
  projectId: string,
  legacyProjectUrl?: string | null,
): Promise<RepoPointer> {
  if (!projectId) return { ...NONE };
  const connection = await GitHubConnection.findOne({ where: { project_id: projectId } });
  return decideRepoPointer(connection as ConnectionFacts | null, legacyProjectUrl);
}

/**
 * Batch form. Admin list views render many projects at once and the per-project
 * variant would issue one query each — the N+1 that makes a 60-student cohort
 * page slow enough to notice.
 */
export async function resolveProjectRepos(
  projects: Array<{ id: string; github_repo_url?: string | null }>,
): Promise<Map<string, RepoPointer>> {
  const out = new Map<string, RepoPointer>();
  if (!projects.length) return out;

  const rows = await GitHubConnection.findAll({
    where: { project_id: projects.map((p) => p.id) },
  });
  const byProject = new Map<string, ConnectionFacts>();
  for (const row of rows) {
    const key = (row as any).project_id as string | null;
    if (key) byProject.set(key, row as ConnectionFacts);
  }

  for (const project of projects) {
    out.set(project.id, decideRepoPointer(byProject.get(project.id), project.github_repo_url));
  }
  return out;
}

/** Convenience for the many callers that only want the URL or nothing. */
export async function resolveProjectRepoUrl(
  projectId: string,
  legacyProjectUrl?: string | null,
): Promise<string | null> {
  return (await resolveProjectRepo(projectId, legacyProjectUrl)).url;
}
