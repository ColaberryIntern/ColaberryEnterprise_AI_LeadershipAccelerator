import * as sql from 'mssql';
import { env } from '../config/env';
import { dedupeAttendees, RawEventbriteAttendee } from '../utils/eventbriteSanitize';
import { createExplorerEnrollment } from './enrollmentService';

// Eventbrite event id for the AI Systems Architect Accelerator Open House.
export const OPEN_HOUSE_EVENT_ID = '1992498063344';

// CCPP already runs a live Eventbrite -> CCPP pipeline: every registrant lands
// in EventBrite_EventAttendees. We read from there rather than calling the
// Eventbrite API (which cannot create registrations anyway). CCPP is only
// reachable from inside the prod network, so this runs in the backend container.
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
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  });
  await pool.connect();
  return pool;
}

/**
 * True if this email already registered for the Open House on Eventbrite —
 * read from the CCPP `EventBrite_EventAttendees` mirror. Lets the portal stop
 * asking someone to RSVP for an event they've already signed up for. Fails
 * SOFT (returns false) when CCPP is unreachable, so it never blocks the schedule.
 */
export async function isEmailRegisteredForOpenHouse(
  email: string,
  eventId: string = OPEN_HOUSE_EVENT_ID,
): Promise<boolean> {
  const e = (email || '').trim().toLowerCase();
  if (!e) return false;
  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await connectCcpp();
    const result = await pool
      .request()
      .input('eventId', sql.VarChar, eventId)
      .input('email', sql.VarChar, e)
      .query<{ n: number }>(`
        SELECT COUNT(*) AS n FROM EventBrite_EventAttendees
        WHERE EventId = @eventId AND LOWER(Email) = @email
      `);
    return (result.recordset?.[0]?.n || 0) > 0;
  } catch {
    return false;
  } finally {
    if (pool) { try { await pool.close(); } catch { /* ignore */ } }
  }
}

export interface OnboardSummary {
  eventId: string;
  dryRun: boolean;
  foundRows: number;
  uniqueAttendees: number;
  created: number;
  existing: number;
  errors: string[];
}

/**
 * Onboard the event's Eventbrite registrants as Explorer accounts.
 * Dry-run by default (reports counts, creates nothing). Idempotent: re-running
 * with `dryRun: false` never duplicates accounts or re-sends login links.
 */
export async function syncOpenHouseExplorers(
  opts: { dryRun?: boolean; eventId?: string } = {}
): Promise<OnboardSummary> {
  const dryRun = opts.dryRun !== false; // default TRUE (safe)
  const eventId = opts.eventId || OPEN_HOUSE_EVENT_ID;

  const pool = await connectCcpp();
  let rows: RawEventbriteAttendee[] = [];
  try {
    const result = await pool
      .request()
      .input('eventId', sql.VarChar, eventId)
      .query<RawEventbriteAttendee>(`
        SELECT EventId, AttendeeName, Email, PhoneNumber, OrderId, CreatedDate
        FROM EventBrite_EventAttendees
        WHERE EventId = @eventId
      `);
    rows = result.recordset;
  } finally {
    await pool.close();
  }

  const attendees = dedupeAttendees(rows);
  const summary: OnboardSummary = {
    eventId,
    dryRun,
    foundRows: rows.length,
    uniqueAttendees: attendees.length,
    created: 0,
    existing: 0,
    errors: [],
  };

  if (dryRun) return summary;

  for (const a of attendees) {
    try {
      const { created } = await createExplorerEnrollment({
        name: a.name,
        email: a.email,
        phone: a.phone || undefined,
        order_id: a.order_id || undefined,
        utm_source: 'eventbrite',
        utm_campaign: 'open_house',
      });
      if (created) summary.created++;
      else summary.existing++;
    } catch (err: any) {
      summary.errors.push(`${a.email}: ${err.message}`);
    }
  }

  return summary;
}
