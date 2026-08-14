/**
 * workspaceRepo — "which GitHub repo, if any, belongs to this project?"
 *
 * Extracted from sbpRoutes because publishing now happens on TWO paths: the
 * HTTP route a student (or an operator) can call, and the automatic publish at
 * the end of generation. Both need the same answer, and a second copy of this
 * lookup is exactly how the two paths would drift — one writing documents and
 * the other silently skipping them for the same project.
 *
 * Absent is a normal answer, not an error. A student whose repo has not been
 * provisioned yet still gets a published plan; the documents follow later.
 */

export interface WorkspaceRepo {
  owner: string;
  repo: string;
  url: string;
}

/**
 * The student's workspace repo for this project, or null when unprovisioned.
 *
 * Never throws for "there isn't one": callers treat null as "publish without
 * writing documents", which is a supported outcome (`awaiting_repo`).
 */
export async function repoForProject(projectId: string): Promise<WorkspaceRepo | null> {
  const { GitHubConnection } = await import('../../models');
  const conn = await GitHubConnection.findOne({ where: { project_id: projectId } });
  const owner = conn?.repo_owner;
  const repo = conn?.repo_name;
  if (!owner || !repo) return null;
  return { owner, repo, url: conn?.repo_url || `https://github.com/${owner}/${repo}` };
}
