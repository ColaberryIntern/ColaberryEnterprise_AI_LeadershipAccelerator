import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { ensureCampusRoomVisitsSchema } from '../../db/ensureCampusRoomVisitsSchema';
import { pruneCampusRoomVisitsDaily } from './campusRoomVisitRetention';

/**
 * Append a campus_room_visits row when a learner ENTERS a building (C101). Called by touchCampusArea BEFORE it upserts
 * the presence row, so the presence row it reads is still the previous heartbeat's.
 *
 * "Entered" = there is no fresh presence row for this learner in this same area: either they were somewhere else, or
 * their last heartbeat is older than the presence window (they left the campus and came back). The 30-second
 * heartbeat in one building therefore writes once, not twice a minute.
 *
 * One statement, so the check and the insert see the same snapshot. Two heartbeats racing in the same instant from a
 * brand-new learner could both insert; the second guard (no visit to this area inside the same window) narrows that
 * to truly simultaneous requests, which the 30 s poll does not produce. A duplicate visit is a harmless over-count in
 * an audit table, never a user-facing effect.
 *
 * NEVER FAILS THE HEARTBEAT. Presence is the product; this is measurement. Any error is logged with an error_class and
 * swallowed here, deliberately, so the caller's upsert still runs.
 */
export async function recordRoomVisitIfEntered(enrollmentId: string, area: string, freshMs: number): Promise<boolean> {
  try {
    await ensureCampusRoomVisitsSchema();
    const rows = await sequelize.query<{ id: string }>(
      `INSERT INTO campus_room_visits (enrollment_id, area, entered_at)
       SELECT :enrollmentId, :area, NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM campus_presence p
         WHERE p.enrollment_id = :enrollmentId AND p.area = :area
           AND p.updated_at > NOW() - make_interval(secs => :freshSecs))
       AND NOT EXISTS (
         SELECT 1 FROM campus_room_visits v
         WHERE v.enrollment_id = :enrollmentId AND v.area = :area
           AND v.entered_at > NOW() - make_interval(secs => :freshSecs))
       RETURNING id`,
      { replacements: { enrollmentId, area, freshSecs: Math.round(freshMs / 1000) }, type: QueryTypes.SELECT },
    );
    pruneCampusRoomVisitsDaily(); // at most once a day, not awaited (90-day retention)
    return rows.length > 0;
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    console.error(JSON.stringify({
      level: 'error', service: 'backend', event: 'campus_room_visit_write_failed', outcome: 'failure',
      error_class: e?.name || 'RoomVisitWriteError', context: { area, message: String(e?.message || err).slice(0, 200) },
    }));
    return false;
  }
}
