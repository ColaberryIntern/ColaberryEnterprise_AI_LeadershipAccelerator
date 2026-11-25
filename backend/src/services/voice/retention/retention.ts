/**
 * Call retention (VS4.2). Deletes calls whose OWN deadline (voice_calls.retention_until) has passed,
 * one transaction per call, and leaves an audit row. The retention period is a policy decision and is
 * not chosen here: a call without a deadline is never deleted, only counted.
 *
 * Per call, all or nothing:
 *   1. lock the row and re-check it is still due (skips rows another run holds: safe to run twice),
 *   2. remove the transcript, analysis and recording link outside the voice tables (communication log, lead timeline),
 *   3. delete the call; events, turns, tool runs, artifacts, usage and token uses cascade,
 *   4. write audit_logs: the call id and row counts only, never content.
 * Kept on purpose: the communication-log and timeline rows themselves (that a call happened), and dial
 * reservations (a destination hash that enforces call caps).
 *
 * Never deleted: a call that has not ended, one whose opt-out is not recorded yet, or one whose recording still exists in external storage
 * (deleting the reference would orphan the recording). Both are reported. A failure on one call is
 * rolled back, reported, and does not stop the rest; a rerun picks it up.
 */
import type { Sequelize, Transaction } from 'sequelize';
import { QueryTypes } from 'sequelize';

export const TERMINAL_STATES = ['blocked', 'completed', 'busy', 'no_answer', 'failed', 'canceled'] as const;
export const DEFAULT_LIMIT = 200;

const DUE = `c.retention_until IS NOT NULL AND c.retention_until <= NOW() AND c.state IN (:terminal)
  AND NOT EXISTS (SELECT 1 FROM voice_artifacts a WHERE a.call_id = c.id AND a.kind = 'recording' AND a.deleted_at IS NULL)
  AND NOT (c.state_reason IS NOT DISTINCT FROM 'caller_opt_out' AND c.test_mode = FALSE AND c.lead_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM voice_call_events e WHERE e.call_id = c.id AND e.event_key = 'opt_out_recorded'))`;

export interface RetentionReport {
  applied: boolean;
  due: string[];
  deleted: string[];
  failed: Array<{ callId: string; errorClass: string }>;
  blockedByRecording: number;
  notEndedPastDeadline: number;
  withoutDeadline: number;
}

type Count = { n: number };

export async function planRetention(s: Sequelize, limit = DEFAULT_LIMIT): Promise<Omit<RetentionReport, 'applied' | 'deleted' | 'failed'>> {
  const replacements = { terminal: [...TERMINAL_STATES], limit };
  const due = await s.query<{ id: string }>(`SELECT c.id FROM voice_calls c WHERE ${DUE} ORDER BY c.retention_until, c.id LIMIT :limit`, { replacements, type: QueryTypes.SELECT });
  const count = async (where: string) => (await s.query<Count>(`SELECT COUNT(*)::int AS n FROM voice_calls c WHERE ${where}`, { replacements, type: QueryTypes.SELECT }))[0].n;
  return {
    due: due.map((r) => r.id),
    blockedByRecording: await count(`c.retention_until <= NOW() AND c.state IN (:terminal) AND EXISTS (SELECT 1 FROM voice_artifacts a WHERE a.call_id = c.id AND a.kind = 'recording' AND a.deleted_at IS NULL)`),
    notEndedPastDeadline: await count('c.retention_until <= NOW() AND c.state NOT IN (:terminal)'),
    withoutDeadline: await count('c.retention_until IS NULL'),
  };
}

const CASCADED = ['voice_call_events', 'voice_turns', 'voice_tool_runs', 'voice_artifacts', 'voice_usage', 'voice_token_uses'] as const;

/** Delete one due call. Returns false when it is no longer due or another run holds it. */
export async function deleteExpiredCall(s: Sequelize, callId: string): Promise<boolean> {
  return s.transaction(async (transaction: Transaction) => {
    const replacements = { callId, terminal: [...TERMINAL_STATES] };
    const rows = await s.query<{ id: string; log_id: string | null; retention_until: string }>(
      `SELECT c.id, c.communication_log_id AS log_id, c.retention_until FROM voice_calls c WHERE c.id = :callId AND ${DUE} FOR UPDATE SKIP LOCKED`,
      { replacements, type: QueryTypes.SELECT, transaction });
    if (rows.length === 0) return false;
    const removed: Record<string, number> = {};
    for (const t of CASCADED) {
      const r = await s.query<Count>(`SELECT COUNT(*)::int AS n FROM ${t} WHERE call_id = :callId`, { replacements, type: QueryTypes.SELECT, transaction }); // eslint-disable-line no-await-in-loop -- one transaction
      removed[t] = r[0].n;
    }
    if (rows[0].log_id) {
      await s.query("UPDATE communication_logs SET provider_response = provider_response - 'transcript' - 'analysis' - 'recording_url' WHERE id = :logId AND provider_response IS NOT NULL",
        { replacements: { logId: rows[0].log_id }, transaction });
    }
    await s.query("UPDATE activities SET body = NULL WHERE type = 'call' AND metadata->>'voice_call_id' = :callId", { replacements, transaction });
    await s.query('DELETE FROM voice_calls WHERE id = :callId', { replacements, transaction });
    await s.query(
      `INSERT INTO audit_logs (id, admin_user_id, action, entity_type, entity_id, new_values, created_at)
       VALUES (gen_random_uuid(), NULL, 'voice_retention_delete', 'voice_call', :callId, CAST(:detail AS jsonb), NOW())`,
      { replacements: { callId, detail: JSON.stringify({ retention_until: rows[0].retention_until, removed }) }, transaction });
    return true;
  });
}

export async function runRetention(s: Sequelize, o: { apply: boolean; limit?: number }): Promise<RetentionReport> {
  const plan = await planRetention(s, o.limit);
  const report: RetentionReport = { ...plan, applied: o.apply, deleted: [], failed: [] };
  if (!o.apply) return report;
  for (const callId of plan.due) {
    try {
      if (await deleteExpiredCall(s, callId)) report.deleted.push(callId); // eslint-disable-line no-await-in-loop -- one transaction at a time
    } catch (e) {
      report.failed.push({ callId, errorClass: (e as Error).name || 'DatabaseError' });
    }
  }
  return report;
}
