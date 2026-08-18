import { sequelize } from '../config/database';

// Per-enrollment notification suppression — the column that makes "DND" real.
//
// Background (2026-08-18): a student who had switched cohorts kept receiving
// her old cohort's class reminders. Staff "enabled DND for her emails" and the
// mail kept arriving. The reason is that every suppression mechanism this
// platform owns is keyed on `leads.id` and is read in exactly one place —
// communicationSafetyService.evaluateSend(), reached only from the campaign
// engine. The Accelerator senders (session reminders, missed-session mail) are
// keyed on `enrollments.id`, call none of that, and had NO suppression input of
// any kind. Their entire recipient filter was:
//
//     Enrollment.findAll({ where: { cohort_id, status: 'active' } })
//
// So there was no flag anyone could have set that would have worked. The only
// per-student lever that stopped the mail was `status != 'active'`, which also
// revokes a paying student's access — a cure worse than the disease.
//
// This adds the missing input. NULL (the default for every existing row) means
// "not suppressed", so behavior is unchanged for the whole book on day one.
//
// Recording the instant rather than a boolean, matching reminder_24h_sent_at on
// live_sessions: it doubles as the audit trail for when the pause was applied,
// which a boolean cannot give. `notifications_paused_reason` carries the why so
// a later operator does not have to guess whether a pause is still warranted.
//
// Additive only: ADD COLUMN IF NOT EXISTS, no alter, no drop, no backfill. Each
// statement is wrapped independently so a partial apply self-heals on the next
// boot, and re-running is a no-op.
export async function ensureEnrollmentNotificationSchema(): Promise<void> {
  const statements: string[] = [
    `ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS notifications_paused_at TIMESTAMPTZ`,
    `ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS notifications_paused_reason TEXT`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] enrollment notification schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Enrollment notification suppression schema ensured');
}
