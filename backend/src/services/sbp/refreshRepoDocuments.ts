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
import { getPublishedPlan } from './planStore';
import { repoForProject } from './workspaceRepo';
import { writeDocsToRepo, readRepoManifest, RepoWriteError } from './repoWriter';
import { ensureGovPlanPublishedForSync } from './govPlanForSync';
import { renderProjectDocs } from './renderProjectDocs';

export type RefreshOutcome =
  | 'written'          // files changed and were committed
  | 'unchanged'        // nothing differed — the idempotency guarantee holding
  | 'no_plan'
  | 'no_repo'
  | 'no_enrollment'
  | 'pull_only'        // the platform has read-only access — docs can't be pushed (a known state, not a failure)
  | 'write_failed';

export interface RefreshResult {
  outcome: RefreshOutcome;
  commit_sha: string | null;
  changed_paths: string[];
  /** Set when `outcome` is `write_failed` or `pull_only` (the GitHub error class, e.g. `NoPushAccess`). */
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
    // Gov builds publish their plan only when the gov cockpit view is opened, so a repo sync must
    // publish it itself — otherwise a gov student who clicks "Sync from GitHub" gets no_plan forever
    // and their repo is never written. Idempotent, gated to gov builds, best-effort.
    await ensureGovPlanPublishedForSync(projectId, opts.correlationId ?? null);

    // The plan is checked before the repo, as it always was, so a project with neither reports
    // no_plan rather than no_repo.
    const stored = await getPublishedPlan(projectId);
    if (!stored) return result('no_plan');

    const repo = await repoForProject(projectId);
    if (!repo) return result('no_repo');

    // Every render input (schedule, progress, truth, write access, domain override, demo flag)
    // is gathered in ONE place now, shared with the platform-hosted Command Center so the two
    // can never render different files for the same project. See renderProjectDocs.ts.
    const rendered = await renderProjectDocs(projectId, {
      repoUrl: repo.url, correlationId: opts.correlationId, govPlanEnsured: true,
    });
    if (!rendered) return result('no_plan');
    // The schedule is looked up by enrollment, and the progress snapshot needs it for Builder
    // XP. Without one we can still write plan data, so this is a degraded pass, not a refusal.
    if (!rendered.enrollmentId) {
      log('sbp_doc_refresh_no_enrollment', opts.correlationId, 'partial', { projectId });
    }
    const files = rendered.files;

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

    /**
     * A REFUSAL IS EVIDENCE, AND IT MUST BE RECORDED.
     *
     * This is the moment the platform learns, from GitHub itself, that it cannot
     * write to this repo — and until now it threw that away. The connection went
     * on claiming writability, the next sync queued the same doomed commit, and
     * the student's side of it was total silence: no documents, no warning, no
     * reason given. Meanwhile `writeAccessOf` kept answering `null`, so the
     * read-only warning shipped on 2026-08-17 rendered for nobody.
     *
     * Only `NoPushAccess` is recorded. A timeout, a rate limit or a 5xx says
     * nothing about permissions, and demoting a working build on one of those
     * would break it to fix a reporting problem.
     *
     * Recording is best-effort and swallowed: this function's contract is that
     * it NEVER throws, and a bookkeeping write must not be the thing that
     * finally breaks that.
     */
    if (errorClass === 'NoPushAccess') {
      try {
        const { recordWriteAccess } = await import('./repoConnect/repoConnectService');
        const changed = await recordWriteAccess(projectId, false);
        log('sbp_doc_refresh_recorded_pull_only', opts.correlationId, 'partial', { projectId, changed });
      } catch (recordErr: any) {
        log('sbp_doc_refresh_record_failed', opts.correlationId, 'failure', {
          projectId, error_class: recordErr?.name ?? 'Error',
        });
      }
      // Pull-only is a KNOWN, CORRECT state, not a failure: GitHub told us the platform can only READ this repo,
      // so the docs genuinely cannot be pushed. Return a distinct `pull_only` outcome (not the generic
      // `write_failed`) so the caller treats it as a clear state and surfaces the read-only guidance, instead of
      // reporting it as an error the student can do nothing with.
      return result('pull_only', { error_class: errorClass });
    }

    return result('write_failed', { error_class: errorClass });
  }
}
