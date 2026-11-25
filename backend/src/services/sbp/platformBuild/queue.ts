/**
 * platformBuild/queue - the one call publish makes: "build this project's Command Center and Demo".
 *
 * NEVER THROWS. A plan that published must stay published; a build that could not be queued is
 * logged with its reason and recorded as a failed run, and the next publish tries again.
 *
 * ## When it does nothing (and says why)
 *
 *   flag_off                 SBP_PLATFORM_BUILD does not cover this enrollment
 *   already_built_or_running the project already has a live run (queued, dispatched, building
 *                            or uploaded). A republish does NOT rebuild: the Command Center reads
 *                            its plan, progress and schedule LIVE from the platform, so a new plan
 *                            version is already reflected without spending another run.
 *   attempts_exhausted       3 failed runs for this project. Recovery is manual: fix the cause,
 *                            then delete the failed rows (see directives/platform_build.md).
 */
import { env } from '../../../config/env';
import { connectedDemoEnabledFor } from '../connectedDemoFlag';
import { queueRun, countFailedRuns, transitionRun, failStaleRuns } from './runStore';
import { dispatchRun } from './dispatch';

export const MAX_FAILED_RUNS = 3;

export type QueueOutcome = 'dispatched' | 'flag_off' | 'already_built_or_running' | 'attempts_exhausted' | 'dispatch_failed' | 'error';

export interface QueueInput {
  projectId: string;
  enrollmentId: string | null;
  planVersion: number;
  planSha256: string;
  correlationId: string | null;
}

/** Same three-way setting as SBP_CONNECTED_DEMO: off | all | comma-separated enrollment ids. */
export function platformBuildEnabledFor(enrollmentId: string | null | undefined, setting: string | null | undefined): boolean {
  return connectedDemoEnabledFor(enrollmentId, setting);
}

function log(event: string, outcome: 'success' | 'failure' | 'partial', correlationId: string | null, context: Record<string, unknown>, errorClass?: string | null): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-platform-build',
    event,
    correlation_id: correlationId,
    outcome,
    ...(errorClass ? { error_class: errorClass } : {}),
    context,
  });
  if (outcome === 'failure') console.error(line); else console.log(line);
}

export async function queuePlatformBuild(input: QueueInput): Promise<QueueOutcome> {
  const ctx = { projectId: input.projectId, planVersion: input.planVersion };
  try {
    if (!platformBuildEnabledFor(input.enrollmentId, env.sbpPlatformBuild)) return 'flag_off';

    // A run GitHub accepted but never ran would otherwise hold the project's only live slot forever.
    const stale = await failStaleRuns(input.projectId);
    if (stale) log('platform_build_stale_runs_failed', 'partial', input.correlationId, { ...ctx, stale });

    if ((await countFailedRuns(input.projectId)) >= MAX_FAILED_RUNS) {
      log('platform_build_attempts_exhausted', 'partial', input.correlationId, ctx);
      return 'attempts_exhausted';
    }

    const { run, created } = await queueRun(input);
    if (!created || !run) {
      log('platform_build_not_queued', 'success', input.correlationId, { ...ctx, reason: 'already_built_or_running' });
      return 'already_built_or_running';
    }

    const verdict = await dispatchRun(run.id, {
      repo: env.platformBuildRepo,
      workflowFile: env.platformBuildWorkflow,
      token: process.env.GITHUB_TOKEN || '',
      apiUrl: process.env.GITHUB_API_URL || undefined,
    });
    if (!verdict.ok) {
      await transitionRun(run.id, ['queued'], 'failed', {
        errorClass: verdict.errorClass, errorDetail: `dispatch failed with status ${verdict.status ?? 'none'} after ${verdict.attempts} attempt(s)`,
      });
      log('platform_build_dispatch_failed', 'failure', input.correlationId, { ...ctx, runId: run.id, status: verdict.status, attempts: verdict.attempts }, verdict.errorClass);
      return 'dispatch_failed';
    }
    await transitionRun(run.id, ['queued'], 'dispatched');
    log('platform_build_dispatched', 'success', input.correlationId, { ...ctx, runId: run.id, attempts: verdict.attempts });
    return 'dispatched';
  } catch (err) {
    log('platform_build_queue_error', 'failure', input.correlationId, { ...ctx, message: (err as Error)?.message }, (err as { error_class?: string })?.error_class ?? (err as Error)?.name ?? 'UnknownError');
    return 'error';
  }
}
