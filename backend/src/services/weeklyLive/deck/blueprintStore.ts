import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { SessionBlueprint } from './deckBlueprint';

/**
 * Blueprint rows (WL4.2): one per plan and topic. Writing a blueprint is a paid background call, so it
 * is claimed with one guarded upsert: a second click while one is writing gets the running row, never a
 * second call. A writer that stops updating (the server restarted) can be claimed again after
 * STALE_MINUTES. Each claim carries a fresh attempt number, so a replaced writer cannot finish.
 */
export const STALE_MINUTES = 30;
export type BlueprintStatus = 'writing' | 'ready' | 'failed';
export interface BlueprintRow {
  plan_id: string; topic_id: string; status: BlueprintStatus; blueprint: SessionBlueprint | null; problems: string[];
  error: string | null; model: string | null; attempts: number; stale: boolean;
}

const COLUMNS = `plan_id, topic_id, status, blueprint, problems, error, model, attempts,
  (status = 'writing' AND heartbeat_at < NOW() - INTERVAL '${STALE_MINUTES} minutes') AS stale`;

export async function getBlueprint(planId: string, topicId: string): Promise<BlueprintRow | null> {
  const rows = await sequelize.query<BlueprintRow>(`SELECT ${COLUMNS} FROM weekly_live_blueprints WHERE plan_id = :planId AND topic_id = :topicId`,
    { replacements: { planId, topicId }, type: QueryTypes.SELECT });
  return rows[0] || null;
}

/**
 * Claim the writer for a plan's topic. Returns the attempt number to write with, or null when another
 * writer is still live. A ready blueprint is only replaced when `replace` is set (Write it again).
 */
export async function claimWriter(planId: string, topicId: string, model: string, replace: boolean): Promise<number | null> {
  const rows = await sequelize.query<{ attempts: number }>(
    `INSERT INTO weekly_live_blueprints (plan_id, topic_id, status, model, attempts, heartbeat_at)
     VALUES (:planId, :topicId, 'writing', :model, 1, NOW())
     ON CONFLICT (plan_id, topic_id) DO UPDATE SET status = 'writing', error = NULL, problems = '[]'::jsonb, model = EXCLUDED.model,
       attempts = weekly_live_blueprints.attempts + 1, heartbeat_at = NOW()
     WHERE weekly_live_blueprints.status = 'failed'
        OR (weekly_live_blueprints.status = 'ready' AND :replace)
        OR (weekly_live_blueprints.status = 'writing' AND weekly_live_blueprints.heartbeat_at < NOW() - INTERVAL '${STALE_MINUTES} minutes')
     RETURNING attempts`,
    { replacements: { planId, topicId, model, replace }, type: QueryTypes.SELECT },
  );
  return rows[0]?.attempts ?? null;
}

/** Finish a claimed writer. Only the attempt that holds the claim can finish it; returns whether it did. */
export async function finishWriter(planId: string, topicId: string, attempt: number, result:
  { status: 'ready'; blueprint: SessionBlueprint } | { status: 'failed'; error: string; problems: string[] }): Promise<boolean> {
  const rows = await sequelize.query<{ plan_id: string }>(
    `UPDATE weekly_live_blueprints SET status = :status, blueprint = CAST(:blueprint AS JSONB), error = :error, problems = CAST(:problems AS JSONB), heartbeat_at = NOW()
     WHERE plan_id = :planId AND topic_id = :topicId AND attempts = :attempt AND status = 'writing' RETURNING plan_id`,
    { replacements: {
      planId, topicId, attempt, status: result.status,
      blueprint: result.status === 'ready' ? JSON.stringify(result.blueprint) : null,
      error: result.status === 'failed' ? result.error.slice(0, 400) : null,
      problems: JSON.stringify(result.status === 'failed' ? result.problems.slice(0, 40) : []),
    }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
}
