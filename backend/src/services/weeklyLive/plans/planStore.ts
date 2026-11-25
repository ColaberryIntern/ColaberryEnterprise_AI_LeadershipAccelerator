import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { PlanInputs, PlanStatus } from '../../../models/WeeklyLive';

/**
 * Plan rows and run progress (WL3.4). Every state change is one guarded UPDATE or runs under the same
 * advisory lock, so two people pressing the button at once cannot start two runs for one air date.
 *
 * A run that stops updating (the server restarted mid-run) is treated as failed after STALE_MINUTES, which
 * is longer than the longest single stage (topics: two rounds of two calls, 240 s each). Each run has its
 * own id: a run that was replaced can no longer write a stage, an error or a result.
 */
export const STAGES = ['queued', 'signals', 'demand', 'topics', 'done', 'failed'] as const;
export type Stage = (typeof STAGES)[number];
export const STALE_MINUTES = 30;
const LOCK_KEY = 4406002;

export interface PlanRow {
  id: string; air_date: string; cohort_id: string | null; inputs: PlanInputs; status: PlanStatus; chosen_topic_id: string | null;
  cost_usd: number; stage: Stage; note: string | null; error: string | null;
}

const COLUMNS = `p.id, to_char(p.air_date, 'YYYY-MM-DD') AS air_date, p.cohort_id, p.inputs, p.chosen_topic_id, p.cost_usd::float AS cost_usd,
  CASE WHEN p.status = 'researching' AND COALESCE(r.heartbeat_at, p.created_at) < NOW() - INTERVAL '${STALE_MINUTES} minutes' THEN 'failed' ELSE p.status END AS status,
  COALESCE(r.stage, 'queued') AS stage, r.note,
  CASE WHEN p.status = 'researching' AND COALESCE(r.heartbeat_at, p.created_at) < NOW() - INTERVAL '${STALE_MINUTES} minutes'
    THEN 'The run stopped before it finished. Run it again.' ELSE r.error END AS error`;
const FROM = 'FROM weekly_live_plans p LEFT JOIN weekly_live_plan_runs r ON r.plan_id = p.id';

export async function getPlan(id: string): Promise<PlanRow | null> {
  const rows = await sequelize.query<PlanRow>(`SELECT ${COLUMNS} ${FROM} WHERE p.id = :id`, { replacements: { id }, type: QueryTypes.SELECT });
  return rows[0] || null;
}

/** The newest plan for an air date, or null. */
export async function latestPlanFor(airDate: string): Promise<PlanRow | null> {
  const rows = await sequelize.query<PlanRow>(`SELECT ${COLUMNS} ${FROM} WHERE p.air_date = :airDate ORDER BY p.created_at DESC, p.id LIMIT 1`, { replacements: { airDate }, type: QueryTypes.SELECT });
  return rows[0] || null;
}

export interface NewPlan { airDate: string; cohortId: string; inputs: PlanInputs; createdBy: string | null; }

/** The running plan for this air date when there is one, else a new one. `created` says which. */
export async function createOrJoin(n: NewPlan): Promise<{ id: string; created: boolean; runId: string | null }> {
  return sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(:k)', { replacements: { k: LOCK_KEY }, transaction });
    const running = await sequelize.query<{ id: string }>(
      `SELECT p.id ${FROM} WHERE p.air_date = :airDate AND p.status = 'researching'
         AND COALESCE(r.heartbeat_at, p.created_at) >= NOW() - INTERVAL '${STALE_MINUTES} minutes' ORDER BY p.created_at DESC LIMIT 1`,
      { replacements: { airDate: n.airDate }, type: QueryTypes.SELECT, transaction },
    );
    if (running.length) return { id: running[0].id, created: false, runId: null };
    const [row] = await sequelize.query<{ id: string }>(
      `INSERT INTO weekly_live_plans (air_date, cohort_id, inputs, status, created_by)
       VALUES (:airDate, :cohortId, CAST(:inputs AS JSONB), 'researching', :createdBy) RETURNING id`,
      { replacements: { airDate: n.airDate, cohortId: n.cohortId, inputs: JSON.stringify(n.inputs), createdBy: n.createdBy }, type: QueryTypes.SELECT, transaction },
    );
    const [run] = await sequelize.query<{ run_id: string }>("INSERT INTO weekly_live_plan_runs (plan_id, stage, heartbeat_at) VALUES (:id, 'queued', NOW()) RETURNING run_id", { replacements: { id: row.id }, type: QueryTypes.SELECT, transaction });
    return { id: row.id, created: true, runId: run.run_id };
  });
}

/** Claim a finished or failed plan for another run. The new run's id, or null when it is running or already chosen. */
export async function claimForRun(id: string): Promise<string | null> {
  return sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(:k)', { replacements: { k: LOCK_KEY }, transaction });
    const rows = await sequelize.query<{ id: string }>(
      `UPDATE weekly_live_plans p SET status = 'researching', updated_at = NOW() WHERE p.id = :id AND (p.status IN ('ready', 'failed', 'draft')
         OR (p.status = 'researching' AND COALESCE((SELECT r.heartbeat_at FROM weekly_live_plan_runs r WHERE r.plan_id = p.id), p.created_at) < NOW() - INTERVAL '${STALE_MINUTES} minutes'))
         AND NOT EXISTS (SELECT 1 FROM weekly_live_plans o LEFT JOIN weekly_live_plan_runs q ON q.plan_id = o.id
           WHERE o.air_date = p.air_date AND o.id <> p.id AND o.status = 'researching' AND COALESCE(q.heartbeat_at, o.created_at) >= NOW() - INTERVAL '${STALE_MINUTES} minutes')
       RETURNING p.id`,
      { replacements: { id }, type: QueryTypes.SELECT, transaction },
    );
    if (!rows.length) return null;
    const [run] = await sequelize.query<{ run_id: string }>(
      `INSERT INTO weekly_live_plan_runs (plan_id, stage, heartbeat_at) VALUES (:id, 'queued', NOW())
       ON CONFLICT (plan_id) DO UPDATE SET run_id = gen_random_uuid(), stage = 'queued', note = NULL, error = NULL, heartbeat_at = NOW() RETURNING run_id`,
      { replacements: { id }, type: QueryTypes.SELECT, transaction },
    );
    return run.run_id;
  });
}

/** Move the run to a stage. False when a newer run or a choice has replaced it: the caller must stop. */
export async function setStage(id: string, runId: string, stage: Stage, note: string | null = null): Promise<boolean> {
  const rows = await sequelize.query<{ plan_id: string }>(
    `UPDATE weekly_live_plan_runs r SET stage = :stage, note = COALESCE(:note, note), heartbeat_at = NOW()
     WHERE r.plan_id = :id AND r.run_id = :runId AND EXISTS (SELECT 1 FROM weekly_live_plans p WHERE p.id = :id AND p.status = 'researching') RETURNING r.plan_id`,
    { replacements: { id, runId, stage, note }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
}

/** End a run. Nothing changes when the run was replaced or the plan is no longer researching. */
export async function finish(id: string, runId: string, ok: boolean, error: string | null = null): Promise<void> {
  await sequelize.transaction(async (transaction) => {
    const rows = await sequelize.query<{ id: string }>(
      `UPDATE weekly_live_plans p SET status = :status, updated_at = NOW(),
         cost_usd = (SELECT COALESCE(SUM(s.cost_usd), 0) FROM weekly_live_spend s WHERE s.plan_id = :id)
       WHERE p.id = :id AND p.status = 'researching' AND EXISTS (SELECT 1 FROM weekly_live_plan_runs r WHERE r.plan_id = :id AND r.run_id = :runId) RETURNING p.id`,
      { replacements: { id, runId, status: ok ? 'ready' : 'failed' }, type: QueryTypes.SELECT, transaction },
    );
    if (!rows.length) return;
    await sequelize.query('UPDATE weekly_live_plan_runs SET stage = :stage, error = :error, heartbeat_at = NOW() WHERE plan_id = :id AND run_id = :runId',
      { replacements: { id, runId, stage: ok ? 'done' : 'failed', error: error ? error.slice(0, 300) : null }, transaction });
  });
}

/**
 * Choose one of the plan's topics. A failed or stopped run keeps its earlier topics, so those can be
 * chosen too. Choosing again (the same or another topic) replaces the choice.
 */
export async function setChosen(id: string, topicId: string): Promise<boolean> {
  const rows = await sequelize.query<{ id: string }>(
    `UPDATE weekly_live_plans p SET status = 'chosen', chosen_topic_id = :topicId, updated_at = NOW()
     WHERE p.id = :id AND (p.status IN ('ready', 'chosen', 'failed') OR (p.status = 'researching'
         AND COALESCE((SELECT r.heartbeat_at FROM weekly_live_plan_runs r WHERE r.plan_id = p.id), p.created_at) < NOW() - INTERVAL '${STALE_MINUTES} minutes'))
       AND EXISTS (SELECT 1 FROM weekly_live_topics t WHERE t.id = :topicId AND t.plan_id = :id) RETURNING p.id`,
    { replacements: { id, topicId }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
}
