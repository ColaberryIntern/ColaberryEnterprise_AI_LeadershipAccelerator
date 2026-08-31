import * as sql from 'mssql';
import { env } from '../config/env';
import { OpenHouseEvent } from '../models';
import { OpenHouseView } from './openHouseTypes';
import { centralWallClockToInstant } from './centralDate';

export { centralWallClockToInstant };

/**
 * Public events for the portal: the calendar feed and the "Next event" countdown
 * (which highlights the flagship Open House).
 *
 * Source of truth is CCPP `EventBrite_Events` — the same live Eventbrite -> CCPP
 * pipeline that feeds attendees. Two facts drive the query:
 *   - `Status` carries the Eventbrite lifecycle (live / deleted / completed /
 *     draft / ended / started / canceled). Deleted events share future dates, so
 *     we require `Status = 'live'`.
 *   - "Public" is the CCPP `Registration` event group. `EventBrite_EventGroups`
 *     row ID 1 is named `Registration`; `EventBrite_EventAccess` maps EventId ->
 *     EventGroupId with its own `IsActive` flag. That label is the one CCPP
 *     maintains deliberately for prospect-facing, register-for-this events, so it
 *     is the signal we key on. It admits the AI-track events (AI Internship
 *     Presentation, AI Strategy And Collaboration, AI Friday Trends) and still
 *     excludes the recurring bootcamp sessions (SQL After Dark, Interview Prep,
 *     IPBC Saturday / Mortgage Help) and the internal COE meetups, none of which
 *     carry the label.
 *   - PUBLIC_EVENT_LIKE is a DEPRECATED name fallback OR'd onto the label check.
 *     A handful of individual occurrences of otherwise-public series are missing
 *     an active Registration row in CCPP, and dropping the name list outright
 *     would silently un-publish events the portal shows today. Delete it once
 *     CCPP labels those occurrences; see the PR that introduced this note.
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
// The CCPP event-group label that means "prospect-facing, registration open".
// `EventBrite_EventGroups.GroupName`; matched by name rather than by the literal
// ID 1 so a CCPP re-seed that renumbers the table cannot silently empty the feed.
export const PUBLIC_EVENT_GROUP = 'Registration';
// DEPRECATED name fallback — see the header note. Some individual occurrences of
// public series carry no active Registration row in CCPP; without these patterns
// they would vanish from the portal. Remove once CCPP labels every occurrence.
// Static literals (no user input), spliced into the CCPP WHERE as OR'd LIKEs.
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

interface CcppEventRow {
  EventId: string;
  Name: string;
  Description: string | null;
  URL: string | null;
  StartDate: Date;
  EndDate: Date | null;
  /** Eventbrite promo image. Absent on rows CCPP synced before the column existed. */
  Logo_url?: string | null;
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

// CCPP stores `EventBrite_Events` datetimes as CENTRAL wall-clock, but the mssql
// driver reads them as UTC (so 6:30 PM Central arrives as 18:30Z). Re-interpreting
// the naive wall-clock as America/Chicago (centralWallClockToInstant, imported
// above from centralDate.ts) recovers the true instant, DST-aware.

/** Map a CCPP `EventBrite_Events` row to the shared OpenHouseView contract (pure). */
export function ccppRowToView(r: CcppEventRow): OpenHouseView {
  return {
    id: String(r.EventId),
    title: r.Name,
    description: r.Description ?? null,
    // CCPP times are Central wall-clock read as UTC — correct them to the true instant.
    starts_at: centralWallClockToInstant(new Date(r.StartDate)),
    // Same correction for the end, which is nullable in CCPP.
    ends_at: r.EndDate ? centralWallClockToInstant(new Date(r.EndDate)) : null,
    timezone: EVENT_TZ,
    registration_url: r.URL ?? null,
    meeting_link: null,
    // Blank strings exist in CCPP alongside NULLs; normalise both to null so the
    // UI's "has an image" check is a single truthiness test.
    image_url: r.Logo_url ? String(r.Logo_url).trim() || null : null,
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
    // OR of static LIKE literals (no user input) — the deprecated name fallback.
    const allowlist = PUBLIC_EVENT_LIKE.map((p) => `e.Name LIKE '${p}'`).join(' OR ');
    // EXISTS, not a JOIN: an event may carry several active group rows, and a
    // join would emit one duplicate event per row (and burn the TOP (@lim) budget
    // on them). The group name is bound as a parameter, not interpolated.
    const res = await pool
      .request()
      .input('days', sql.Int, FETCH_WINDOW_DAYS)
      .input('lim', sql.Int, FETCH_LIMIT)
      .input('group', sql.NVarChar, PUBLIC_EVENT_GROUP)
      .query<CcppEventRow>(`
        SELECT TOP (@lim) e.EventId, e.Name, e.Description, e.URL, e.StartDate, e.EndDate, e.Logo_url
        FROM EventBrite_Events e
        WHERE e.Status = 'live'
          AND e.StartDate > GETUTCDATE()
          AND e.StartDate <= DATEADD(day, @days, GETUTCDATE())
          AND (
            EXISTS (
              SELECT 1
              FROM EventBrite_EventAccess a
              INNER JOIN EventBrite_EventGroups g ON g.ID = a.EventGroupId
              WHERE a.EventId = e.EventId
                AND a.IsActive = 1
                AND g.GroupName = @group
            )
            OR ${allowlist}
          )
        ORDER BY e.StartDate ASC
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
    // The seeded Postgres table carries neither an end time nor an image, so the
    // Events page renders these rows text-only rather than breaking.
    ends_at: null,
    timezone: e.timezone,
    registration_url: e.registration_url,
    meeting_link: e.meeting_link,
    image_url: null,
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
