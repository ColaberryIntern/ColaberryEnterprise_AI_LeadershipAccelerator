/**
 * alumniDiscountService — the 2026 alumni offer: 50% off the ANNUAL membership
 * for any Colaberry alumnus, through 31 Dec 2026 (Central). Rules live in
 * alumniDiscountRules (pure); this module does the lookups and the grant.
 *
 * How it works, with no schema change (same shape as the Open House flash offer):
 *  1. When a member opens their subscription page or starts an annual checkout,
 *     ensureAlumniCredit() checks whether they are an alumnus:
 *       a. a `leads` row with their email labeled alumni (lead_source_type
 *          'alumni' / source 'ccpp_alumni') or carrying a CCPP hired date; else
 *       b. a live CCPP lookup for a placement (HiredDate) on their email.
 *  2. If so, it grants an annual-only account credit worth 50% of the year.
 *     The existing checkout applies it, so the student simply sees $894.
 *  3. After 31 Dec 2026 no new credit is granted and an unspent one stops
 *     discounting checkouts (isAlumniCreditExpired), with a short settle grace.
 *
 * Failure modes (Failure-First Design):
 *  - CCPP unreachable / slow: the lookup has a 5s timeout; the error is logged
 *    and the person is treated as "not shown to be alumni" for this request. No
 *    retry here; the next page view or checkout tries again. The checkout is
 *    never blocked (callers wrap this best-effort).
 *  - Double call / concurrent checkouts: grantCredit is idempotent on
 *    `ALUMNI2026-<enrollment id>` (UNIQUE source_event_id), so one credit max.
 *  - Stacking: never granted while an unspent 50% annual credit (Open House
 *    scholarship or flash offer) exists, or to someone already holding an
 *    active annual membership.
 * Not handled: an alumnus whose app email differs from both their lead and
 * their CCPP email. Admissions can grant manually via grantCredit.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { Enrollment } from '../models';
import { grantCredit } from './accountCreditService';
import { FLASH_REASON } from './openHouseFlashCredit';
import {
  ALUMNI_CENTS, ALUMNI_REASON, alumniSourceId, isAlumniOfferOpen, leadMarksAlumni, AlumniLeadSignal,
} from './alumniDiscountRules';

/** Unspent credits of these reasons already give 50% off the year: never stack. */
export const HALF_YEAR_CREDIT_REASONS: readonly string[] = ['open_house_scholarship_annual', FLASH_REASON, ALUMNI_REASON];

export type AlumniEvidence = 'lead_label' | 'ccpp_placement';

export interface AlumniDiscountDeps {
  findEmail(enrollmentId: string): Promise<string | null>;
  /** Count of unspent half-year credits + active annual subscriptions. */
  countBlockers(enrollmentId: string): Promise<number>;
  findLeadSignals(email: string): Promise<AlumniLeadSignal[]>;
  findCcppPlacementDate(email: string): Promise<Date | null>;
  grant: typeof grantCredit;
}

export interface AlumniCheckResult {
  granted: boolean;
  reason: 'offer_closed' | 'no_email' | 'blocked' | 'not_alumni' | 'granted' | 'already_granted';
  evidence?: AlumniEvidence;
}

/** Whether this email belongs to an alumnus, and on what evidence. CCPP errors are logged, not thrown. */
export async function alumniEvidenceFor(email: string, deps: Pick<AlumniDiscountDeps, 'findLeadSignals' | 'findCcppPlacementDate'>): Promise<AlumniEvidence | null> {
  const leads = await deps.findLeadSignals(email);
  if (leads.some(leadMarksAlumni)) return 'lead_label';
  try {
    if (await deps.findCcppPlacementDate(email)) return 'ccpp_placement';
  } catch (err: any) {
    console.error(JSON.stringify({
      level: 'warn', service: 'backend', event: 'alumni_ccpp_lookup_failed', outcome: 'failure',
      error_class: err?.name === 'TimeoutError' ? 'TimeoutError' : 'UpstreamUnavailable', context: { message: err?.message },
    }));
  }
  return null;
}

/**
 * Grant the alumni credit to this enrollment if they qualify and the offer is
 * open. Best-effort: callers wrap it so a failure never blocks a checkout.
 */
export async function ensureAlumniCredit(enrollmentId: string, nowMs: number = Date.now(), deps: AlumniDiscountDeps = defaultDeps): Promise<AlumniCheckResult> {
  if (!isAlumniOfferOpen(nowMs)) return { granted: false, reason: 'offer_closed' };
  const email = String((await deps.findEmail(enrollmentId)) || '').trim().toLowerCase();
  if (!email) return { granted: false, reason: 'no_email' };
  if ((await deps.countBlockers(enrollmentId)) > 0) return { granted: false, reason: 'blocked' };

  const evidence = await alumniEvidenceFor(email, deps);
  if (!evidence) return { granted: false, reason: 'not_alumni' };

  const { granted } = await deps.grant({
    enrollmentId,
    amountCents: ALUMNI_CENTS,
    reason: ALUMNI_REASON,
    sourceEventId: alumniSourceId(enrollmentId),
    grantedBy: 'alumni-offer-2026',
    note: `Alumni offer: 50% off the annual membership through 31 Dec 2026 (evidence: ${evidence})`,
  });
  return { granted, reason: granted ? 'granted' : 'already_granted', evidence };
}

const defaultDeps: AlumniDiscountDeps = {
  async findEmail(enrollmentId) {
    const e = await Enrollment.findByPk(enrollmentId, { attributes: ['id', 'email'] });
    return (e as any)?.email ?? null;
  },
  async countBlockers(enrollmentId) {
    // An already-applied ALUMNI credit also blocks: one alumni discount per
    // enrollment, even after its first annual charge settled.
    const rows = await sequelize.query<{ n: string }>(
      `SELECT (SELECT count(*) FROM account_credits c
                 WHERE c.enrollment_id = :eid
                   AND ((c.status = 'available' AND c.reason IN (:halfYear)) OR c.reason = :alumni))
            + (SELECT count(*) FROM subscriptions s
                 WHERE s.enrollment_id = :eid AND s.status = 'active' AND s.plan = 'annual') AS n`,
      { replacements: { eid: enrollmentId, halfYear: [...HALF_YEAR_CREDIT_REASONS], alumni: ALUMNI_REASON }, type: QueryTypes.SELECT },
    );
    return Number(rows[0]?.n || 0);
  },
  async findLeadSignals(email) {
    return sequelize.query<AlumniLeadSignal>(
      `SELECT lead_source_type, source, alumni_context->>'hired_date' AS hired_date
         FROM leads WHERE LOWER(TRIM(email)) = :email`,
      { replacements: { email }, type: QueryTypes.SELECT },
    );
  },
  async findCcppPlacementDate(email) {
    const { findCcppPlacementDate } = await import('./alumniDataService');
    return findCcppPlacementDate(email);
  },
  grant: grantCredit,
};
