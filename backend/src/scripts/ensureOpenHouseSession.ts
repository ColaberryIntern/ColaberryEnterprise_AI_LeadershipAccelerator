/**
 * Make sure the next Open House exists as a `live_sessions` row.
 *
 * WHY THIS IS NEEDED. On 2026-11-10 `live_sessions` held ZERO upcoming rows. The
 * only Open House ever recorded there is 29 Oct, completed. So the Nov 19 event
 * that the public endpoint advertises, that the landing page points at, and that
 * two people have already registered for, did not exist on our side at all -
 * which means no Meet link, nothing for the scheduler to find, and no way for a
 * registrant to attend even if somebody reminded them.
 *
 * WHY A SCRIPT AND NOT A ONE-OFF INSERT. There are three Open Houses on the
 * calendar (Nov 19, Dec 3, Dec 17) and there will be more. A row typed in by hand
 * is a row somebody has to remember to type again, and the 2026-11-10 state is
 * what that looks like after a few months. This reads the event from the same
 * service the public endpoint uses, so the session and the advertised event
 * cannot drift apart.
 *
 * IDEMPOTENT. Create-or-update, keyed on the Eventbrite id by a unique partial
 * index. Running it twice changes nothing the second time; running it after the
 * event moves updates the date and time in place rather than making a second row.
 * It never touches `reminder_24h_sent_at` or the per-registration stamps, so a
 * re-run cannot cause a re-send.
 *
 * SENDS NOTHING. This only writes the row. The scheduler does the reminding, and
 * only for registrations.
 *
 * USAGE
 *   node dist/scripts/ensureOpenHouseSession.js            # create or update
 *   node dist/scripts/ensureOpenHouseSession.js --dry-run  # report, write nothing
 *
 * OH1t (2026-11-20): the logic now lives in services/openHouseSessionSync.ts, which the
 * scheduler runs hourly (OpenHouseSessionSync) and which also books the countdown for anyone
 * who registered before the session existed. This script stays for a manual run and a dry run.
 */
import { sequelize } from '../config/database';
import { ensureNextOpenHouseSession, bookCountdownForEarlierRegistrants } from '../services/openHouseSessionSync';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const session = await ensureNextOpenHouseSession({ dryRun });
  if (session.outcome === 'unreadable_start') process.exitCode = 1;
  if (!dryRun && session.id && (session.outcome === 'created' || session.outcome === 'updated')) {
    const booking = await bookCountdownForEarlierRegistrants(session.id);
    process.stdout.write(JSON.stringify({ event: 'booking', ...booking }) + '\n');
  }
  await sequelize.close();
}

main().catch(async (err) => {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'open-house-session', event: 'unhandled_error',
    error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
    message: err instanceof Error ? err.message : String(err), outcome: 'failure',
  })}\n`);
  try { await sequelize.close(); } catch { /* already closed */ }
  process.exitCode = 1;
});
