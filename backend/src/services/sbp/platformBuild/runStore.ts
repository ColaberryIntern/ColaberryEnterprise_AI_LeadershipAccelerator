/**
 * platformBuild/runStore - the build run's state machine, in Postgres. I/O.
 *
 *   queued ──dispatch ok──▶ dispatched ──runner fetched bundle──▶ building ──upload──▶ uploaded
 *      │                        │                                    │
 *      └──dispatch failed──▶ failed ◀────────runner reported failure─┘
 *
 * Every transition is ONE guarded UPDATE (`WHERE status IN (...)`), so a duplicated request,
 * a retried webhook or a runner re-run can move a run at most once; the loser sees `false`
 * and does nothing. `uq_platform_build_runs_live` (one non-failed run per project) is what makes
 * queueing idempotent: see ensurePlatformBuildSchema.ts.
 */
import { randomUUID } from 'crypto';
import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';

export type RunStatus = 'queued' | 'dispatched' | 'building' | 'uploaded' | 'failed';

export interface PlatformBuildRun {
  id: string;
  project_id: string;
  enrollment_id: string | null;
  plan_version: number;
  plan_sha256: string;
  status: RunStatus;
  error_class: string | null;
  error_detail: string | null;
  cost_usd: string | null;
  correlation_id: string | null;
  dispatched_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

export interface QueueRunInput {
  projectId: string;
  enrollmentId: string | null;
  planVersion: number;
  planSha256: string;
  correlationId: string | null;
}

/** Inserts a queued run unless the project already has a live one. `created` tells which. */
export async function queueRun(input: QueueRunInput): Promise<{ run: PlatformBuildRun | null; created: boolean }> {
  const rows = await sequelize.query<PlatformBuildRun>(
    `INSERT INTO platform_build_runs
       (id, project_id, enrollment_id, plan_version, plan_sha256, status, correlation_id)
     VALUES (:id, :projectId, :enrollmentId, :planVersion, :planSha256, 'queued', :correlationId)
     ON CONFLICT (project_id) WHERE status <> 'failed' DO NOTHING
     RETURNING *`,
    {
      replacements: {
        id: randomUUID(),
        projectId: input.projectId,
        enrollmentId: input.enrollmentId,
        planVersion: input.planVersion,
        planSha256: input.planSha256,
        correlationId: input.correlationId,
      },
      type: QueryTypes.SELECT,
    },
  );
  return { run: rows[0] ?? null, created: rows.length > 0 };
}

/** In flight longer than the workflow's own 60-minute timeout, twice over, means it never will. */
export const STALE_RUN_MINUTES = 120;

/**
 * Fail this project's runs that have been queued/dispatched/building for longer than any run can
 * take. Without this, a dispatch GitHub accepted but never ran would hold the project's one live
 * slot forever and no later publish could ever rebuild it. Returns how many were failed.
 */
export async function failStaleRuns(projectId: string, olderThanMinutes: number = STALE_RUN_MINUTES): Promise<number> {
  const rows = await sequelize.query<{ id: string }>(
    `UPDATE platform_build_runs
        SET status = 'failed', updated_at = now(), completed_at = now(),
            error_class = 'StaleRun',
            error_detail = 'no upload or failure report within ' || :minutes || ' minutes'
      WHERE project_id = :projectId
        AND status IN ('queued', 'dispatched', 'building')
        AND created_at < now() - (:minutes || ' minutes')::interval
      RETURNING id`,
    { replacements: { projectId, minutes: String(olderThanMinutes) }, type: QueryTypes.SELECT },
  );
  return rows.length;
}

export async function countFailedRuns(projectId: string): Promise<number> {
  const rows = await sequelize.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM platform_build_runs WHERE project_id = :projectId AND status = 'failed'`,
    { replacements: { projectId }, type: QueryTypes.SELECT },
  );
  return Number(rows[0]?.n ?? 0);
}

export async function getRun(runId: string, t?: Transaction, forUpdate = false): Promise<PlatformBuildRun | null> {
  const rows = await sequelize.query<PlatformBuildRun>(
    `SELECT * FROM platform_build_runs WHERE id = :runId${forUpdate ? ' FOR UPDATE' : ''}`,
    { replacements: { runId }, type: QueryTypes.SELECT, transaction: t },
  );
  return rows[0] ?? null;
}

export async function latestRunForProject(projectId: string): Promise<PlatformBuildRun | null> {
  const rows = await sequelize.query<PlatformBuildRun>(
    `SELECT * FROM platform_build_runs WHERE project_id = :projectId ORDER BY created_at DESC LIMIT 1`,
    { replacements: { projectId }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

const STAMP: Partial<Record<RunStatus, string>> = {
  dispatched: ', dispatched_at = now()',
  building: ', started_at = now()',
  uploaded: ', completed_at = now()',
  failed: ', completed_at = now()',
};

/**
 * Move a run from one of `from` to `to`. False when the run was not in `from` (someone else
 * moved it first, or it never existed); the caller treats that as "nothing to do".
 */
export async function transitionRun(
  runId: string,
  from: RunStatus[],
  to: RunStatus,
  fields: { errorClass?: string | null; errorDetail?: string | null; costUsd?: number | null } = {},
  t?: Transaction,
): Promise<boolean> {
  const placeholders = from.map((_, i) => `:from${i}`).join(', ');
  const fromParams = Object.fromEntries(from.map((s, i) => [`from${i}`, s]));
  const rows = await sequelize.query<{ id: string }>(
    `UPDATE platform_build_runs
        SET status = :to, updated_at = now()${STAMP[to] ?? ''},
            error_class = COALESCE(:errorClass, error_class),
            error_detail = COALESCE(:errorDetail, error_detail),
            cost_usd = COALESCE(:costUsd, cost_usd)
      WHERE id = :runId AND status IN (${placeholders})
      RETURNING id`,
    {
      replacements: {
        runId,
        to,
        errorClass: fields.errorClass ?? null,
        errorDetail: fields.errorDetail ? fields.errorDetail.slice(0, 1000) : null,
        costUsd: fields.costUsd ?? null,
        ...fromParams,
      },
      type: QueryTypes.SELECT,
      transaction: t,
    },
  );
  return rows.length > 0;
}
