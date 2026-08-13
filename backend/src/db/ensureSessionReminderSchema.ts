import { sequelize } from '../config/database';

// Restart-durable arming for the session-reminder cron.
//
// schedulerService armed both reminder sends from `const sentReminders = new
// Set<string>()` — process memory. Every backend deploy recreates the container,
// so the Set came back empty and the next 30-minute sweep re-sent both reminders
// to every active enrollment in any cohort with a class still inside the window.
// That is the CLAUDE.md idempotency rule head-on ("same input => same end state,
// no duplicate side effects"), and it is what put a day-of reminder in 55
// inboxes for Session 7 on 2026-08-13 after a 9:30 AM deploy.
//
// Two nullable timestamps on the existing live_sessions row rather than a new
// dedup table: the arming decision is per-session (the cron already loops
// sessions, then fans out to enrollments), so this is the smallest durable
// record that closes the hole. Recording the instant, not a boolean, so the
// send is also auditable after the fact — communication_logs has no row for
// these sends, which is why the original incident had to be reconstructed from
// container timestamps.
//
// Additive only: two ADD COLUMN IF NOT EXISTS statements, no alter, no drop, no
// backfill. Each is wrapped independently so a partial apply self-heals on the
// next boot and re-running is a no-op.
export async function ensureSessionReminderSchema(): Promise<void> {
  const statements: string[] = [
    `ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS reminder_24h_sent_at TIMESTAMPTZ`,
    `ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS reminder_1h_sent_at TIMESTAMPTZ`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] session reminder schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Session reminder arming schema ensured');
}
