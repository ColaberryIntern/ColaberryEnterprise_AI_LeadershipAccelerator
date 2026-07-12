import * as sql from 'mssql';
import { env } from '../config/env';
import { OpenHouseEvent } from '../models';
import { OpenHouseView } from './openHouseTypes';

/**
 * Public (prospect-facing) events for the portal: the "Next event" countdown and
 * the next-30-days calendar feed.
 *
 * Source of truth is CCPP `EventBrite_Events` — the same live Eventbrite -> CCPP
 * pipeline that feeds attendees. Two facts about that table drive the query:
 *   - Public events are labelled ONLY in the `Name` (e.g. "... Open House").
 *     There is no category / IsPublic column, so we match on the name.
 *   - `Status` carries the Eventbrite lifecycle (live / deleted / completed /
 *     draft / ended / started / canceled). Deleted events share future dates, so
 *     we require `Status = 'live'`.
 *
 * CCPP is only reachable from inside the prod network, so this runs in the
 * backend container. Failure-First: on any CCPP error we fall back to the
 * hand-seeded Postgres `open_house_events` table (may be empty) so the portal
 * never hard-fails, and we cache results in-memory because the onboarding
 * schedule endpoint is hit on every portal page load.
 */

// Prospect events are named "... Open House" in CCPP; widen here if other public
// event types (info sessions, demo days) need to surface on the calendar.
const PUBLIC_EVENT_NAME_LIKE = '%Open House%';
// Fetch a generous window once so the "next event" countdown is never capped at
// the calendar's 30-day horizon; callers slice to whatever window they render.
const FETCH_WINDOW_DAYS = 120;
const FETCH_LIMIT = 12;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

interface CcppEventRow {
  EventId: string;
  Name: string;
  Description: string | null;
  URL: string | null;
  StartDate: Date;
  EndDate: Date | null;
}

let cache: { at: number; events: OpenHouseView[] } | null = null;

async function connectCcpp(): Promise<sql.ConnectionPool> {
  if (!env.mssqlHost || !env.mssqlUser) {
    throw new Error('MSSQL connection not configured (MSSQL_HOST / MSSQL_USER missing)');
  }
  const pool = new sql.ConnectionPool({
    server: env.mssqlHost,
    port: env.mssqlPort,
    user: env.mssqlUser,
    password: env.mssqlPass,
    database: env.mssqlDatabase,
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000,
    requestTimeout: 20000,
  });
  await pool.connect();
  return pool;
}

/** Map a CCPP `EventBrite_Events` row to the shared OpenHouseView contract (pure). */
export function ccppRowToView(r: CcppEventRow): OpenHouseView {
  return {
    id: String(r.EventId),
    title: r.Name,
    description: r.Description ?? null,
    starts_at: new Date(r.StartDate),
    // CCPP has no timezone column; the org's Eventbrite events are US Central.
    timezone: 'America/Chicago',
    registration_url: r.URL ?? null,
    meeting_link: null,
  };
}

/** Keep only events starting between `nowMs` and `nowMs + days` (pure). */
export function withinDays(events: OpenHouseView[], nowMs: number, days: number): OpenHouseView[] {
  const horizon = nowMs + days * 864e5;
  return events.filter((e) => {
    const t = new Date(e.starts_at).getTime();
    return t > nowMs && t <= horizon;
  });
}

async function fetchFromCcpp(): Promise<OpenHouseView[]> {
  const pool = await connectCcpp();
  try {
    const res = await pool
      .request()
      .input('like', sql.NVarChar, PUBLIC_EVENT_NAME_LIKE)
      .input('days', sql.Int, FETCH_WINDOW_DAYS)
      .input('lim', sql.Int, FETCH_LIMIT)
      .query<CcppEventRow>(`
        SELECT TOP (@lim) EventId, Name, Description, URL, StartDate, EndDate
        FROM EventBrite_Events
        WHERE Status = 'live'
          AND Name LIKE @like
          AND StartDate > GETUTCDATE()
          AND StartDate <= DATEADD(day, @days, GETUTCDATE())
        ORDER BY StartDate ASC
      `);
    return res.recordset.map(ccppRowToView);
  } finally {
    await pool.close();
  }
}

/** Fallback: the hand-seeded Postgres `open_house_events` table (may be empty). */
async function fetchFromPostgres(): Promise<OpenHouseView[]> {
  const now = Date.now();
  const rows = await OpenHouseEvent.findAll({
    where: { status: 'scheduled' },
    order: [['starts_at', 'ASC']],
  });
  // Future-only, so getNextPublicEvent()[0] is always an upcoming event (CCPP's
  // SQL already filters future; this keeps the fallback consistent).
  return rows.filter((e) => new Date(e.starts_at).getTime() > now).map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    starts_at: e.starts_at,
    timezone: e.timezone,
    registration_url: e.registration_url,
    meeting_link: e.meeting_link,
  }));
}

/** Load the cached upcoming public events, refreshing from CCPP when stale. */
async function loadUpcoming(): Promise<OpenHouseView[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.events;

  let events: OpenHouseView[];
  try {
    events = await fetchFromCcpp();
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
      event: 'public_events_ccpp_unavailable', outcome: 'partial',
      error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message, fallback: 'postgres_open_house_events' },
    }));
    try {
      events = await fetchFromPostgres();
    } catch (err2: any) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'backend',
        event: 'public_events_fallback_failed', outcome: 'failure',
        error_class: err2?.constructor?.name ?? 'Error', context: { message: err2?.message },
      }));
      events = [];
    }
  }
  cache = { at: Date.now(), events };
  return events;
}

/** The soonest upcoming public event (for the "Next event" countdown), or null. */
export async function getNextPublicEvent(): Promise<OpenHouseView | null> {
  const events = await loadUpcoming();
  return events[0] ?? null;
}

/** Upcoming public events within `days` (default 30) for the portal calendar. */
export async function getUpcomingPublicEvents(days = 30, nowMs: number = Date.now()): Promise<OpenHouseView[]> {
  const events = await loadUpcoming();
  return withinDays(events, nowMs, days);
}

/** True if `id` is one of the current upcoming public events (RSVP validation). */
export async function isKnownPublicEvent(id: string): Promise<boolean> {
  const events = await loadUpcoming();
  return events.some((e) => e.id === id);
}

/** Test-only: clear the in-memory cache between cases. */
export function __resetPublicEventsCache(): void { cache = null; }
