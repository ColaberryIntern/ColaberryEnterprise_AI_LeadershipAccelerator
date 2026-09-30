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
 * One structured line per refusal, so a skipped write stops being invisible.
 *
 * Returning `null` is a supported outcome and always has been — but it is also
 * how the read-only cohort hid. Eleven students' repos refused every commit the
 * platform queued for nine months and the only trace was a `no_repo` outcome
 * downstream, identical to a student who had simply not connected one yet. The
 * reason is the whole value: `access_unknown` is a bug in our bookkeeping,
 * `pull_only` is the student's deliberate choice, and they need different
 * responses.
 *
 * Same shape as the sibling loggers in `refreshRepoDocuments` and
 * `scheduleForEnrollment`: JSON to stdout, captured by the container runtime.
 */
function logRefusal(projectId: string, reason: string): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: reason === 'access_unknown' ? 'warn' : 'info',
    service: 'sbp-workspace-repo',
    event: 'sbp_repo_write_refused',
    correlation_id: null,
    outcome: 'partial',
    context: { projectId, reason },
  }));
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
  const { writeBlockReason } = await import('./repoConnect/repoConnectService');

  // Asked as a REASON rather than a boolean. Same decision — `isWritableConnection`
  // is now exactly `writeBlockReason(...) === null` — but the refusal arrives
  // with its cause attached, which is the difference between a silent skip and
  // an operable signal.
  const blocked = writeBlockReason(conn);
  if (blocked) {
    logRefusal(projectId, blocked);
    return null;
  }

  const owner = conn?.repo_owner;
  const repo = conn?.repo_name;
  // writeBlockReason already rejects a missing owner/name; this keeps the
  // types honest and the function total if that ever changes.
  if (!owner || !repo) return null;
  return { owner, repo, url: conn?.repo_url || `https://github.com/${owner}/${repo}` };
}
