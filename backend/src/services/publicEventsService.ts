import * as sql from 'mssql';
import { env } from '../config/env';
import { OpenHouseEvent } from '../models';
import { OpenHouseView } from './openHouseTypes';

/**
 * Public events for the portal: the calendar feed and the "Next event" countdown
 * (which highlights the flagship Open House).
 *
 * Source of truth is CCPP `EventBrite_Events` — the same live Eventbrite -> CCPP
 * pipeline that feeds attendees. Two facts drive the query:
 *   - `Status` carries the Eventbrite lifecycle (live / deleted / completed /
 *     draft / ended / started / canceled). Deleted events share future dates, so
 *     we require `Status = 'live'`.
 *   - There is no category / IsPublic column, so "public" is an explicit NAME
 *     allowlist (see PUBLIC_EVENT_LIKE below): Open House, Competition, Talent
 *     Showcase, Financial Literacy, Good Life. The recurring bootcamp help
 *     sessions (Weekly Help Session, SQL After Dark, Interview Prep, IPBC
 *     Saturday, DA Bootcamp) and internal COE meetups are intentionally excluded.
 *
 * CCPP is only reachable from inside the prod network, so this runs in the
 * backend container. Failure-First: on any CCPP error we fall back to the
 * hand-seeded Postgres `open_house_events` table (may be empty) so the portal
 * never hard-fails, and we cache results in-memory because the onboarding
 * schedule endpoint is hit on every portal page load.
 */

// The "Next event" countdown highlights the flagship Open House (see
// getNextPublicEvent). Match Open Houses by name since CCPP has no category column.
const OPEN_HOUSE_RE = /open house/i;
// Prospect-facing event types to surface. Static literals (no user input), spliced
// into the CCPP WHERE as an OR of LIKE clauses. Add a pattern here to widen.
const PUBLIC_EVENT_LIKE: string[] = [
  '%Open House%',
  '%Competition%',       // CAP Competition
  '%Talent Showcase%',   // Data Talent Showcase
  '%Financial Literacy%',
  '%Good Life%',
];
const FETCH_WINDOW_DAYS = 180;
const FETCH_LIMIT = 100;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
// Keep an event visible through its "Join Room" live window (30 min before
// start through 30 min after) instead of dropping it the instant start_at
// passes — otherwise the join button would vanish mid-session.
const JOIN_ROOM_GRACE_MS = 30 * 60 * 1000;

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

const EVENT_TZ = 'America/Chicago';

/**
 * CCPP stores `EventBrite_Events` datetimes as CENTRAL wall-clock, but the mssql
 * driver reads them as UTC (so 6:30 PM Central arrives as 18:30Z). Re-interpret
 * the naive wall-clock as America/Chicago to recover the true instant, DST-aware.
 */
export function centralWallClockToInstant(driverDate: Date): Date {
  // The driver placed the naive wall-clock into the UTC fields.
  const guess = Date.UTC(
    driverDate.getUTCFullYear(), driverDate.getUTCMonth(), driverDate.getUTCDate(),
    driverDate.getUTCHours(), driverDate.getUTCMinutes(), driverDate.getUTCSeconds(),
  );
  // How far ahead of UTC is Central at that instant? (negative — Central is behind)
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(guess))) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  let hour = Number(parts.hour); if (hour === 24) hour = 0;
  const asCentral = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  const offset = asCentral - guess;
  return new Date(guess - offset);
}

/** Map a CCPP `EventBrite_Events` row to the shared OpenHouseView contract (pure). */
export function ccppRowToView(r: CcppEventRow): OpenHouseView {
  return {
    id: String(r.EventId),
    title: r.Name,
    description: r.Description ?? null,
    // CCPP times are Central wall-clock read as UTC — correct them to the true instant.
    starts_at: centralWallClockToInstant(new Date(r.StartDate)),
    timezone: EVENT_TZ,
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
    // OR of static LIKE literals (no user input) — the public-event allowlist.
    const allowlist = PUBLIC_EVENT_LIKE.map((p) => `Name LIKE '${p}'`).join(' OR ');
    const res = await pool
      .request()
      .input('days', sql.Int, FETCH_WINDOW_DAYS)
      .input('lim', sql.Int, FETCH_LIMIT)
      .input('graceMin', sql.Int, JOIN_ROOM_GRACE_MS / 60000)
      .query<CcppEventRow>(`
        SELECT TOP (@lim) EventId, Name, Description, URL, StartDate, EndDate
        FROM EventBrite_Events
        WHERE Status = 'live'
          AND StartDate > DATEADD(minute, -@graceMin, GETUTCDATE())
          AND StartDate <= DATEADD(day, @days, GETUTCDATE())
          AND (${allowlist})
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
  // Future (or still within the Join Room grace period), so getNextPublicEvent()[0]
  // stays populated through an event's live window (CCPP's SQL applies the same
  // grace period; this keeps the fallback consistent).
  return rows.filter((e) => new Date(e.starts_at).getTime() > now - JOIN_ROOM_GRACE_MS).map((e) => ({
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

/**
 * The event for the topbar "Next event" countdown. Prefers the flagship Open
 * House (prospect-facing), falling back to the soonest event of any kind so the
 * chip is never empty when only community events are scheduled.
 */
export async function getNextPublicEvent(): Promise<OpenHouseView | null> {
  const events = await loadUpcoming();
  return events.find((e) => OPEN_HOUSE_RE.test(e.title)) ?? events[0] ?? null;
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
