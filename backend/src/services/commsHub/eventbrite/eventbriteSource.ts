import * as fs from 'fs';
import * as sql from 'mssql';
import { connectCcpp, publicEventFilterSql, PUBLIC_EVENT_GROUP, type CcppEventRow } from '../../publicEventsService';
import { CCPP_NOW_CENTRAL } from '../../centralDate';

/**
 * Where the Communications Hub reads Eventbrite from (CH9.2). Eventbrite stays the record (Ali,
 * 2026-10-24 and 2026-11-21): the hub only READS the CCPP mirror (`EventBrite_Events`), never writes
 * it and never calls Eventbrite.
 *
 * Two sources behind one interface:
 *  - ccppSource: the real one, the same connection and the same "public event" rule as /portal/events.
 *  - fixtureSource: a JSON file of synthetic rows for the local e2e stack (CH9.9), selected by
 *    COMMS_HUB_EVENTBRITE_FIXTURE=<path>. It is honored ONLY when NODE_ENV is not 'production', so a
 *    stray variable on the server can never replace real Eventbrite data. Tested.
 *
 * Failure modes: CCPP unreachable or erroring throws (the caller turns it into 'unavailable'); MSSQL
 * not configured throws NotConfiguredError (the caller says 'not_configured'). No retries here: the
 * list is read on page load and the tab offers a retry; the connection has 15s/20s timeouts.
 */
export type EventbriteWindow = 'upcoming' | 'past';
export const UPCOMING_DAYS = 180;
export const PAST_DAYS = 90;
export const LIST_LIMIT = 100;

export interface EventbriteEventRow extends CcppEventRow { Status: string }

export interface EventbriteSource {
  readonly kind: 'ccpp' | 'fixture';
  listEvents(window: EventbriteWindow): Promise<EventbriteEventRow[]>;
}

export class NotConfiguredError extends Error {
  constructor() { super('Eventbrite (CCPP) is not configured on this server.'); this.name = 'NotConfiguredError'; }
}

/** The SQL for one window. Pure, so the window rules are testable without a database. */
export function eventsQuery(window: EventbriteWindow): string {
  const when = window === 'upcoming'
    // The same rule as /portal/events: live, starting from now through the next @days.
    ? `e.Status = 'live' AND e.StartDate > ${CCPP_NOW_CENTRAL} AND e.StartDate <= DATEADD(day, @days, ${CCPP_NOW_CENTRAL})`
    // Already started, in the last @days, and not deleted, canceled or a draft. 'started' is an
    // event happening now; 'live' covers a past event Eventbrite has not yet marked completed.
    : `e.Status IN ('live', 'started', 'completed', 'ended') AND e.StartDate <= ${CCPP_NOW_CENTRAL} AND e.StartDate >= DATEADD(day, -@days, ${CCPP_NOW_CENTRAL})`;
  return `
        SELECT TOP (@lim) e.EventId, e.Name, e.Description, e.URL, e.StartDate, e.EndDate, e.Logo_url, e.Status,
          (SELECT COUNT(DISTINCT a2.Email) FROM EventBrite_EventAttendees a2 WHERE a2.EventId = e.EventId) AS SignupCount
        FROM EventBrite_Events e
        WHERE ${when}
          AND ${publicEventFilterSql()}
        ORDER BY e.StartDate ${window === 'upcoming' ? 'ASC' : 'DESC'}`;
}

export const ccppSource: EventbriteSource = {
  kind: 'ccpp',
  async listEvents(window) {
    let pool: sql.ConnectionPool;
    try {
      pool = await connectCcpp();
    } catch (err) {
      if (/not configured/i.test(String((err as Error)?.message))) throw new NotConfiguredError();
      throw err;
    }
    try {
      const res = await pool.request()
        .input('days', sql.Int, window === 'upcoming' ? UPCOMING_DAYS : PAST_DAYS)
        .input('lim', sql.Int, LIST_LIMIT)
        .input('group', sql.NVarChar, PUBLIC_EVENT_GROUP)
        .query<EventbriteEventRow>(eventsQuery(window));
      return res.recordset;
    } finally {
      await pool.close();
    }
  },
};

interface FixtureFile { events?: Array<Omit<EventbriteEventRow, 'StartDate' | 'EndDate'> & { StartDate: string; EndDate?: string | null; window?: EventbriteWindow }> }

/** Synthetic rows for the local e2e only. StartDate/EndDate are CCPP-style Central wall-clock strings. */
export function fixtureSource(path: string): EventbriteSource {
  return {
    kind: 'fixture',
    async listEvents(window) {
      const file = JSON.parse(fs.readFileSync(path, 'utf8')) as FixtureFile;
      return (file.events ?? [])
        .filter((e) => (e.window ?? 'upcoming') === window)
        .map(({ window: _w, ...e }) => ({ ...e, StartDate: new Date(e.StartDate), EndDate: e.EndDate ? new Date(e.EndDate) : null }));
    },
  };
}

/** The source in force. The fixture is refused in production whatever the environment says. */
export function activeSource(env: NodeJS.ProcessEnv = process.env): EventbriteSource {
  const fixture = env.COMMS_HUB_EVENTBRITE_FIXTURE?.trim();
  if (fixture && env.NODE_ENV !== 'production') return fixtureSource(fixture);
  return ccppSource;
}
