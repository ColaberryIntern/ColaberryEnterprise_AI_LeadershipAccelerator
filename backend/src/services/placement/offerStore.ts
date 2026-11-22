import type { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * Career Prep v27, CP10.1: every statement the offers need (offerService.ts decides; this only reads and writes).
 * Lock order: the offer group's CURRENT row first (FOR UPDATE), then anything else. The database is the last word on
 * every rule offerService checks: one current version per group (partial UNIQUE), one row per Send (client_key UNIQUE),
 * one invoice record per offer (offer_id UNIQUE, ON CONFLICT DO NOTHING).
 */
export interface OfferRow {
  id: string; offer_group_id: string; version: number; superseded_at: Date | string | null; client_key: string; enrollment_id: string;
  interview_id: string | null; client_id: string | null; company: string; role: string; pay_basis: 'yearly' | 'hourly';
  salary_cents: string | number | null; hourly_rate_cents: number | null; hours_per_week: string | number | null; first_year_cents: string | number;
  fee_rate_bp: number; fee_cents: string | number; start_date: string | null; respond_by: Date | string | null; fee_agreed_at: Date | string;
  agreed_by: string; agreement_text_version: string; status: OfferStatus; decided_at: Date | string | null; created_by: string; created_at: Date | string;
}
export type OfferStatus = 'sent' | 'accepted' | 'declined' | 'talk_first' | 'withdrawn';
export interface NewOffer {
  groupId: string; version: number; clientKey: string; enrollmentId: string; interviewId: string | null; clientId: string | null;
  company: string; role: string; payBasis: 'yearly' | 'hourly'; salaryCents: number | null; hourlyRateCents: number | null; hoursPerWeek: number | null;
  firstYearCents: number; feeRateBp: number; feeCents: number; startDate: string | null; respondBy: string | null; agreedBy: string; agreementTextVersion: string; createdBy: string;
}

const rows = async <T>(sql: string, replacements: Record<string, unknown>, t?: Transaction): Promise<T[]> =>
  (await sequelize.query(sql, { replacements, ...(t ? { transaction: t } : {}) }))[0] as T[];

export const inTransaction = <T>(fn: (t: Transaction) => Promise<T>): Promise<T> => sequelize.transaction(fn);

export async function byClientKey(key: string, t?: Transaction): Promise<OfferRow | undefined> {
  return (await rows<OfferRow>('SELECT * FROM placement_offers WHERE client_key = :key', { key }, t))[0];
}

/**
 * The group's current version, locked. The group's VERSION 1 row is locked first as the group's anchor (it always
 * exists and never changes), then the current row is read. Locking the current row directly loses a race: a second
 * writer waiting on it re-checks `superseded_at IS NULL` after the first commits, finds that row superseded, and gets
 * nothing (found by offerStore.integration: two concurrent edits, the second answered not_found).
 */
export async function lockCurrent(groupId: string, t: Transaction): Promise<OfferRow | undefined> {
  const anchor = await rows<{ id: string }>('SELECT id FROM placement_offers WHERE offer_group_id = :g AND version = 1 FOR UPDATE', { g: groupId }, t);
  if (!anchor.length) return undefined;
  return (await rows<OfferRow>('SELECT * FROM placement_offers WHERE offer_group_id = :g AND superseded_at IS NULL FOR UPDATE', { g: groupId }, t))[0];
}

export async function insertOffer(o: NewOffer, t: Transaction): Promise<OfferRow> {
  const [row] = await rows<OfferRow>(`INSERT INTO placement_offers (offer_group_id, version, client_key, enrollment_id, interview_id, client_id, company, role,
      pay_basis, salary_cents, hourly_rate_cents, hours_per_week, first_year_cents, fee_rate_bp, fee_cents, start_date, respond_by, fee_agreed_at,
      agreed_by, agreement_text_version, status, created_by)
    VALUES (:groupId, :version, :clientKey, :enrollmentId, :interviewId, :clientId, :company, :role, :payBasis, :salaryCents, :hourlyRateCents, :hoursPerWeek,
      :firstYearCents, :feeRateBp, :feeCents, :startDate, :respondBy, NOW(), :agreedBy, :agreementTextVersion, 'sent', :createdBy) RETURNING *`, { ...o }, t);
  return row;
}

export async function supersede(id: string, t: Transaction): Promise<void> {
  await rows('UPDATE placement_offers SET superseded_at = NOW() WHERE id = :id AND superseded_at IS NULL', { id }, t);
}

export async function setStatus(id: string, status: OfferStatus, t: Transaction): Promise<OfferRow> {
  const [row] = await rows<OfferRow>('UPDATE placement_offers SET status = :status, decided_at = NOW() WHERE id = :id RETURNING *', { id, status }, t);
  return row;
}

/** CP10.4: the columns the CANDIDATE's offers are built from. No fee, rate, first-year figure or invoice column is read. */
export type CandidateOfferRow = Pick<OfferRow, 'id' | 'offer_group_id' | 'version' | 'company' | 'role' | 'pay_basis' | 'salary_cents'
  | 'hourly_rate_cents' | 'hours_per_week' | 'start_date' | 'respond_by' | 'status'>;

/** The learner's OWN offers, current versions only, newest first (withdrawn ones included, so the sheet can say so). */
export async function candidateOffers(enrollmentId: string): Promise<CandidateOfferRow[]> {
  return rows<CandidateOfferRow>(`SELECT o.id, o.offer_group_id, o.version, o.company, o.role, o.pay_basis, o.salary_cents, o.hourly_rate_cents,
      o.hours_per_week, o.start_date, o.respond_by, o.status
    FROM placement_offers o WHERE o.enrollment_id = :e AND o.superseded_at IS NULL ORDER BY o.created_at DESC LIMIT 100`, { e: enrollmentId });
}

/** true = this call made the invoice record; false = the offer already had one. */
export async function insertInvoice(offer: OfferRow, t: Transaction): Promise<boolean> {
  const made = await rows(`INSERT INTO placement_invoices (offer_id, enrollment_id, fee_cents) VALUES (:id, :e, :fee)
    ON CONFLICT (offer_id) DO NOTHING RETURNING id`, { id: offer.id, e: offer.enrollment_id, fee: Number(offer.fee_cents) }, t);
  return made.length > 0;
}
