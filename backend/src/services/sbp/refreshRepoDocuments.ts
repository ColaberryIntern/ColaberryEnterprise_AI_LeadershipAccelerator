/**
 * refreshRepoDocuments — re-write the student's data files after a sync.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Publishing wrote the documents once and nothing rewrote them afterwards. That
 * was fine while the files held only PLAN data, which changes only when a plan
 * is republished. It stopped being fine the moment `.colaberry/progress.json`
 * started carrying BUILD PROGRESS: a student can verify six stories over three
 * weeks without ever republishing, and under the old arrangement their Command
 * Center would still be rendering the day they published.
 *
 * Sync is the right moment. It is already the trigger for the verification loop
 * — the run that decides what is verified — so writing the result back costs one
 * more GitHub call at the point we have the freshest possible answer, and needs
 * no new button for a student to learn.
 *
 * ── WHY THIS CANNOT LOOP ────────────────────────────────────────────────────
 *
 * Our commit is authored by the build bot and prefixed `chore(colaberry):`, and
 * a bot commit changes no story state, so the next verification run reaches the
 * same verdict and `changedFiles` finds nothing to write. The write is a fixed
 * point after one pass. The content-hash check is what guarantees that, which is
 * why every field in these files is required to be stable while the build is —
 * one wall-clock stamp in plan.json or progress.json and this becomes an
 * infinite commit generator.
 *
 * ── FAILURE POSTURE ─────────────────────────────────────────────────────────
 *
 * NEVER THROWS. The student asked for a sync; a failed document write must not
 * turn a successful pull into an error. Every outcome is classified and
 * returned, and the caller renders it beside the verification result.
 */
import { BuildPlan } from './planContract';
import { getPublishedPlan } from './planStore';
import { repoForProject } from './workspaceRepo';
import { renderDocs } from './renderDocs';
import { writeDocsToRepo, readRepoManifest, RepoWriteError } from './repoWriter';
import { loadBuildProgress } from './buildProgressSnapshot';
import { scheduleForEnrollment } from './scheduleForEnrollment';

export type RefreshOutcome =
  | 'written'          // files changed and were committed
  | 'unchanged'        // nothing differed — the idempotency guarantee holding
  | 'no_plan'
  | 'no_repo'
  | 'no_enrollment'
  | 'write_failed';

export interface RefreshResult {
  outcome: RefreshOutcome;
  commit_sha: string | null;
  changed_paths: string[];
  /** Set only when `outcome` is `write_failed`. */
  error_class: string | null;
}

export interface RefreshOptions {
  correlationId?: string;
  fetchImpl?: typeof fetch;
}

function log(event: string, correlationId: string | undefined, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-doc-refresh',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    context: ctx,
  }));
}

const result = (
  outcome: RefreshOutcome,
  extra: Partial<RefreshResult> = {},
): RefreshResult => ({
  outcome, commit_sha: null, changed_paths: [], error_class: null, ...extra,
});

/**
 * Refresh the data files for one project. Safe to call on every sync.
 */
export async function refreshRepoDocuments(
  projectId: string,
  opts: RefreshOptions = {},
): Promise<RefreshResult> {
  const startedAt = Date.now();
  try {
    const stored = await getPublishedPlan(projectId);
    if (!stored) return result('no_plan');

    const repo = await repoForProject(projectId);
    if (!repo) return result('no_repo');

    const { default: Project } = await import('../../models/Project');
    const project = await Project.findByPk(projectId);
    const enrollmentId = String((project as any)?.enrollment_id ?? '');
    // The schedule is looked up by enrollment, and the progress snapshot needs
    // it for Builder XP. Without one we can still write plan data, so this is a
    // degraded pass rather than a refusal.
    if (!enrollmentId) {
      log('sbp_doc_refresh_no_enrollment', opts.correlationId, 'partial', { projectId });
    }

    const plan = stored.plan as BuildPlan;
    const schedule = enrollmentId
      ? await scheduleForEnrollment(enrollmentId, plan, opts.correlationId ?? null)
      : null;
    const snapshot = await loadBuildProgress(projectId, enrollmentId || null);

    const files = renderDocs(plan, {
      repoUrl: repo.url,
      generatedAt: new Date().toISOString(),
      planVersion: stored.version,
      planSha256: stored.plan_sha256,
      correlationId: opts.correlationId,
      schedule,
      progress: snapshot.progress,
      baselineByStory: snapshot.baselineByStory,
    });

    const existingManifest = await readRepoManifest(
      { owner: repo.owner, repo: repo.repo },
      { correlationId: opts.correlationId, fetchImpl: opts.fetchImpl },
    );

    const write = await writeDocsToRepo(
      { owner: repo.owner, repo: repo.repo },
      files,
      existingManifest,
      { correlationId: opts.correlationId, fetchImpl: opts.fetchImpl },
    );

    log('sbp_doc_refresh_completed', opts.correlationId, 'success', {
      projectId,
      duration_ms: Date.now() - startedAt,
      committed: write.committed,
      changed: write.changedPaths.length,
      skipped: write.skippedUnchanged,
    });

    return result(write.committed ? 'written' : 'unchanged', {
      commit_sha: write.commitSha ?? null,
      changed_paths: write.changedPaths,
    });
  } catch (err: any) {
    const errorClass = err instanceof RepoWriteError ? err.error_class : (err?.name ?? 'Error');
    log('sbp_doc_refresh_failed', opts.correlationId, 'failure', {
      projectId, error_class: errorClass, message: err?.message,
    });
    return result('write_failed', { error_class: errorClass });
  }
}
