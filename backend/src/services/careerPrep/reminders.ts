import cron from 'node-cron';
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { guardedSendMail, resolveEmailRecipient } from '../emailService';
import { getSetting } from '../settingsService';
import { careerPrepEnabled } from './careerPrepFlag';
import { afterQuietHours, inQuietHours, reminderTime, type ReminderKind } from './reminderTime';
import { NotFoundError } from './sessions';

/**
 * Career Prep v27, CP4.5: "Remind me tonight at 6:00 PM" and "Same time tomorrow" (prep_reminders).
 *
 *   schedule   keyed (ref, kind), ref = session:<id> or plan:<id>, UNIQUE, so asking twice makes ONE
 *              reminder. The plan or session must be the caller's own (else "not found").
 *   send       every 5 minutes: due rows are CLAIMED (pending -> sent, FOR UPDATE SKIP LOCKED) before
 *              anything goes out, so two processes never send the same one. A reminder more than 12 hours
 *              late (held by the kill switch, or by downtime) is skipped as Stale, never sent late. In quiet hours nothing is sent
 *              and due rows move to 8:00 AM Central. A student no longer on the Career Prep allow-list is
 *              skipped. A failed email marks the row failed with its error class.
 *   channels   email (plain text) through the existing mail path (guardedSendMail, test-mode redirect),
 *              and in the app: the room asks GET /reminders and Cora says so when one was sent today.
 *
 * KILL SWITCH: system_settings key `career_prep_reminders_off` = true stops every send (pending rows wait).
 * To cancel everything pending, by hand:
 *   UPDATE prep_reminders SET status = 'cancelled' WHERE status = 'pending';
 */
export const KILL_SWITCH = 'career_prep_reminders_off';
export interface ReminderView { id: string; kind: ReminderKind; sendAt: string; status: string }
type Row = { id: string; kind: ReminderKind; send_at: string | Date; status: string };
const view = (r: Row): ReminderView => ({ id: String(r.id), kind: r.kind, sendAt: new Date(r.send_at).toISOString(), status: r.status });

async function ownedStart(enrollmentId: string, ref: { sessionId?: string; planId?: string }): Promise<Date | null> {
  const [rows] = ref.sessionId
    ? await sequelize.query('SELECT started_at FROM prep_sessions WHERE id = :id AND enrollment_id = :e', { replacements: { id: ref.sessionId, e: enrollmentId } })
    : await sequelize.query('SELECT NULL AS started_at FROM prep_plans WHERE id = :id AND enrollment_id = :e', { replacements: { id: ref.planId, e: enrollmentId } });
  const r = (rows as Array<{ started_at: string | null }>)[0];
  if (!r) throw new NotFoundError();
  return r.started_at ? new Date(r.started_at) : null;
}

export async function scheduleReminder(enrollmentId: string, kind: ReminderKind, ref: { sessionId?: string; planId?: string }, now = new Date()): Promise<{ reminder: ReminderView; created: boolean }> {
  const from = await ownedStart(enrollmentId, ref);
  const sendAt = reminderTime(kind, now, from ?? now);
  const key = ref.sessionId ? `session:${ref.sessionId}` : `plan:${ref.planId}`;
  const [made] = await sequelize.query(
    `INSERT INTO prep_reminders (enrollment_id, ref, kind, send_at) VALUES (:e, :ref, :kind, :at)
     ON CONFLICT (ref, kind) DO NOTHING RETURNING id, kind, send_at, status`,
    { replacements: { e: enrollmentId, ref: key, kind, at: sendAt } });
  if ((made as Row[]).length) return { reminder: view((made as Row[])[0]), created: true };
  const [found] = await sequelize.query('SELECT id, kind, send_at, status FROM prep_reminders WHERE ref = :ref AND kind = :kind AND enrollment_id = :e',
    { replacements: { ref: key, kind, e: enrollmentId } });
  return { reminder: view((found as Row[])[0]), created: false };
}

/** Pending reminders, and any sent in the last 12 hours (the room's in-app line reads these). */
export async function listReminders(enrollmentId: string, now = new Date()): Promise<ReminderView[]> {
  const [rows] = await sequelize.query(
    `SELECT id, kind, send_at, status FROM prep_reminders WHERE enrollment_id = :e
       AND (status = 'pending' OR (status = 'sent' AND sent_at > :now::timestamptz - INTERVAL '12 hours')) ORDER BY send_at`,
    { replacements: { e: enrollmentId, now } });
  return (rows as Row[]).map(view);
}

const killed = async (read: (k: string) => Promise<unknown>): Promise<boolean> => {
  try { const v = await read(KILL_SWITCH); return v === true || v === 'true'; } catch { return true; }
};

export interface SendDeps { read?: (k: string) => Promise<unknown>; enabled?: (e: string) => Promise<boolean>; mail?: (to: string, name: string | null) => Promise<void> }
type Due = { id: string; enrollment_id: string; email: string | null; full_name: string | null };

/** One pass of the sender. Returns how many reminders went out. */
export const STALE_HOURS = 12;

export async function sendDueReminders(now = new Date(), deps: SendDeps = {}): Promise<number> {
  if (await killed(deps.read ?? getSetting)) return 0;
  await sequelize.query(`UPDATE prep_reminders SET status = 'skipped', error_class = 'Stale' WHERE status = 'pending' AND send_at < :cut`,
    { replacements: { cut: new Date(now.getTime() - STALE_HOURS * 3_600_000) } });
  if (inQuietHours(now)) {
    await sequelize.query(`UPDATE prep_reminders SET send_at = :next WHERE status = 'pending' AND send_at <= :now`, { replacements: { next: afterQuietHours(now), now } });
    return 0;
  }
  const [claimed] = await sequelize.query(
    `UPDATE prep_reminders r SET status = 'sent', sent_at = :now FROM enrollments en
      WHERE r.enrollment_id = en.id AND r.id IN (SELECT id FROM prep_reminders WHERE status = 'pending' AND send_at <= :now ORDER BY send_at LIMIT 50 FOR UPDATE SKIP LOCKED)
      RETURNING r.id, r.enrollment_id, en.email, en.full_name`, { replacements: { now } });
  let sent = 0;
  for (const d of claimed as Due[]) sent += await deliver(d, deps);
  return sent;
}

async function deliver(d: Due, deps: SendDeps): Promise<number> {
  const mark = (status: string, errorClass: string | null) => sequelize.query('UPDATE prep_reminders SET status = :s, error_class = :c WHERE id = :id', { replacements: { s: status, c: errorClass, id: d.id } });
  if (!(await (deps.enabled ?? careerPrepEnabled)(String(d.enrollment_id))) || !d.email) { await mark('skipped', d.email ? 'NotEnabled' : 'NoEmail'); return 0; }
  try { await (deps.mail ?? mailReminder)(d.email, d.full_name); return 1; } catch (err) {
    await mark('failed', String((err as Error)?.name || 'UpstreamUnavailable').slice(0, 40));
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'career_prep_reminder_failed', outcome: 'failure', error_class: (err as Error)?.name || 'UpstreamUnavailable' }));
    return 0;
  }
}

/** Plain-text email (the outbound rule): who it is from, why, and the one link. */
export async function mailReminder(to: string, fullName: string | null): Promise<void> {
  const first = (fullName ?? '').trim().split(/\s+/)[0];
  const r = await resolveEmailRecipient(to, 'Your Career Prep session');
  const link = `${env.frontendUrl}/portal/career/room`;
  await guardedSendMail({ from: `"Cora at Colaberry" <${env.emailFrom}>`, to: r.to, subject: r.subject,
    text: `Hi${first ? ` ${first}` : ''},\n\nThis is the reminder you asked for: your Career Prep session with Cora is ready when you are.\n\n${link}\n\nCora, your interview coach` });
}

let started = false;
/** Registers the 5-minute sender once per process. */
export function startReminderCron(): void {
  if (started) return;
  started = true;
  cron.schedule('*/5 * * * *', () => {
    sendDueReminders().then((n) => { if (n) console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'backend', event: 'career_prep_reminders_sent', context: { count: n } })); })
      .catch((err) => console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'career_prep_reminders_pass_failed', outcome: 'failure', error_class: (err as Error)?.name || 'DatabaseError' })));
  }, { timezone: 'America/Chicago' });
}
