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
 * The student's workspace repo for this project, or null when there is not one
 * the platform can write to yet.
 *
 * "Not yet" covers two mid-connect states as well as "never had one". A repo
 * awaiting the student's proof push is a candidate, not a binding — nothing is
 * bound until the proof lands, so `repo_owner`/`repo_name` are still empty. A
 * just-provisioned repo is worse, because owner and name ARE set while the repo
 * has no branch for a commit to sit on until the student pushes; writing into it
 * fails at the GitHub boundary with a 404 on a missing ref.
 *
 * The writability test lives HERE rather than at either call site on purpose.
 * Publishing happens on two paths — the HTTP route and the orchestrator's
 * automatic publish — and a guard on only one of them is precisely the drift
 * this module was extracted to prevent. Auto-publish runs unattended on every
 * finished wizard, so it is the path that must not be the one missing the check.
 *
 * Never throws for "there isn't one": callers treat null as "publish without
 * writing documents", which is a supported outcome (`awaiting_repo`).
 */
export async function repoForProject(projectId: string): Promise<WorkspaceRepo | null> {
  const { GitHubConnection } = await import('../../models');
  const conn = await GitHubConnection.findOne({ where: { project_id: projectId } });
  const { isWritableConnection } = await import('./repoConnect/repoConnectService');
  if (!isWritableConnection(conn)) return null;
  const owner = conn?.repo_owner;
  const repo = conn?.repo_name;
  // isWritableConnection already rejects a missing owner/name; this keeps the
  // types honest and the function total if that ever changes.
  if (!owner || !repo) return null;
  return { owner, repo, url: conn?.repo_url || `https://github.com/${owner}/${repo}` };
}
