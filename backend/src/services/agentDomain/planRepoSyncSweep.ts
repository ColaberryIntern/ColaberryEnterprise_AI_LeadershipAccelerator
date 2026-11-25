/**
 * planRepoSyncSweep — deliver the published plan to every agent-domain builder's repo,
 * without waiting for the builder to press Sync.
 *
 * The reasoning, the measurement and what this deliberately does not do are in
 * `planRepoSyncDecision.ts`. This file is the I/O shell around that judgement: load the
 * projects, ask the rule, call the product's own writer, and report.
 *
 * ## Why it is safe to run unattended
 *
 * It writes nothing of its own. Every write goes through `refreshRepoDocuments`, which:
 *   - renders from the PUBLISHED plan, so this sweep can never invent or promote content;
 *   - compares a content hash per file and commits only what differs, so a second run on
 *     an unchanged plan is a no-op (its own header calls this a fixed point after one pass);
 *   - merges `.colaberry/progress.json` field by field, so a builder's verified work is
 *     never overwritten by a stale copy;
 *   - is path-allowlisted and never touches builder-authored code;
 *   - never throws, and classifies every expected failure as an outcome instead.
 *
 * That writer was exercised against all five stale repos by hand on 2026-11-24 before this
 * job existed: 12 to 14 files written per repo, 66 skipped as unchanged, and zero
 * regressions in stories, verified counts, passed criteria or points.
 *
 * ## Failure-first
 *
 * | Concern | Behaviour |
 * |---|---|
 * | One repo fails | Caught per project. The sweep continues; one bad repo costs that repo. |
 * | The writer reports a failure | Returned as an outcome, counted, logged with its `error_class`. Not a throw. |
 * | The project query fails | Rethrown, so `instrumentCronJob` records an error against the registry row. A sweep that cannot see its work has not succeeded. |
 * | Rate limit | Paced between projects, and capped per run. |
 * | Run overlaps a previous run | Guarded by `running` in the cron wrapper, not here. |
 * | Nothing to do | The common case. Every project reports `unchanged` and nothing is committed. |
 *
 * ## Idempotency
 *
 * Running this twice in a row writes nothing the second time, because `refreshRepoDocuments`
 * hashes each rendered file against what the repo already holds. The sweep adds no state of
 * its own, so there is nothing else to make idempotent.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { decidePlanRepoSync, PlanRepoSyncVerdict } from './planRepoSyncDecision';

/** Capped per run so one sweep cannot spend an unbounded GitHub budget. */
export const DEFAULT_LIMIT = 25;
/** Paced between projects for the same reason `repoTreeRefreshService` paces: a cap bounds how many requests a run makes, not how fast. */
export const DEFAULT_DELAY_MS = 1500;

export interface PlanRepoSyncSummary {
  attempted: number;
  /** Files were committed to the builder's repo. */
  written: number;
  /** The repo already matched the published plan. The steady state. */
  unchanged: number;
  /** No repo, no published plan, or the platform has read-only access. */
  skipped: number;
  /** The writer reported a failure, or the call threw. */
  failed: number;
  /** Projects whose board and published plan disagree. A republish is owed. */
  drifted: number;
}

interface ProjectRow {
  domain_key: string;
  project_id: string;
  has_repo: boolean;
  has_published_plan: boolean;
  plan_story_ids: string[] | null;
  board_story_ids: string[] | null;
}

/**
 * One row per agent domain, carrying only what the rule needs.
 *
 * Story ids are extracted in SQL rather than by loading `plan_json`, because a plan carries
 * every story's narrative and acceptance criteria and this sweep needs none of it. The
 * `::jsonb` cast is a no-op when the column is already jsonb and makes the expression valid
 * when it is json.
 */
const PROJECTS_SQL = `
  SELECT d.domain_key,
         d.student_project_id::text AS project_id,
         EXISTS (
           SELECT 1 FROM github_connections g WHERE g.project_id = d.student_project_id
         ) AS has_repo,
         EXISTS (
           SELECT 1 FROM build_plans b
            WHERE b.project_id = d.student_project_id AND b.status = 'published'
         ) AS has_published_plan,
         COALESCE((
           SELECT array_agg(s->>'id')
             FROM build_plans b
             CROSS JOIN LATERAL jsonb_array_elements((b.plan_json)::jsonb -> 'stories') AS s
            WHERE b.project_id = d.student_project_id AND b.status = 'published'
         ), ARRAY[]::text[]) AS plan_story_ids,
         COALESCE((
           SELECT array_agg(t.story_id ORDER BY t.story_id)
             FROM student_tasks t WHERE t.project_id = d.student_project_id
         ), ARRAY[]::text[]) AS board_story_ids
    FROM agent_domain_projects d
   WHERE d.student_project_id IS NOT NULL
   ORDER BY d.domain_key`;

function log(event: string, correlationId: string, outcome: string, context: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'plan-repo-sync',
    event,
    correlation_id: correlationId,
    outcome,
    context,
  }));
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Report board-versus-plan drift.
 *
 * Separate from the push, and logged even when the project is skipped, because the drift is
 * the thing nobody could see. A sample rather than the full list: the point of the line is
 * that a republish is owed, and the counts carry that.
 */
function reportDrift(verdict: PlanRepoSyncVerdict, correlationId: string): void {
  if (!verdict.drift.drifted) return;
  log('plan_repo_sync_board_plan_drift', correlationId, 'partial', {
    domain_key: verdict.domainKey,
    project_id: verdict.projectId,
    only_on_board: verdict.drift.onlyOnBoard.length,
    only_in_plan: verdict.drift.onlyInPlan.length,
    sample_only_on_board: verdict.drift.onlyOnBoard.slice(0, 5),
    sample_only_in_plan: verdict.drift.onlyInPlan.slice(0, 5),
    remedy: 'republishDomainBuildPlans.js --domain=<key> --apply',
  });
}

export async function runPlanRepoSync(opts?: {
  limit?: number;
  delayMs?: number;
  correlationId?: string;
}): Promise<PlanRepoSyncSummary> {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const delayMs = opts?.delayMs ?? DEFAULT_DELAY_MS;
  const correlationId = opts?.correlationId ?? randomCorrelationId();

  const summary: PlanRepoSyncSummary = {
    attempted: 0, written: 0, unchanged: 0, skipped: 0, failed: 0, drifted: 0,
  };

  let rows: ProjectRow[];
  try {
    rows = (await sequelize.query(PROJECTS_SQL, { type: QueryTypes.SELECT })) as ProjectRow[];
  } catch (err: any) {
    log('plan_repo_sync_query_failed', correlationId, 'failure', {
      error_class: err?.name ?? 'Error', message: err?.message,
    });
    // Rethrown on purpose: a sweep that cannot read its own work list has not succeeded,
    // and instrumentCronJob should record that against the registry row.
    throw err;
  }

  // The writer is imported lazily, the same way the sync route imports it, so booting the
  // scheduler does not pull the document-rendering graph into every process.
  const { refreshRepoDocuments } = await import('../sbp/refreshRepoDocuments');

  const due = rows.slice(0, limit);
  if (rows.length > due.length) {
    log('plan_repo_sync_capped', correlationId, 'partial', {
      total: rows.length, taking: due.length, limit,
    });
  }

  for (const row of due) {
    const verdict = decidePlanRepoSync({
      domainKey: row.domain_key,
      projectId: row.project_id,
      hasRepo: Boolean(row.has_repo),
      hasPublishedPlan: Boolean(row.has_published_plan),
      publishedStoryIds: row.plan_story_ids ?? [],
      boardStoryIds: row.board_story_ids ?? [],
    });

    reportDrift(verdict, correlationId);
    if (verdict.drift.drifted) summary.drifted += 1;

    if (verdict.action !== 'push') {
      summary.skipped += 1;
      log('plan_repo_sync_skipped', correlationId, 'success', {
        domain_key: verdict.domainKey, project_id: verdict.projectId, reason: verdict.action,
      });
      continue;
    }

    summary.attempted += 1;
    if (summary.attempted > 1 && delayMs > 0) await sleep(delayMs);

    try {
      const result = await refreshRepoDocuments(verdict.projectId, { correlationId });
      if (result.outcome === 'written') summary.written += 1;
      else if (result.outcome === 'unchanged') summary.unchanged += 1;
      else if (result.outcome === 'write_failed') summary.failed += 1;
      else summary.skipped += 1;

      log('plan_repo_sync_project', correlationId, result.outcome === 'write_failed' ? 'failure' : 'success', {
        domain_key: verdict.domainKey,
        project_id: verdict.projectId,
        outcome: result.outcome,
        commit_sha: result.commit_sha,
        changed: result.changed_paths?.length ?? 0,
        error_class: result.error_class,
      });
    } catch (err: any) {
      // refreshRepoDocuments documents that it never throws, so reaching here is a defect
      // in it rather than an expected failure. One repo must still not cost the sweep.
      summary.failed += 1;
      log('plan_repo_sync_project_crashed', correlationId, 'failure', {
        domain_key: verdict.domainKey,
        project_id: verdict.projectId,
        error_class: err?.name ?? 'Error',
        message: err?.message,
      });
    }
  }

  log('plan_repo_sync_completed', correlationId, summary.failed ? 'partial' : 'success', {
    ...summary, projects: rows.length,
  });
  return summary;
}

/**
 * A correlation id without importing `crypto` at module load.
 *
 * `randomUUID` is used when it is there, which is every supported runtime; the fallback
 * exists so a missing global can never be the reason a sweep does not run.
 */
function randomCorrelationId(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `plan-repo-sync-${Date.now()}`;
}
