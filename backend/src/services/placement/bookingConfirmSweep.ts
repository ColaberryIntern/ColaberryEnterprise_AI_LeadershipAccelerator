import cron from 'node-cron';
import { sequelize } from '../../config/database';
import { finishBooking, MAX_CONFIRM_ATTEMPTS, type FinishOpts } from './bookingConfirm';

/**
 * Career Prep v27, CP8.2b: the RECOVERY for a booking whose after-booking work (room, invites) did not complete: the
 * provider or the mail service failed, or the process stopped between the confirm's commit and the work. Every 5
 * minutes, at most BATCH interviews per pass.
 *
 * OWED = state `booked`, the booked time still ahead, confirm_done_at NULL, fewer than MAX_CONFIRM_ATTEMPTS runs.
 * DUE  = never run and booked more than 2 minutes ago (the route's own run has had its turn), or the last run more than
 *        5 minutes ago (after 1) / 30 minutes ago (after 2).
 * Each item is finishBooking (idempotent: the meeting and every message are keyed), so a re-run only completes what is
 * missing. Not switch-gated as a whole: the employer part checks its own switch inside, and the learner part its allow-list.
 */
export const BATCH = 20;
export const FIRST_RUN_GRACE_MS = 2 * 60_000;

function log(level: 'info' | 'warn', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'warn') console.warn(line); else console.log(line);
}

export async function sweepBookingConfirms(now = new Date(), opts: FinishOpts = {}): Promise<{ tried: number; done: number; gaveUp: number }> {
  const out = { tried: 0, done: 0, gaveUp: 0 };
  const [rows] = await sequelize.query(
    `SELECT i.id FROM placement_interviews i
      WHERE i.state = 'booked' AND i.confirm_done_at IS NULL AND i.starts_at > :now AND i.confirm_attempts < ${MAX_CONFIRM_ATTEMPTS}
        AND ((i.confirm_attempts = 0 AND i.updated_at < :grace)
          OR (i.confirm_attempts = 1 AND i.confirm_last_attempt_at < :after1)
          OR (i.confirm_attempts >= 2 AND i.confirm_last_attempt_at < :after2))
      ORDER BY i.starts_at LIMIT ${BATCH}`,
    { replacements: { now, grace: new Date(now.getTime() - FIRST_RUN_GRACE_MS), after1: new Date(now.getTime() - 5 * 60_000), after2: new Date(now.getTime() - 30 * 60_000) } });
  for (const r of rows as Array<{ id: string }>) {
    out.tried += 1;
    try {
      const res = await finishBooking(String(r.id), { ...opts, now });
      if (res.status === 'done') out.done += 1;
      if (res.gaveUp) out.gaveUp += 1;
    } catch (err) {
      log('warn', 'booking_confirm_sweep_item_failed', { interview_id: r.id }, (err as Error)?.name && (err as Error).name !== 'Error' ? (err as Error).name : 'DatabaseError');
    }
  }
  if (out.tried) log('info', 'booking_confirm_sweep_done', out);
  return out;
}

let started = false;
/** Every 5 minutes (boot/placementBoot.ts SCHEDULERS). */
export function startBookingConfirmSweep(): void {
  if (started) return;
  started = true;
  cron.schedule('*/5 * * * *', () => {
    sweepBookingConfirms().catch((err) => log('warn', 'booking_confirm_sweep_failed', {}, (err as Error)?.name || 'DatabaseError'));
  }, { timezone: 'America/Chicago' });
}
