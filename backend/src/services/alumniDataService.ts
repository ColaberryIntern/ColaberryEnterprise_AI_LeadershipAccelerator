import * as sql from 'mssql';
import { env } from '../config/env';
import { Lead } from '../models';
import { sequelize } from '../config/database';
import { Op } from 'sequelize';
import { buildAlumniContext } from './alumniContextEngine';

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
  RegisterDate_DAY: Date | null;
  ClassName: string | null;
  LastActivitySection: string | null;
  Mentor: string | null;
}

export async function fetchAlumniFromCCPP(): Promise<AlumniRecord[]> {
  const db = await connectMssql();
  const result = await db.request().query<AlumniRecord>(`
    SELECT DISTINCT
      Firstname, LastName, Email, PhoneNumber, HiredDate,
      RegisterDate_DAY, ClassName, LastActivitySection, Mentor
    FROM CCPP.dbo.vw_QS_MetricsDashboard_ActiveUsers
    WHERE grouporderid = 1
      AND PhoneNumber IS NOT NULL
    ORDER BY HiredDate DESC
  `);
  console.log(`[AlumniData] Fetched ${result.recordset.length} alumni from CCPP`);
  return result.recordset;
}

// ── Placement lookup (one person) ───────────────────────────────────────

/** Upper bound on the live CCPP lookup: it runs on the checkout path. */
export const CCPP_PLACEMENT_LOOKUP_TIMEOUT_MS = 5000;

/**
 * The CCPP placement (hired) date for one email, or null if CCPP has none.
 * Unlike fetchAlumniFromCCPP this does NOT require a phone number or the first
 * group order, so every placed alumnus is found. Throws on a connection error
 * or after `timeoutMs`; callers decide whether that is fatal.
 */
export async function findCcppPlacementDate(email: string, timeoutMs = CCPP_PLACEMENT_LOOKUP_TIMEOUT_MS): Promise<Date | null> {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`CCPP placement lookup exceeded ${timeoutMs}ms`), { name: 'TimeoutError' })), timeoutMs);
  });
  try {
    const lookup = (async () => {
      const db = await connectMssql();
      const result = await db.request()
        .input('email', sql.NVarChar(320), normalized)
        .query<{ HiredDate: Date | null }>(`
          SELECT TOP 1 HiredDate
          FROM CCPP.dbo.vw_QS_MetricsDashboard_ActiveUsers
          WHERE LOWER(LTRIM(RTRIM(Email))) = @email
            AND HiredDate IS NOT NULL
          ORDER BY HiredDate DESC
        `);
      return result.recordset[0]?.HiredDate ?? null;
    })();
    return await Promise.race([lookup, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
        // Update phone if changed, mark as alumni source, refresh context
        const updates: Record<string, any> = {};
        if (phone && phone !== existing.phone) updates.phone = phone;
        if (existing.source !== 'ccpp_alumni') updates.source = 'ccpp_alumni';
        if (existing.lead_source_type !== 'alumni') updates.lead_source_type = 'alumni';
        updates.alumni_context = buildAlumniContext(row);

        await existing.update(updates as any);
        result.updated.push({ id: existing.id, email });
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
        alumni_context: buildAlumniContext(row),
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
