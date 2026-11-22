import cron from 'node-cron';
import { sequelize } from '../../config/database';
import { isSwitchOn, SWITCHES, type Read } from './darkSwitches';
import { bookingFailed, MAX_ATTEMPTS, sendBookingLink } from './bookingReply';

/**
 * Career Prep v27, CP8.1b: the RECOVERY for booking-link replies that did not go (a provider error, a blocked send, or a
 * crash between the ingest commit and the send). Every 5 minutes, switch-gated (career_prep_employer_mail_enabled; off:
 * the sweep does nothing at all), at most BATCH interviews per pass.
 *
 * OWED = state `new`, a stored round (booking_link_round), not sent (booking_link_sent_at NULL), and no `booking_link_held`
 * row for that round (a reply held while the switch was off is not sent behind anyone's back when it is turned on).
 * DUE   = no try yet and the interview unchanged for 2 minutes (the ingest's own first try has had its turn), or the last
 *         try more than 5 minutes ago (after 1 try) / 30 minutes ago (after 2).
 * Tries are capped at MAX_ATTEMPTS (bookingReply.ts). A row that already reached the cap but is still `new` (a crash
 * during the last try) is given up here: new -> review under its row lock, one keyed event row.
 */
export const BATCH = 20;
export const FIRST_TRY_GRACE_MS = 2 * 60_000;

type Owed = { id: string; booking_link_round: string; booking_link_attempts: number };

function log(level: 'info' | 'warn', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'warn') console.warn(line); else console.log(line);
}

export async function sweepBookingLinks(now = new Date(), read?: Read): Promise<{ tried: number; sent: number; gaveUp: number }> {
  const out = { tried: 0, sent: 0, gaveUp: 0 };
  if (!(await isSwitchOn(SWITCHES.employerMail, read))) return out;
  const [rows] = await sequelize.query(
    `SELECT i.id, i.booking_link_round, i.booking_link_attempts FROM placement_interviews i
      WHERE i.state = 'new' AND i.booking_link_round IS NOT NULL AND i.booking_link_sent_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM placement_events e WHERE e.source_event_id = 'booking_link_held:' || i.id || ':' || i.booking_link_round)
        AND ((i.booking_link_attempts = 0 AND i.updated_at < :grace)
          OR (i.booking_link_attempts = 1 AND i.booking_link_last_attempt_at < :after1)
          OR (i.booking_link_attempts >= 2 AND i.booking_link_last_attempt_at < :after2))
      ORDER BY i.created_at LIMIT ${BATCH}`,
    { replacements: { grace: new Date(now.getTime() - FIRST_TRY_GRACE_MS), after1: new Date(now.getTime() - 5 * 60_000), after2: new Date(now.getTime() - 30 * 60_000) } });
  for (const r of rows as Owed[]) {
    try {
      if (Number(r.booking_link_attempts) >= MAX_ATTEMPTS) {
        if (await bookingFailed(String(r.id), r.booking_link_round, Number(r.booking_link_attempts), 'Abandoned')) out.gaveUp += 1;
        continue;
      }
      out.tried += 1;
      const res = await sendBookingLink(String(r.id), { read, now });
      if (res.status === 'sent' || res.status === 'already_sent') out.sent += 1;
      if ((res.status === 'failed' || res.status === 'in_flight') && res.gaveUp) out.gaveUp += 1;
    } catch (err) {
      log('warn', 'booking_link_sweep_item_failed', { interview_id: r.id }, (err as Error)?.name && (err as Error).name !== 'Error' ? (err as Error).name : 'DatabaseError');
    }
  }
  if (out.tried || out.gaveUp) log('info', 'booking_link_sweep_done', out);
  return out;
}

let started = false;
/** Every 5 minutes (boot/placementBoot.ts SCHEDULERS); each pass checks the switch itself. */
export function startBookingLinkSweep(): void {
  if (started) return;
  started = true;
  cron.schedule('*/5 * * * *', () => {
    sweepBookingLinks().catch((err) => log('warn', 'booking_link_sweep_failed', {}, (err as Error)?.name || 'DatabaseError'));
  }, { timezone: 'America/Chicago' });
}
