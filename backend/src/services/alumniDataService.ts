import * as sql from 'mssql';
import { env } from '../config/env';
import { Lead } from '../models';
import { sequelize } from '../config/database';
import { Op } from 'sequelize';

// ── MSSQL Connection ────────────────────────────────────────────────────

let pool: sql.ConnectionPool | null = null;

async function connectMssql(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;

  if (!env.mssqlHost || !env.mssqlUser) {
    throw new Error('MSSQL connection not configured (MSSQL_HOST / MSSQL_USER missing)');
  }

  const config: sql.config = {
    server: env.mssqlHost,
    port: env.mssqlPort,
    user: env.mssqlUser,
    password: env.mssqlPass,
    database: env.mssqlDatabase,
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  };

  pool = new sql.ConnectionPool(config);
  await pool.connect();
  console.log(`[AlumniData] Connected to MSSQL ${env.mssqlHost}/${env.mssqlDatabase}`);
  return pool;
}

// ── Fetch Alumni ────────────────────────────────────────────────────────

export interface AlumniRecord {
  Firstname: string;
  LastName: string;
  Email: string;
  PhoneNumber: string;
  HiredDate: Date | null;
}

export async function fetchAlumniFromCCPP(): Promise<AlumniRecord[]> {
  const db = await connectMssql();
  const result = await db.request().query<AlumniRecord>(`
    SELECT Firstname, LastName, Email, PhoneNumber, HiredDate
    FROM CCPP.dbo.vw_QS_MetricsDashboard_ActiveUsers
    WHERE grouporderid = 1
      AND PhoneNumber IS NOT NULL
      AND Email IS NOT NULL
  `);
  console.log(`[AlumniData] Fetched ${result.recordset.length} alumni from CCPP`);
  return result.recordset;
}

// ── Import Alumni as Leads ──────────────────────────────────────────────

export interface AlumniImportResult {
  created: Array<{ id: number; email: string }>;
  updated: Array<{ id: number; email: string }>;
  skipped: number;
  errors: string[];
}

export async function importAlumniAsLeads(): Promise<AlumniImportResult> {
  const alumni = await fetchAlumniFromCCPP();
  const result: AlumniImportResult = { created: [], updated: [], skipped: 0, errors: [] };

  for (const row of alumni) {
    try {
      if (!row.Email || !row.Email.trim()) {
        result.skipped++;
        continue;
      }

      const email = row.Email.trim().toLowerCase();
      const name = `${(row.Firstname || '').trim()} ${(row.LastName || '').trim()}`.trim();
      const phone = (row.PhoneNumber || '').trim();

      // Dedup by email (case-insensitive)
      const existing = await Lead.findOne({
        where: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('email')),
          email,
        ),
      });

      if (existing) {
        // Update phone if changed, mark as alumni source
        const updates: Record<string, any> = {};
        if (phone && phone !== existing.phone) updates.phone = phone;
        if (existing.source !== 'ccpp_alumni') updates.source = 'ccpp_alumni';
        if (existing.lead_source_type !== 'alumni') updates.lead_source_type = 'alumni';

        if (Object.keys(updates).length > 0) {
          await existing.update(updates as any);
          result.updated.push({ id: existing.id, email });
        } else {
          result.skipped++;
        }
        continue;
      }

      // Create new lead
      const lead = await Lead.create({
        name: name || 'Alumni',
        email,
        phone,
        source: 'ccpp_alumni',
        lead_source_type: 'alumni',
        status: 'new',
        pipeline_stage: 'new_lead',
        lead_temperature: 'warm',
        interest_area: 'AI Agents Training',
        consent_contact: true,
        notes: row.HiredDate
          ? `Colaberry alumni. Hired date: ${new Date(row.HiredDate).toLocaleDateString()}`
          : 'Colaberry alumni.',
      } as any);

      result.created.push({ id: lead.id, email });
    } catch (err: any) {
      result.errors.push(`${row.Email}: ${err.message}`);
    }
  }

  console.log(`[AlumniData] Import complete: ${result.created.length} created, ${result.updated.length} updated, ${result.skipped} skipped, ${result.errors.length} errors`);
  return result;
}

/** Close the MSSQL connection pool */
export async function closeMssql(): Promise<void> {
  if (pool?.connected) {
    await pool.close();
    pool = null;
  }
}
