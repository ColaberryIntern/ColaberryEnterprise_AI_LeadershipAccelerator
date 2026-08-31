/**
 * repoTreeRefreshService — keep the platform's view of student repositories current.
 *
 * The selection rules and the reasoning behind a scheduled sweep live in
 * `repoTreeStaleness.ts`. This is the I/O shell around them: load the connections, sync
 * the ones that are due, and recompile any Capstone Record that already exists so the
 * refreshed tree actually reaches the page.
 *
 * ## Failure-first
 *
 * | Concern | Behaviour |
 * |---|---|
 * | One repo fails | Caught per connection. The sweep continues; one bad repo costs that repo. |
 * | Rate limit | Hard cap per run (`limit`). Oldest-first selection means the backlog drains across runs. |
 * | Token expired / repo deleted | `syncFileTree` throws, logged with `error_class`, connection left untouched for the next sweep. |
 * | Recompile fails | Caught separately. A refreshed tree is still an improvement, so the sync is not rolled back. |
 * | Run overlaps a previous run | Guarded by `running`, because a sweep can outlive its interval. |
 *
 * ## Idempotency
 *
 * Re-running immediately is a no-op: a successful sync stamps `last_sync_at`, so the
 * second run finds nothing due. `syncFileTree` overwrites the stored tree rather than
 * appending, and `compileAndStore` already no-ops when the compiled record is unchanged.
 * There are no side effects outside our own cache -- notably, nothing is written to the
 * student's repository, which is what lets this run on read-only access.
 */
import cron, { type ScheduledTask } from 'node-cron';
import { RefreshCandidate, selectStale } from './repoTreeStaleness';

export interface RefreshSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  recompiled: number;
}

/** Default cadence and batch size. Six hours keeps a student's work at most a session old. */
export const DEFAULT_MAX_AGE_HOURS = 6;
export const DEFAULT_LIMIT = 25;
const DEFAULT_CRON = '17 */6 * * *'; // offset from the hour so it does not pile onto other jobs

function log(event: string, outcome: string, context: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'repo-tree-refresh',
    event,
    outcome,
    ...context,
  }));
}

/**
 * Recompile a student's Capstone Record so a refreshed tree reaches the page.
 *
 * ONLY updates a record that already exists. Creating one is a different decision with a
 * publishing surface attached, and a background sweep is the wrong place to make it.
 */
async function recompileIfRecordExists(enrollmentId: string): Promise<boolean> {
  const { default: Project } = await import('../../models/Project');
  const project: any = await Project.findOne({ where: { enrollment_id: enrollmentId } });
  if (!project) return false;

  const { default: CapstoneRecord } = await import('../../models/CapstoneRecord');
  const existing: any = await CapstoneRecord.findOne({ where: { project_id: project.id } });
  if (!existing) return false;

  const { compileAndStore } = await import('../capstone/capstoneRecordStore');
  const result = await compileAndStore(project.id);
  return result.outcome === 'updated';
}

/**
 * Sweep the stale connections once.
 *
 * Exported so it can be triggered by hand (an admin route, a one-off script) without
 * waiting for the cron, which is what someone diagnosing a specific student will want.
 */
export async function refreshStaleRepoTrees(opts?: {
  maxAgeHours?: number;
  limit?: number;
}): Promise<RefreshSummary> {
  const maxAgeHours = opts?.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const summary: RefreshSummary = { attempted: 0, succeeded: 0, failed: 0, recompiled: 0 };

  const { default: GitHubConnection } = await import('../../models/GitHubConnection');
  const rows: any[] = await GitHubConnection.findAll().catch((err: any) => {
    log('repo_tree_refresh_load_failed', 'failure', { error_class: err?.name ?? 'Error' });
    return [];
  });

  const candidates: RefreshCandidate[] = rows
    // A connection with no owner/name cannot be synced; selecting it would burn a slot
    // in the capped batch on a call that must fail.
    .filter((r) => r?.enrollment_id && r?.repo_owner && r?.repo_name)
    .map((r) => ({ enrollmentId: String(r.enrollment_id), lastSyncAt: r.last_sync_at ?? null }));

  const due = selectStale(candidates, new Date(), { maxAgeHours, limit });
  if (due.length === 0) {
    log('repo_tree_refresh_swept', 'success', { ...summary, considered: candidates.length });
    return summary;
  }

  const { syncFileTree } = await import('../githubService');

  for (const enrollmentId of due) {
    summary.attempted += 1;
    const startedAt = Date.now();
    try {
      const { fileCount } = await syncFileTree(enrollmentId);
      summary.succeeded += 1;
      log('repo_tree_refreshed', 'success', {
        enrollment_id: enrollmentId, file_count: fileCount, duration_ms: Date.now() - startedAt,
      });

      // Separate try: a refreshed tree is worth keeping even if the recompile fails.
      try {
        if (await recompileIfRecordExists(enrollmentId)) summary.recompiled += 1;
      } catch (err: any) {
        log('capstone_recompile_failed', 'failure', {
          enrollment_id: enrollmentId, error_class: err?.name ?? 'Error', error: err?.message,
        });
      }
    } catch (err: any) {
      summary.failed += 1;
      log('repo_tree_refresh_failed', 'failure', {
        enrollment_id: enrollmentId, error_class: err?.name ?? 'Error', error: err?.message,
        duration_ms: Date.now() - startedAt,
      });
    }
  }

  log('repo_tree_refresh_swept', 'success', { ...summary, considered: candidates.length });
  return summary;
}

let task: ScheduledTask | null = null;
let running = false;

/**
 * Register the sweep. Safe to call twice: the second call is ignored rather than
 * doubling the schedule.
 *
 * `running` guards overlap. A sweep of 25 repositories can outlive a short interval, and
 * two concurrent sweeps would select the same oldest connections and sync them twice.
 */
export function startRepoTreeRefresh(schedule: string = DEFAULT_CRON): void {
  if (task) return;
  task = cron.schedule(schedule, async () => {
    if (running) {
      log('repo_tree_refresh_skipped', 'success', { reason: 'previous sweep still running' });
      return;
    }
    running = true;
    try {
      await refreshStaleRepoTrees();
    } catch (err: any) {
      // refreshStaleRepoTrees does not throw, so reaching here is a defect in it.
      log('repo_tree_refresh_crashed', 'failure', { error_class: err?.name ?? 'Error', error: err?.message });
    } finally {
      running = false;
    }
  });
  log('repo_tree_refresh_scheduled', 'success', { schedule, max_age_hours: DEFAULT_MAX_AGE_HOURS, limit: DEFAULT_LIMIT });
}

/** Stop the sweep. Used by tests and by a clean shutdown. */
export function stopRepoTreeRefresh(): void {
  if (!task) return;
  task.stop();
  task = null;
}
