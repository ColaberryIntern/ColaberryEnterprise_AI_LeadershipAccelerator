import * as sql from 'mssql';
import { env } from '../config/env';

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

const DISPLAY_TZ = 'America/Chicago';
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

function toIso(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? undefined : dt.toISOString();
}

function dateLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }).format(d); // e.g. "Thu, Jul 16, 2026"
}

function timeLabel(d: Date): string {
  const t = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TZ, hour: 'numeric', minute: '2-digit',
  }).format(d);
  return `${t} CT`; // e.g. "1:30 PM CT"
}

interface EbRow {
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
 * The next upcoming, live "AI Systems Architect Accelerator Open House" event,
 * read straight from the CCPP Eventbrite mirror (`vw_EventBrite_Events_w_Cnt`).
 * Cached for 5 minutes. Returns `{ announced: false }` when there is no upcoming
 * live Open House, so the marketing card can fall back to "New date announced soon".
 * Future Open Houses appear automatically once published in Eventbrite.
 */
export async function getCurrentOpenHouseEvent(opts: { force?: boolean } = {}): Promise<OpenHouseEventInfo> {
  if (!opts.force && cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const pool = await connectCcpp();
  let row: EbRow | undefined;
  try {
    const result = await pool.request().query<EbRow>(`
      SELECT TOP 1 EventId, Name, StartDate, EndDate, Status, Is_free, Online_event, Capacity, URL, EventSignups
      FROM vw_EventBrite_Events_w_Cnt
      WHERE StartDate >= GETUTCDATE()
        AND Status = 'live'
        AND Name LIKE '%Open House%'
        AND (Name LIKE '%Architect%' OR Name LIKE '%Accelerator%')
      ORDER BY StartDate ASC
    `);
    row = result.recordset[0];
  } finally {
    await pool.close();
  }

  let data: OpenHouseEventInfo;
  if (!row) {
    data = { announced: false };
  } else {
    const start = new Date(row.StartDate);
    const isOnline = (row.Online_event || '').toLowerCase() === 'true';
    const isFree = (row.Is_free || '').toLowerCase() === 'true';
    const capacity = row.Capacity ?? null;
    const registered = row.EventSignups ?? 0;
    data = {
      announced: true,
      event_id: row.EventId,
      name: row.Name,
      starts_at: toIso(row.StartDate),
      ends_at: toIso(row.EndDate),
      timezone: DISPLAY_TZ,
      date_label: dateLabel(start),
      time_label: timeLabel(start),
      is_online: isOnline,
      is_free: isFree,
      format_label: isOnline ? 'Live online event' : 'In person',
      price_label: isFree ? 'Free to attend' : 'Paid',
      capacity,
      registered,
      seats_remaining: capacity == null ? null : Math.max(0, capacity - registered),
      rsvp_url: row.URL || undefined,
    };
  }

  cache = { at: Date.now(), data };
  return data;
}
