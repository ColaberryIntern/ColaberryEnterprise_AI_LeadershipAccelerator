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
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { getCurrentOpenHouseEvent } from '../services/openHouseEventService';
import { getOrCreateExplorerCohort } from '../services/cohortService';
import { instantToWallClock, CENTRAL_TZ } from '../services/centralDate';

interface ExistingSession {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string | null;
  title: string;
  status: string;
}

function log(event: string, context: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'open-house-session',
    event,
    ...context,
  })}\n`);
}

/** "2026-11-19" and "6:30 PM" in Central, from the instant the endpoint reports. */
export function centralParts(startsAt: Date): { date: string; time: string } {
  // instantToWallClock returns ISO-SHAPED: "YYYY-MM-DDTHH:mm:ss", separated by a
  // literal T. The first version of this split on a SPACE, so it never matched:
  // `date` came back as the whole timestamp and `time` as an empty string. A dry
  // run caught it, which is the only reason it is not in the database - start_time
  // is NOT NULL, so the insert would have failed outright, and the update path
  // would have quietly written an empty time.
  //
  // Split on the separator rather than slicing by index, and assert the shape, so
  // a future change to that helper's format fails loudly here instead of writing
  // a blank clock.
  const wall = instantToWallClock(startsAt, CENTRAL_TZ);
  const [date, clock] = wall.split('T');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}/.test(clock || '')) {
    throw new Error(`unreadable wall clock from instantToWallClock: ${JSON.stringify(wall)}`);
  }
  return { date, time: clock.slice(0, 5) };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const event = await getCurrentOpenHouseEvent();
  if (!event || !event.announced || !event.event_id || !event.starts_at) {
    log('no_event_announced', { outcome: 'noop' });
    await sequelize.close();
    return;
  }

  const startsAt = new Date(event.starts_at);
  if (Number.isNaN(startsAt.getTime())) {
    log('unreadable_start', { outcome: 'failure', starts_at: event.starts_at });
    await sequelize.close();
    process.exitCode = 1;
    return;
  }
  // `end_time` is NOT NULL on this table, so an event without an end still needs
  // one. An hour is what every Open House on the calendar has run for, and it is
  // used only to decide when the session flips to 'completed'.
  const endsAt = event.ends_at ? new Date(event.ends_at) : new Date(startsAt.getTime() + 60 * 60 * 1000);
  const start = centralParts(startsAt);
  const end = centralParts(Number.isNaN(endsAt.getTime()) ? new Date(startsAt.getTime() + 60 * 60 * 1000) : endsAt);

  const cohort = await getOrCreateExplorerCohort();

  const existing = await sequelize.query<ExistingSession>(
    `SELECT id, session_date, start_time, end_time, title, status
       FROM live_sessions WHERE open_house_event_id = :eventId`,
    { replacements: { eventId: event.event_id }, type: QueryTypes.SELECT },
  );

  log('resolved', {
    event_id: event.event_id,
    title: event.name,
    date: start.date,
    start_time: start.time,
    end_time: end.time,
    cohort_id: cohort.id,
    existing: existing.length > 0 ? existing[0].id : null,
    dryRun,
  });

  if (dryRun) {
    log('dry_run', { outcome: 'noop', would: existing.length ? 'update' : 'insert' });
    await sequelize.close();
    return;
  }

  if (existing.length > 0) {
    // Never touches status or the reminder stamps: an event that moved should
    // update its when, not un-send its reminders or resurrect a completed row.
    // No `updated_at` in the SET: this table does not have that column. Checked
    // against information_schema rather than assumed - the first draft wrote it
    // and would have failed on the first run.
    await sequelize.query(
      `UPDATE live_sessions
          SET title = :title, session_date = :date, start_time = :start, end_time = :end
        WHERE id = :id`,
      {
        replacements: {
          id: existing[0].id, title: event.name, date: start.date,
          start: start.time, end: end.time,
        },
        type: QueryTypes.UPDATE,
      },
    );
    log('updated', { id: existing[0].id, outcome: 'success' });
    await sequelize.close();
    return;
  }

  // `status: 'scheduled'` is what getUpcomingSessions filters on; without it the
  // scheduler never sees this row. `session_number` is 0 because an Open House is
  // not part of the numbered curriculum.
  //
  // `session_type` stays 'core', the column default, and that is deliberate.
  // `enum_live_sessions_session_type` admits only 'core' and 'lab', enforced by
  // ck_live_sessions_session_type, so 'open_house' would be rejected outright -
  // and widening an enum plus its check constraint to label one row would be a
  // schema change with far more blast radius than this needs. What makes a
  // session an Open House is `open_house_event_id`, which is also what the
  // scheduler branches on.
  //
  // `cohort_id` is NOT NULL, so one is set - but nothing reads it for recipients.
  // The Explorer cohort is the honest answer for whose calendar this belongs on,
  // and the scheduler's `continue` is what guarantees it is never mailed.
  // QueryTypes.SELECT, not INSERT, for an `INSERT ... RETURNING`: the INSERT
  // overload is typed as returning [undefined, number] and has no row generic, so
  // asking it for the new id is the TS2769 the first push earned. SELECT is the
  // idiom for a statement that genuinely returns rows.
  const inserted = await sequelize.query<{ id: string }>(
    `INSERT INTO live_sessions
       (cohort_id, session_number, title, description, session_date, start_time, end_time,
        status, open_house_event_id, created_at)
     VALUES (:cohort, 0, :title, :description, :date, :start, :end,
             'scheduled', :eventId, NOW())
     RETURNING id`,
    {
      replacements: {
        cohort: cohort.id,
        title: event.name,
        description: 'Open House. Registrations are taken on our own landing page; reminders go to those registrants only.',
        date: start.date,
        start: start.time,
        end: end.time,
        eventId: event.event_id,
      },
      type: QueryTypes.SELECT,
    },
  );

  log('created', { id: inserted[0]?.id ?? null, outcome: 'success' });
  await sequelize.close();
}

main().catch(async (err) => {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'open-house-session',
    event: 'unhandled_error',
    error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
    message: err instanceof Error ? err.message : String(err),
    outcome: 'failure',
  })}\n`);
  try { await sequelize.close(); } catch { /* already closed */ }
  process.exitCode = 1;
});
