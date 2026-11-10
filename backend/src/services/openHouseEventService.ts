import * as sql from 'mssql';
import { env } from '../config/env';
import { centralWallClockToInstant, CCPP_NOW_CENTRAL, CENTRAL_TZ } from './centralDate';

export interface OpenHouseEventInfo {
  announced: boolean;
  event_id?: string;
  name?: string;
  starts_at?: string;
  ends_at?: string;
  timezone?: string;
  date_label?: string;
  time_label?: string;
  is_online?: boolean;
  is_free?: boolean;
  format_label?: string;
  price_label?: string;
  capacity?: number | null;
  registered?: number;
  seats_remaining?: number | null;
  rsvp_url?: string;
}

const TTL_MS = 5 * 60 * 1000; // marketing page can poll cheaply; CCPP hit at most once / 5 min
let cache: { at: number; data: OpenHouseEventInfo } | null = null;

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
  });
  await pool.connect();
  return pool;
}

function toIso(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

function dateLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }).format(d); // e.g. "Thu, Nov 19, 2026"
}

function timeLabel(d: Date): string {
  const t = new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ, hour: 'numeric', minute: '2-digit',
  }).format(d);
  return `${t} CT`; // e.g. "6:30 PM CT"
}

/** One row of CCPP's `vw_EventBrite_Events_w_Cnt`. Exported for the mapper's tests. */
export interface CcppOpenHouseRow {
  EventId: string;
  Name: string;
  StartDate: Date;
  EndDate: Date | null;
  Status: string;
  Is_free: string | null;
  Online_event: string | null;
  Capacity: number | null;
  URL: string | null;
  EventSignups: number | null;
}

/**
 * Map a CCPP row to the public contract. PURE — extracted from
 * `getCurrentOpenHouseEvent` so the time handling below can be tested without a
 * SQL Server, which is the only reason the six-hour defect survived as long as
 * it did. Mirrors `ccppRowToView` in publicEventsService, deliberately.
 *
 * THE TIME CORRECTION. CCPP stores `StartDate` as CENTRAL wall-clock and the
 * mssql driver reads it as UTC, so a 6:30 PM Central event arrives as 18:30Z.
 * `centralWallClockToInstant` recovers the true instant, DST-aware. Without it
 * this endpoint reported `2026-11-19T18:30:00Z` and labeled it "12:30 PM CT"
 * for an event starting 6:30 PM CT — six hours early, on the one endpoint whose
 * whole job is to tell the public when to show up. Measured against production
 * 2026-11-10, where `/api/v1/events` (already corrected) and this endpoint
 * disagreed about the same Eventbrite event id.
 *
 * Both labels and both ISO timestamps are derived from the corrected instant, so
 * they cannot drift apart from each other.
 */
export function ccppRowToOpenHouseInfo(row: CcppOpenHouseRow): OpenHouseEventInfo {
  const start = centralWallClockToInstant(new Date(row.StartDate));
  const end = row.EndDate ? centralWallClockToInstant(new Date(row.EndDate)) : null;
  const isOnline = (row.Online_event || '').toLowerCase() === 'true';
  const isFree = (row.Is_free || '').toLowerCase() === 'true';
  const capacity = row.Capacity ?? null;
  const registered = row.EventSignups ?? 0;
  return {
    announced: true,
    event_id: row.EventId,
    name: row.Name,
    starts_at: toIso(start),
    ends_at: toIso(end),
    timezone: CENTRAL_TZ,
    date_label: dateLabel(start),
    time_label: timeLabel(start),
    is_online: isOnline,
    is_free: isFree,
    format_label: isOnline ? 'Live online event' : 'In person',
    price_label: isFree ? 'No card needed' : 'Paid',
    capacity,
    registered,
    seats_remaining: capacity == null ? null : Math.max(0, capacity - registered),
    rsvp_url: row.URL || undefined,
  };
}

/**
 * The next upcoming, live "AI Systems Architect Accelerator Open House" event,
 * read straight from the CCPP Eventbrite mirror (`vw_EventBrite_Events_w_Cnt`).
 * Cached for 5 minutes. Returns `{ announced: false }` when there is no upcoming
 * live Open House, so the marketing card can fall back to "New date announced soon".
 * Future Open Houses appear automatically once published in Eventbrite.
 *
 * The window filter compares StartDate against `CCPP_NOW_CENTRAL`, not
 * `GETUTCDATE()`. Both sides of that comparison must be in the same frame: the
 * column is Central wall-clock, so comparing it to UTC-now retired the event six
 * hours before it started — mid-afternoon on the day, while registration was
 * still open and the marketing card was still the thing pointing people at it.
 */
export async function getCurrentOpenHouseEvent(opts: { force?: boolean } = {}): Promise<OpenHouseEventInfo> {
  if (!opts.force && cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const pool = await connectCcpp();
  let row: CcppOpenHouseRow | undefined;
  try {
    const result = await pool.request().query<CcppOpenHouseRow>(`
      SELECT TOP 1 EventId, Name, StartDate, EndDate, Status, Is_free, Online_event, Capacity, URL, EventSignups
      FROM vw_EventBrite_Events_w_Cnt
      WHERE StartDate > ${CCPP_NOW_CENTRAL}
        AND Status = 'live'
        AND Name LIKE '%Open House%'
        AND (Name LIKE '%Architect%' OR Name LIKE '%Accelerator%')
      ORDER BY StartDate ASC
    `);
    row = result.recordset[0];
  } finally {
    await pool.close();
  }

  const data: OpenHouseEventInfo = row ? ccppRowToOpenHouseInfo(row) : { announced: false };

  cache = { at: Date.now(), data };
  return data;
}

/** Drop the cached event. Exported for tests and for an admin cache bust. */
export function clearOpenHouseEventCache(): void {
  cache = null;
}
