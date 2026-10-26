import { sequelize } from '../../config/database';
import { ensureCampusActivitySchema } from '../../db/ensureCampusActivitySchema';

/**
 * Writers for the campus activity log (ensureCampusActivitySchema.ts explains the tables). Both writes are idempotent:
 *  - tour progress upserts on (enrollment_id, tour) and keeps the furthest stop with GREATEST, so the same step sent twice, or an
 *    older step arriving late, changes nothing; finished_at is set once and never cleared;
 *  - a booking upserts on the calendar event id, so a retried or double-clicked booking writes one row; a cancel only marks it.
 * FAILURE: a database error propagates to the caller. The booking route treats the log as best-effort (the meeting is already on
 * the calendar, which is the record) and logs the failure; the tour route answers 500 and the browser simply tries the next step.
 */
export type CampusTour = 'member' | 'explorer' | 'business';
export interface TourStep { tour: CampusTour; stop: number; total: number; finished: boolean }

export async function recordTourStep(enrollmentId: string, s: TourStep): Promise<void> {
  await ensureCampusActivitySchema();
  await sequelize.query(
    `INSERT INTO campus_tour_progress (enrollment_id, tour, furthest_stop, total_stops, finished_at)
     VALUES (:enrollmentId, :tour, :stop, :total, CASE WHEN :finished THEN NOW() ELSE NULL END)
     ON CONFLICT (enrollment_id, tour) DO UPDATE SET
       furthest_stop = GREATEST(campus_tour_progress.furthest_stop, EXCLUDED.furthest_stop),
       total_stops = EXCLUDED.total_stops,
       finished_at = COALESCE(campus_tour_progress.finished_at, EXCLUDED.finished_at),
       updated_at = NOW()`,
    { replacements: { enrollmentId, tour: s.tour, stop: s.stop, total: s.total, finished: s.finished } },
  );
}

export interface BookingLog { eventId: string; enrollmentId: string; startsAt: string; topic: string | null }

export async function recordAdmissionsBooking(b: BookingLog): Promise<void> {
  await ensureCampusActivitySchema();
  await sequelize.query(
    `INSERT INTO campus_admissions_bookings (calendar_event_id, enrollment_id, starts_at, topic)
     VALUES (:eventId, :enrollmentId, :startsAt, :topic)
     ON CONFLICT (calendar_event_id) DO NOTHING`,
    { replacements: { eventId: b.eventId, enrollmentId: b.enrollmentId, startsAt: b.startsAt, topic: b.topic } },
  );
}

export async function recordAdmissionsCancel(eventId: string): Promise<void> {
  await ensureCampusActivitySchema();
  await sequelize.query(
    `UPDATE campus_admissions_bookings SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, NOW())
      WHERE calendar_event_id = :eventId`,
    { replacements: { eventId } },
  );
}
