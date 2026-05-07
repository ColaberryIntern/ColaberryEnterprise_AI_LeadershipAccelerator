/**
 * queueHistoryWriter — diffs the previous queue against the new one and
 * appends one row per task to `queue_history_entries`.
 *
 * Wired in after `persistSnapshot` so every successful state rebuild emits a
 * history record. Pure helper `computeQueueDiff` is exported for tests.
 *
 * Phase 4 §10.
 */
import type { AuthoritativeTask } from '../types/systemState.types';

export interface QueueDiffEntry {
  readonly task_id: string;
  readonly bp_id: string | null;
  readonly task_title: string;
  readonly rank: number;
  readonly previous_rank: number | null;
  readonly rank_delta: number;
  readonly state: string;
  readonly previous_state: string | null;
  readonly task_payload: AuthoritativeTask;
}

/**
 * Pure: compute per-task diff between two queue states. The "rank" of each
 * task is its position in the queue (queue.indexOf). Tasks present only in
 * the previous queue are dropped from the diff (they're no longer relevant
 * — the history record only tracks the current queue + how each entry got
 * there).
 */
export function computeQueueDiff(
  previousQueue: ReadonlyArray<AuthoritativeTask>,
  newQueue: ReadonlyArray<AuthoritativeTask>,
): QueueDiffEntry[] {
  const prevByTaskId = new Map<string, { rank: number; state: string }>();
  previousQueue.forEach((t, i) => prevByTaskId.set(t.id, { rank: i, state: t.state }));

  return newQueue.map((task, idx): QueueDiffEntry => {
    const prev = prevByTaskId.get(task.id);
    const previous_rank = prev ? prev.rank : null;
    const previous_state = prev ? prev.state : null;
    const rank_delta = previous_rank !== null ? idx - previous_rank : 0;
    return {
      task_id: task.id,
      bp_id: task.bp_id ?? null,
      task_title: task.title,
      rank: idx,
      previous_rank,
      rank_delta,
      state: task.state,
      previous_state,
      task_payload: task,
    };
  });
}

/**
 * DB-backed writer. Persists one row per diff entry.
 *
 * Best-effort: any DB error logs a warning and returns 0 — the engine's
 * core path must not be blocked by history persistence.
 */
export async function persistQueueDiff(
  projectId: string,
  snapshotId: string,
  recordedAt: Date,
  changeReason: string,
  diff: ReadonlyArray<QueueDiffEntry>,
): Promise<number> {
  try {
    const { default: QueueHistoryEntry } = await import('../../../models/QueueHistoryEntry');
    const rows = diff.map(entry => ({
      project_id: projectId,
      snapshot_id: snapshotId,
      recorded_at: recordedAt,
      task_id: entry.task_id,
      bp_id: entry.bp_id,
      task_title: entry.task_title,
      rank: entry.rank,
      previous_rank: entry.previous_rank,
      rank_delta: entry.rank_delta,
      state: entry.state,
      previous_state: entry.previous_state,
      change_reason: changeReason,
      task_payload: entry.task_payload,
    }));
    if (rows.length === 0) return 0;
    await QueueHistoryEntry.bulkCreate(rows as any[]);
    return rows.length;
  } catch (err: any) {
    console.warn('[queueHistoryWriter] persist failed:', err?.message);
    return 0;
  }
}

/**
 * Read recent queue history for a project. Used by GET /history/queue.
 */
export async function readQueueHistory(
  projectId: string,
  opts: { limit?: number; sinceMs?: number } = {},
): Promise<any[]> {
  try {
    const { default: QueueHistoryEntry } = await import('../../../models/QueueHistoryEntry');
    const where: any = { project_id: projectId };
    if (opts.sinceMs) {
      const { Op } = await import('sequelize');
      where.recorded_at = { [Op.gte]: new Date(Date.now() - opts.sinceMs) };
    }
    const rows = await QueueHistoryEntry.findAll({
      where,
      order: [['recorded_at', 'DESC'], ['rank', 'ASC']],
      limit: opts.limit ?? 200,
    });
    return rows.map((r: any) => ({
      id: r.id,
      project_id: r.project_id,
      snapshot_id: r.snapshot_id,
      recorded_at: new Date(r.recorded_at).toISOString(),
      task_id: r.task_id,
      bp_id: r.bp_id,
      task_title: r.task_title,
      rank: r.rank,
      previous_rank: r.previous_rank,
      rank_delta: r.rank_delta,
      state: r.state,
      previous_state: r.previous_state,
      change_reason: r.change_reason,
    }));
  } catch (err: any) {
    console.warn('[queueHistoryWriter] read failed:', err?.message);
    return [];
  }
}
