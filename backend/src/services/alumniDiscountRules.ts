/**
 * alumniDiscountRules — the pure rules of the 2026 alumni offer: 50% off the
 * ANNUAL membership for Colaberry alumni, through the end of the year.
 *
 * Ali, 2026-11-20: "Anyone labeled as alumni or [who has a] placement date
 * inside of CCPP will get 50% marked off Yearly scholarships only until the end
 * of the year." Admissions (Taiwo) asked how the 50% is applied; the answer is
 * that the app applies it on its own, with no per-person request.
 *
 * No I/O here, so accountCreditService can filter expired alumni credits
 * without importing the service that grants them (same split as
 * openHouseFlashCredit). See alumniDiscountService for the flow.
 */
import { ANNUAL_CHARGE_CENTS } from './membershipPrice';

export const ALUMNI_REASON = 'alumni_annual_2026';

/** 50% of the annual year ($1,788 -> $894). */
export const ALUMNI_CENTS = Math.round(ANNUAL_CHARGE_CENTS / 2);

/** The offer closes at the end of 31 Dec 2026, Central (CST = UTC-6). */
export const ALUMNI_OFFER_END_MS = Date.parse('2027-01-01T06:00:00Z');

/** A checkout begun before the deadline may settle a little after it. */
export const ALUMNI_SETTLE_GRACE_MS = 2 * 60 * 60 * 1000;

/** Whether new alumni credits may be granted at `nowMs`. */
export function isAlumniOfferOpen(nowMs: number): boolean {
  return nowMs < ALUMNI_OFFER_END_MS;
}

/** The idempotency key: one alumni credit per enrollment, ever. */
export function alumniSourceId(enrollmentId: string): string {
  return `ALUMNI2026-${enrollmentId}`;
}

/**
 * Whether a credit row is an alumni credit past the offer end (+ grace). An
 * unspent alumni credit stops discounting checkouts on 1 Jan 2027; other
 * credits never expire here.
 */
export function isAlumniCreditExpired(reason: string | null | undefined, nowMs: number, graceMs = 0): boolean {
  return reason === ALUMNI_REASON && nowMs >= ALUMNI_OFFER_END_MS + graceMs;
}

/** The fields of a `leads` row that mark a person as an alumnus. */
export interface AlumniLeadSignal {
  lead_source_type?: string | null;
  source?: string | null;
  hired_date?: string | null;
}

/**
 * Whether a lead row says this person is an alumnus: labeled alumni (the CCPP
 * import sets lead_source_type='alumni' and source='ccpp_alumni'), or it
 * carries a CCPP placement (hired) date.
 */
export function leadMarksAlumni(row: AlumniLeadSignal | null | undefined): boolean {
  if (!row) return false;
  if (String(row.lead_source_type || '').toLowerCase() === 'alumni') return true;
  if (String(row.source || '').toLowerCase() === 'ccpp_alumni') return true;
  return !!(row.hired_date && String(row.hired_date).trim());
}
