import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { BriefCopy } from './briefSchema';

/**
 * Brief rows (WL4.4), one per plan. Two claims, both one guarded statement:
 *  - writing: like the blueprint, a live writer cannot be doubled; a stale one (server restart) can be
 *    reclaimed after STALE_MINUTES; a new topic replaces the old brief.
 *  - sending: approving claims send_attempt; only the claim holder may record the to-do, and once a
 *    to-do id is stored no claim succeeds again, so approving twice creates one to-do.
 */
export const STALE_MINUTES = 30;
export const SEND_STALE_MINUTES = 10;
export interface BriefRow {
  plan_id: string; topic_id: string; status: 'writing' | 'ready' | 'failed'; copy: BriefCopy | null; problems: string[]; error: string | null;
  attempts: number; written_on: string | null; stale: boolean; approved_at: string | null; approved_by: string | null;
  sending: boolean; send_error: string | null; bc_todo_id: string | null; bc_todo_url: string | null;
}

const COLUMNS = `plan_id, topic_id, status, copy, problems, error, attempts, to_char(written_on, 'YYYY-MM-DD') AS written_on,
  (status = 'writing' AND heartbeat_at < NOW() - INTERVAL '${STALE_MINUTES} minutes') AS stale, approved_at, approved_by,
  (sending_at IS NOT NULL AND sending_at > NOW() - INTERVAL '${SEND_STALE_MINUTES} minutes' AND bc_todo_id IS NULL) AS sending, send_error, bc_todo_id::text AS bc_todo_id, bc_todo_url`;
const q = <T extends object>(sql: string, replacements: Record<string, unknown>) => sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });

export async function getBrief(planId: string): Promise<BriefRow | null> {
  return (await q<BriefRow>(`SELECT ${COLUMNS} FROM weekly_live_briefs WHERE plan_id = :planId`, { planId }))[0] || null;
}

/** Claim the writer. A brief already sent to Jackie is never rewritten. Returns the attempt, or null. */
export async function claimWriter(planId: string, topicId: string, writtenOn: string, replace: boolean): Promise<number | null> {
  const rows = await q<{ attempts: number }>(
    `INSERT INTO weekly_live_briefs (plan_id, topic_id, status, attempts, written_on, heartbeat_at) VALUES (:planId, :topicId, 'writing', 1, :writtenOn, NOW())
     ON CONFLICT (plan_id) DO UPDATE SET topic_id = EXCLUDED.topic_id, status = 'writing', copy = NULL, error = NULL, problems = '[]'::jsonb,
       written_on = EXCLUDED.written_on, attempts = weekly_live_briefs.attempts + 1, heartbeat_at = NOW(), approved_at = NULL, approved_by = NULL, send_error = NULL
     WHERE weekly_live_briefs.bc_todo_id IS NULL AND (weekly_live_briefs.status = 'failed' OR weekly_live_briefs.topic_id <> EXCLUDED.topic_id
        OR (weekly_live_briefs.status = 'ready' AND :replace)
        OR (weekly_live_briefs.status = 'writing' AND weekly_live_briefs.heartbeat_at < NOW() - INTERVAL '${STALE_MINUTES} minutes'))
     RETURNING attempts`, { planId, topicId, writtenOn, replace });
  return rows[0]?.attempts ?? null;
}

export async function finishWriter(planId: string, attempt: number, result: { status: 'ready'; copy: BriefCopy } | { status: 'failed'; error: string; problems: string[] }): Promise<boolean> {
  const rows = await q<{ plan_id: string }>(
    `UPDATE weekly_live_briefs SET status = :status, copy = CAST(:copy AS JSONB), error = :error, problems = CAST(:problems AS JSONB), heartbeat_at = NOW()
     WHERE plan_id = :planId AND attempts = :attempt AND status = 'writing' RETURNING plan_id`,
    { planId, attempt, status: result.status, copy: result.status === 'ready' ? JSON.stringify(result.copy) : null,
      error: result.status === 'failed' ? result.error.slice(0, 400) : null, problems: JSON.stringify(result.status === 'failed' ? result.problems.slice(0, 40) : []) });
  return rows.length > 0;
}

/** Claim the send for a ready brief of this topic. Null when it is already sent or another send is live. */
export async function claimSend(planId: string, topicId: string, by: string): Promise<number | null> {
  const rows = await q<{ send_attempt: number }>(
    `UPDATE weekly_live_briefs SET approved_at = COALESCE(approved_at, NOW()), approved_by = COALESCE(approved_by, :by), send_attempt = send_attempt + 1, sending_at = NOW(), send_error = NULL
     WHERE plan_id = :planId AND topic_id = :topicId AND status = 'ready' AND bc_todo_id IS NULL
       AND (sending_at IS NULL OR sending_at < NOW() - INTERVAL '${SEND_STALE_MINUTES} minutes') RETURNING send_attempt`, { planId, topicId, by });
  return rows[0]?.send_attempt ?? null;
}

/** Record the to-do (only the claim holder can), or the reason the send failed. */
export async function finishSend(planId: string, attempt: number, result: { todoId: number; url: string } | { error: string }): Promise<boolean> {
  const ok = 'todoId' in result;
  const rows = await q<{ plan_id: string }>(
    `UPDATE weekly_live_briefs SET ${ok ? 'bc_todo_id = :todoId, bc_todo_url = :url, sending_at = NULL' : 'send_error = :error, sending_at = NULL'}
     WHERE plan_id = :planId AND send_attempt = :attempt AND bc_todo_id IS NULL RETURNING plan_id`,
    { planId, attempt, todoId: ok ? result.todoId : null, url: ok ? result.url : null, error: ok ? null : result.error.slice(0, 400) });
  return rows.length > 0;
}
