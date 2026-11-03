import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { ensureCampusRoomVisitsSchema } from '../../db/ensureCampusRoomVisitsSchema';

/**
 * Retention for campus_room_visits (C101): rows older than RETENTION_DAYS are deleted, in batches, once a day
 * (pruneCampusRoomVisitsDaily, driven by the writer).
 *
 * Bounded on purpose: at most MAX_BATCHES x BATCH_SIZE rows per run, so a backlog can never turn one run into a long
 * lock. Whatever is left is taken the next day. Idempotent: deleting rows that are already gone deletes nothing.
 * Failure propagates to pruneCampusRoomVisitsDaily, which logs it and retries on the next call.
 */
export const RETENTION_DAYS = 90;
export const BATCH_SIZE = 5_000;
export const MAX_BATCHES = 10;

export async function pruneCampusRoomVisits(): Promise<{ deleted: number }> {
  await ensureCampusRoomVisitsSchema();
  let deleted = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const rows = await sequelize.query<{ id: string }>(
      `DELETE FROM campus_room_visits
       WHERE id IN (
         SELECT id FROM campus_room_visits
         WHERE entered_at < NOW() - make_interval(days => :days)
         ORDER BY id LIMIT :limit)
       RETURNING id`,
      { replacements: { days: RETENTION_DAYS, limit: BATCH_SIZE }, type: QueryTypes.SELECT },
    );
    deleted += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }
  console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'campus_room_visits_pruned', outcome: 'success', context: { deleted } }));
  return { deleted };
}

let lastPruneDay: string | null = null;

/**
 * Run the prune at most once a UTC day per process, from the writer (recordRoomVisitIfEntered), without waiting on it.
 *
 * Why not a cron: every scheduled job here must also carry an ai_agents seed row (cronRegistryReconciliation), and a
 * 90-day cleanup of one audit table does not earn an agent. Driving it from the only writer keeps it next to the data
 * and out of the oversize scheduler. Fire-and-forget so the heartbeat that triggers it never waits on the deletes; a
 * failure is logged and the next call that day retries.
 */
export function pruneCampusRoomVisitsDaily(now: Date = new Date()): void {
  const day = now.toISOString().slice(0, 10);
  if (lastPruneDay === day) return;
  lastPruneDay = day;
  void pruneCampusRoomVisits().catch((err: unknown) => {
    lastPruneDay = null;
    const e = err as { name?: string; message?: string };
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'campus_room_visits_prune_failed', outcome: 'failure',
      error_class: e?.name || 'RoomVisitPruneError', context: { message: String(e?.message || err).slice(0, 200) } }));
  });
}

/** Test seam. */
export function __resetCampusRoomVisitPruneForTests(): void { lastPruneDay = null; }
