import sql from 'mssql';
import { env } from '../../../config/env';

/**
 * What this person did with Colaberry BEFORE this platform existed.
 *
 * Ali, 2026-09-10: "We have a lot of past students that we can get some great
 * information from CCPP and add it to the Data & Trust section just to give
 * some historical information about them as a previous customer."
 *
 * ── WHY THIS MATTERS ────────────────────────────────────────────────────────
 *
 * Measured 2026-09-10: 8,408 of our 24,771 known people have enrolment history
 * in CCPP — a third of the database. For those people the platform's own record
 * starts mid-story. Someone who paid £3,498 across two bootcamps in 2019-20 and
 * was placed into a job reads, in Postgres alone, as a cold lead.
 *
 * ── WHICH VIEWS, AND WHY ONLY THESE ─────────────────────────────────────────
 *
 *   vw_ADF_EnrollmentInfo            13,261 rows  what they studied, fee, hired, certified
 *   vw_IPBC_Students_Payment_Summary    477 rows  what they actually paid (PaySimple + PayPal)
 *   vw_ADF_Indigo_DISC_Analysis_Students 2,630 rows  DISC profile and working style
 *
 * CCPP has 1,166 tables; most are operational and keyed on internal ids rather
 * than email. These three are email-keyed, person-scoped, and answer questions
 * a reader actually has. The other candidates inspected (StudentActivity,
 * GradedActivity, Billing) carry no email column and cannot be joined to a
 * person without an id map that does not exist here.
 *
 * ── FAILURE-FIRST ───────────────────────────────────────────────────────────
 *
 * CCPP is a separate SQL Server that only production can reach. It being down,
 * slow or unconfigured must never take the 360 down with it: every path returns
 * `available: false` with a stated reason, and the profile renders without it.
 * A short timeout enforces that — a hang is not a failure a reader can see.
 */

export interface CcppEnrolment {
  className: string | null;
  courseName: string | null;
  classStartDate: string | null;
  enrollmentDate: string | null;
  fee: number | null;
  hired: boolean;
  certified: boolean;
  cancelled: boolean;
  courseFormat: string | null;
  reenrolled: boolean;
}

export interface CcppPayments {
  paysimpleCount: number | null;
  paysimpleAmount: number | null;
  paypalCount: number | null;
  paypalAmount: number | null;
}

export interface CcppDisc {
  dominance: number | null;
  influencer: number | null;
  steadiness: number | null;
  compliance: number | null;
  leadership: number | null;
  negotiation: number | null;
  flexibility: number | null;
  goalOrientation: number | null;
  /** The highest of the four DISC axes, as a plain word. */
  dominantTrait: string | null;
}

export interface CcppHistory {
  /** False when CCPP could not be reached or is not configured. */
  available: boolean;
  unavailableReason: string | null;
  enrolments: CcppEnrolment[];
  /** Sum of listed fees. NOT what they paid — see `payments` for that. */
  totalListedFees: number | null;
  everHired: boolean | null;
  everCertified: boolean | null;
  firstEnrolledAt: string | null;
  lastEnrolledAt: string | null;
  payments: CcppPayments | null;
  disc: CcppDisc | null;
}

const EMPTY = (reason: string | null): CcppHistory => ({
  available: reason === null,
  unavailableReason: reason,
  enrolments: [],
  totalListedFees: null,
  everHired: null,
  everCertified: null,
  firstEnrolledAt: null,
  lastEnrolledAt: null,
  payments: null,
  disc: null,
});

/** Bounded so a slow CCPP degrades the panel rather than the page. */
const TIMEOUT_MS = 8000;

let pool: sql.ConnectionPool | null = null;

async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  pool = await new sql.ConnectionPool({
    server: env.mssqlHost,
    port: env.mssqlPort,
    user: env.mssqlUser,
    password: env.mssqlPass,
    database: env.mssqlDatabase,
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: TIMEOUT_MS,
    connectionTimeout: TIMEOUT_MS,
    pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
  }).connect();
  return pool;
}

const truthy = (v: unknown): boolean => v === 1 || v === true || v === '1';
const iso = (v: unknown): string | null =>
  (v instanceof Date ? v.toISOString() : (typeof v === 'string' ? v : null));

/** The strongest DISC axis, named. Null when the four are absent or tied at zero. */
function strongestTrait(d: Record<string, number | null>): string | null {
  const axes: Array<[string, number | null]> = [
    ['Dominance', d.dominance], ['Influence', d.influencer],
    ['Steadiness', d.steadiness], ['Compliance', d.compliance],
  ];
  const present = axes.filter((a): a is [string, number] => typeof a[1] === 'number');
  if (present.length === 0) return null;
  const top = present.reduce((a, b) => (b[1] > a[1] ? b : a));
  return top[1] > 0 ? top[0] : null;
}

export async function loadCcppHistory(email: string): Promise<CcppHistory> {
  if (!env.mssqlHost || !env.mssqlUser) {
    return EMPTY('CCPP is not configured in this environment, so nothing before this platform can be shown.');
  }
  const addr = email.trim().toLowerCase();
  if (!addr) return EMPTY('No email to look up.');

  try {
    const p = await getPool();

    // Parameterised. The address reaches a query and is never interpolated.
    const run = (query: string) => p.request().input('email', sql.VarChar(320), addr).query(query);

    const [enrolRes, payRes, discRes] = await Promise.all([
      run(`SELECT ClassName, CourseName, ClassStartDate, EnrollmentDate, RegularFee,
                  Hired, Certified, Cancel, CourseFormat, Reenrolled
           FROM CCPP.dbo.vw_ADF_EnrollmentInfo
           WHERE LOWER(LTRIM(RTRIM(Email))) = @email
           ORDER BY EnrollmentDate DESC`),
      run(`SELECT TOP 1 TotalPaymentsCountInPaySimple, TotalAmountInPaySimple,
                  TotalPaymentsCountInPayPal, TotalAmountInPayPal
           FROM CCPP.dbo.vw_IPBC_Students_Payment_Summary
           WHERE LOWER(LTRIM(RTRIM(Email))) = @email`),
      run(`SELECT TOP 1 Dominance, Influencer, Steadiness, Compliance,
                  Leadership, Negotiation, Flexibility, GoalOrientation
           FROM CCPP.dbo.vw_ADF_Indigo_DISC_Analysis_Students
           WHERE LOWER(LTRIM(RTRIM(Email))) = @email`),
    ]);

    const enrolments: CcppEnrolment[] = enrolRes.recordset.map((r) => ({
      className: r.ClassName ?? null,
      courseName: r.CourseName ?? null,
      classStartDate: iso(r.ClassStartDate),
      enrollmentDate: iso(r.EnrollmentDate),
      fee: typeof r.RegularFee === 'number' ? r.RegularFee : null,
      hired: truthy(r.Hired),
      certified: truthy(r.Certified),
      cancelled: truthy(r.Cancel),
      courseFormat: r.CourseFormat ?? null,
      reenrolled: truthy(r.Reenrolled),
    }));

    const dates = enrolments.map((e) => e.enrollmentDate).filter((d): d is string => !!d).sort();
    const pay = payRes.recordset[0];
    const dr = discRes.recordset[0];

    const disc = dr ? {
      dominance: dr.Dominance ?? null,
      influencer: dr.Influencer ?? null,
      steadiness: dr.Steadiness ?? null,
      compliance: dr.Compliance ?? null,
      leadership: dr.Leadership ?? null,
      negotiation: dr.Negotiation ?? null,
      flexibility: dr.Flexibility ?? null,
      goalOrientation: dr.GoalOrientation ?? null,
      dominantTrait: null as string | null,
    } : null;
    if (disc) disc.dominantTrait = strongestTrait(disc as unknown as Record<string, number | null>);

    return {
      available: true,
      unavailableReason: null,
      enrolments,
      // Listed fees, not collected revenue. Naming it precisely matters: the
      // two differ, and `payments` below is the one that means money received.
      totalListedFees: enrolments.length
        ? enrolments.reduce((n, e) => n + (e.fee ?? 0), 0)
        : null,
      everHired: enrolments.length ? enrolments.some((e) => e.hired) : null,
      everCertified: enrolments.length ? enrolments.some((e) => e.certified) : null,
      firstEnrolledAt: dates[0] ?? null,
      lastEnrolledAt: dates.length ? dates[dates.length - 1] : null,
      payments: pay ? {
        paysimpleCount: pay.TotalPaymentsCountInPaySimple ?? null,
        paysimpleAmount: pay.TotalAmountInPaySimple ?? null,
        paypalCount: pay.TotalPaymentsCountInPayPal ?? null,
        paypalAmount: pay.TotalAmountInPayPal ?? null,
      } : null,
      disc,
    };
  } catch (error) {
    // Degraded, never fatal. The profile renders; this panel says why it cannot.
    return EMPTY(
      `CCPP could not be reached (${error instanceof Error ? error.constructor.name : 'Unknown'}). `
      + 'History before this platform is unavailable right now, not absent.',
    );
  }
}
