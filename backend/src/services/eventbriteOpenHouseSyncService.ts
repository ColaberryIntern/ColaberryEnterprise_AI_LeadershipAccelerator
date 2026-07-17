import * as sql from 'mssql';
import { env } from '../config/env';
import { ingestOpenHouseBatch, OhParticipant, IngestSummary } from './openHouseIngestService';

/**
 * eventbriteOpenHouseSyncService — turn Eventbrite Open House signups into warm
 * leads in our CRM. Reads the CCPP mirror of Eventbrite attendees, keeps only
 * RECENT Open-House-event registrants (so stale 2020–2023 signups don't flood
 * the CRM as "warm"), and upserts each as a warm lead via the (idempotent)
 * openHouseIngestService.
 *
 * Runs as a one-off backfill AND on a daily schedule so new signups keep
 * creating leads automatically. Idempotent + resilient (per-row) — safe to
 * re-run and safe to run on a cron.
 */

const DEFAULT_WINDOW_DAYS = 180;

/** Distinct recent Open House registrants from the CCPP Eventbrite mirror. */
export async function pullRecentOpenHouseRegistrants(days: number = DEFAULT_WINDOW_DAYS): Promise<OhParticipant[]> {
  if (!env.mssqlHost || !env.mssqlUser) throw new Error('CCPP (MSSQL) not configured — set MSSQL_HOST/USER/PASS');
  const pool = new sql.ConnectionPool({
    server: env.mssqlHost, port: env.mssqlPort, user: env.mssqlUser, password: env.mssqlPass,
    database: env.mssqlDatabase, options: { encrypt: false, trustServerCertificate: true }, requestTimeout: 120000,
  });
  await pool.connect();
  try {
    const result = await pool.request().input('days', sql.Int, days).query(`
      SELECT DISTINCT a.Email AS email, a.AttendeeName AS name
      FROM EventBrite_EventAttendees a
      JOIN EventBrite_Events e ON CAST(a.EventId AS VARCHAR(50)) = CAST(e.EventId AS VARCHAR(50))
      WHERE e.Name LIKE '%open house%'
        AND a.Email IS NOT NULL AND LTRIM(RTRIM(a.Email)) <> ''
        AND a.CreatedDate >= DATEADD(day, -@days, GETDATE())`);
    return result.recordset
      .map((row: any) => ({ email: String(row.email || '').trim().toLowerCase(), name: (row.name || '').trim(), registered: true }))
      .filter((p) => p.email.includes('@'));
  } finally {
    await pool.close();
  }
}

export interface OhSyncResult extends IngestSummary { pulled: number; window_days: number }

/** Pull recent Eventbrite OH registrants and upsert them as warm leads. */
export async function syncEventbriteOpenHouseLeads(opts: { days?: number; apply: boolean }): Promise<OhSyncResult> {
  const days = opts.days ?? DEFAULT_WINDOW_DAYS;
  const participants = await pullRecentOpenHouseRegistrants(days);
  const summary = await ingestOpenHouseBatch(participants, { apply: opts.apply });
  return { pulled: participants.length, window_days: days, ...summary };
}
