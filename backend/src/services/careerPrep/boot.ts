import { startCareerPrepRollupCron } from './rollup';
import { failStaleAttempts } from './attempts';
import { startReminderCron } from './reminders';

/**
 * Career Prep v27: what runs once at boot, after the schema. Starts the nightly readiness rollup and the
 * 5-minute reminder sender (CP4.5), and marks
 * any "Try" answer left unscored by the restart as failed (its uploaded file did not survive), so the
 * student sees "record again" instead of a spinner. Never throws: a failure here is logged and boot goes on.
 */
export async function startCareerPrep(): Promise<void> {
  startCareerPrepRollupCron();
  startReminderCron();
  try {
    const n = await failStaleAttempts();
    if (n) console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'backend', event: 'career_prep_stale_attempts_failed', context: { count: n } }));
  } catch (err) {
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'career_prep_boot_sweep_failed', outcome: 'failure', error_class: (err as Error)?.name || 'DatabaseError' }));
  }
}
