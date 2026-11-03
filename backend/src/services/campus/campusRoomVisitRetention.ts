import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { ensureCampusRoomVisitsSchema } from '../../db/ensureCampusRoomVisitsSchema';

/**
 * Retention for campus_room_visits (C101): rows older than RETENTION_DAYS are deleted, in batches, daily.
 *
 * Bounded on purpose: at most MAX_BATCHES x BATCH_SIZE rows per run, so a backlog can never turn one nightly run into a
 * long lock. Whatever is left is taken the next night. Idempotent: deleting rows that are already gone deletes nothing.
 * Failure propagates to the scheduler's instrumentCronJob, which logs it; the next night retries.
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
