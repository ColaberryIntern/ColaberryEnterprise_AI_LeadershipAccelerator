import type * as Mssql from 'mssql';
import { env } from '../../config/env';

/**
 * Career Prep: one student's interviews as logged in CCPP (CB_Auto_Interview_Job_Submissions), read-only.
 *
 * Read from the base table, not vw_ColaberryInterviewPreparation: the view drops the time of day, drops students without
 * a mentor, and drops interviews without a question set. The candidate is matched by the CCPP login (dnnuser.users): by
 * user id when one is given, else by exact email. Cancelled rows come back too, so a cancelled interview can be removed.
 * A short connection per call, both timeouts bounded; the caller limits how often this runs. No retry here.
 */
export interface CcppInterview {
  id: number; company: string | null; role: string | null; jd: string | null; typeId: number | null; cancelled: boolean;
  /** Wall-clock time as typed in CCPP, no zone: 2026-12-01T10:30:00. Colaberry runs on Central time. */
  startsLocal: string;
}
export type CcppWho = { userId: number } | { email: string };
/** Two weeks back, so an interview cancelled or moved after it was linked is still seen. */
export const LOOKBACK_DAYS = 14;

const SQL_TEXT = (match: string) => `
  SELECT TOP 100 a.ID AS id, a.Company_name AS company, a.Job_Title AS role, CAST(a.Job_Description AS NVARCHAR(MAX)) AS jd,
         a.InterviewTypeID AS typeId, ISNULL(a.IsCancel, 0) AS cancelled, CONVERT(VARCHAR(19), a.Interview_Date, 126) AS startsLocal
    FROM dbo.CB_Auto_Interview_Job_Submissions a
    JOIN dnnuser.users u ON u.UserID = a.CandidateId
   WHERE ${match} AND a.Interview_Date IS NOT NULL AND a.Interview_Date > DATEADD(DAY, -${LOOKBACK_DAYS}, GETDATE())
   ORDER BY a.Interview_Date`;

export async function fetchCcppInterviews(who: CcppWho): Promise<CcppInterview[]> {
  if (!env.mssqlHost || !env.mssqlUser) throw Object.assign(new Error('CCPP is not configured'), { name: 'ConfigError' });
  // Loaded on first use: the driver is slow to load and every Career Prep route imports this module.
  const sql: typeof Mssql = await import('mssql');
  const pool = new sql.ConnectionPool({
    server: env.mssqlHost, port: env.mssqlPort, user: env.mssqlUser, password: env.mssqlPass, database: env.mssqlDatabase,
    connectionTimeout: 5000, requestTimeout: 8000, options: { encrypt: true, trustServerCertificate: true }, pool: { max: 1, min: 0 },
  });
  try {
    await pool.connect();
    const request = pool.request();
    if ('userId' in who) request.input('who', sql.Int, who.userId); else request.input('who', sql.NVarChar(256), who.email);
    const { recordset } = await request.query(SQL_TEXT('userId' in who ? 'u.UserID = @who' : 'LOWER(u.Email) = LOWER(@who)'));
    return (recordset as Array<Omit<CcppInterview, 'cancelled'> & { cancelled: number | boolean }>).map((r) => ({ ...r, cancelled: Boolean(r.cancelled) }));
  } finally { await pool.close().catch(() => undefined); }
}
