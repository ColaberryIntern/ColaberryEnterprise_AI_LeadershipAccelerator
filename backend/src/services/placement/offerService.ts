import { randomUUID } from 'crypto';
import { getSetting } from '../settingsService';
import { computeFee, DEFAULT_FEE_RATE, validRate, type Pay } from './feeCalculator';
import * as store from './offerStore';
import type { OfferRow, OfferStatus } from './offerStore';

/**
 * Career Prep v27, CP10.1 (kit F7): offers, versioned, and the invoice RECORD an acceptance makes. No route calls this
 * yet (the employer portal, T26/T27, and the candidate's offers, T29, do); nothing here sends mail or charges anyone.
 *
 *   create   the employer must agree to the fee (feeAgreed: true, plus agreedBy and agreementTextVersion, both stored
 *            with the offer as agreed_by / agreement_text_version beside fee_agreed_at). The fee is computed NOW with the current rate
 *            (setting placement_fee_rate, default 1.1; a missing, unreadable or out-of-range setting uses 1.1 and says so
 *            in a log line) and STORED with the offer, so a later rate change never changes a sent offer.
 *   edit     = a new version: under the group's current-row lock, the old version is superseded and version n+1 is sent,
 *            in one transaction. Only a sent or talk_first offer can be edited; accepted, declined, withdrawn are final.
 *   respond  the candidate (their own offer only, the CURRENT version only: answering an old version is 'stale'):
 *            accept / decline / talk_first. accept makes ONE invoice record (offer_id UNIQUE). Accepting an accepted
 *            offer again is a replay: nothing new is written. Final states never move.
 *   withdraw the employer, while sent or talk_first.
 * Every write carries the caller's client key (one per click), so a double click or a retried request is a replay.
 * Failure: a database error propagates to the caller (an honest 500); every rule is also a database constraint.
 */
export interface OfferInput {
  enrollmentId: string; interviewId?: string | null; clientId?: string | null; company: string; role: string;
  pay: Pay; startDate?: string | null; respondBy?: string | null; feeAgreed: boolean;
  /** Kit F7: who ticked the agreement (at most 120 characters) and which agreement text they saw (at most 40). */
  agreedBy: string; agreementTextVersion: string; createdBy: string;
}
export type OfferResult = { status: 'ok'; offer: OfferRow; replay: boolean } | { status: 'invalid'; reason: string } | { status: 'not_found' | 'final' | 'stale' };
export type RespondResult = OfferResult | { status: 'ok'; offer: OfferRow; replay: boolean; invoiceCreated: boolean };

const EDITABLE: readonly OfferStatus[] = ['sent', 'talk_first'];

function log(event: string, context: Record<string, unknown>, errorClass: string): void {
  console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event, outcome: 'partial', error_class: errorClass, context }));
}

/** The fee rate in force: the setting when it is a valid rate (number or numeric string), else 1.1. */
export async function feeRate(read: (k: string) => Promise<unknown> = getSetting): Promise<number> {
  try {
    const v = await read('placement_fee_rate');
    if (v === null || v === undefined) return DEFAULT_FEE_RATE;
    const n = typeof v === 'string' ? Number(v) : v;
    if (validRate(n)) return n;
    log('placement_fee_rate_invalid', { value: String(v).slice(0, 20) }, 'ValidationError');
  } catch (err) {
    log('placement_fee_rate_unreadable', {}, (err as Error)?.name && (err as Error).name !== 'Error' ? (err as Error).name : 'UpstreamUnavailable');
  }
  return DEFAULT_FEE_RATE;
}

function prepare(input: OfferInput, rate: number): { ok: true; row: Omit<store.NewOffer, 'groupId' | 'version' | 'clientKey'> } | { ok: false; reason: string } {
  if (!input.feeAgreed) return { ok: false, reason: 'The employer must agree to the placement fee before the offer is sent.' };
  const by = typeof input.agreedBy === 'string' ? input.agreedBy.trim() : '';
  const ver = typeof input.agreementTextVersion === 'string' ? input.agreementTextVersion.trim() : '';
  if (!by || by.length > 120 || !ver || ver.length > 40) return { ok: false, reason: 'The offer must record who agreed to the fee and which agreement text they saw.' };
  const company = input.company.trim(); const role = input.role.trim(); const createdBy = input.createdBy.trim();
  if (!company || !role || !createdBy) return { ok: false, reason: 'An offer needs a company, a role and a sender.' };
  // Refused, never cut short: a silently shortened name would be stored as if the employer had typed it.
  if (company.length > 200) return { ok: false, reason: 'The company can be at most 200 characters.' };
  if (role.length > 200) return { ok: false, reason: 'The role can be at most 200 characters.' };
  if (createdBy.length > 120) return { ok: false, reason: 'The sender can be at most 120 characters.' };
  const f = computeFee(input.pay, rate);
  if (!f.ok) return f;
  const p = input.pay;
  return { ok: true, row: { enrollmentId: input.enrollmentId, interviewId: input.interviewId ?? null, clientId: input.clientId ?? null,
    company, role, payBasis: p.basis,
    salaryCents: p.basis === 'yearly' ? p.salaryCents : null, hourlyRateCents: p.basis === 'hourly' ? p.rateCents : null,
    hoursPerWeek: p.basis === 'hourly' ? p.hoursPerWeek : null, firstYearCents: f.fee.firstYearCents, feeRateBp: f.fee.rateBp, feeCents: f.fee.feeCents,
    startDate: input.startDate ?? null, respondBy: input.respondBy ?? null, agreedBy: by, agreementTextVersion: ver, createdBy } };
}

/** Two requests with the same key at the same moment: the loser's insert hits client_key UNIQUE; answer the winner's row as a replay. */
async function keyRace(clientKey: string, run: () => Promise<OfferResult>): Promise<OfferResult> {
  try {
    return await run();
  } catch (err) {
    if ((err as Error)?.name !== 'SequelizeUniqueConstraintError') throw err;
    const won = await store.byClientKey(clientKey);
    if (!won) throw err;
    return { status: 'ok', offer: won, replay: true };
  }
}

export async function createOffer(input: OfferInput, clientKey: string, rate?: number): Promise<OfferResult> {
  const seen = await store.byClientKey(clientKey);
  if (seen) return { status: 'ok', offer: seen, replay: true };
  const prep = prepare(input, rate ?? await feeRate());
  if (!prep.ok) return { status: 'invalid', reason: prep.reason };
  return keyRace(clientKey, () => store.inTransaction(async (t) => {
    const again = await store.byClientKey(clientKey, t);
    if (again) return { status: 'ok' as const, offer: again, replay: true };
    return { status: 'ok' as const, offer: await store.insertOffer({ ...prep.row, groupId: randomUUID(), version: 1, clientKey }, t), replay: false };
  }));
}

/** A new version of the group's current offer (the old one superseded in the same transaction). */
export async function editOffer(groupId: string, input: OfferInput, clientKey: string, rate?: number): Promise<OfferResult> {
  const seen = await store.byClientKey(clientKey);
  if (seen) return seen.offer_group_id === groupId ? { status: 'ok', offer: seen, replay: true } : { status: 'invalid', reason: 'That key belongs to another offer.' };
  const prep = prepare(input, rate ?? await feeRate());
  if (!prep.ok) return { status: 'invalid', reason: prep.reason };
  return keyRace(clientKey, () => store.inTransaction(async (t) => {
    const cur = await store.lockCurrent(groupId, t);
    // Scoped to the employer who made it (as withdrawOffer is): another client's group reads as not found.
    if (!cur || cur.enrollment_id !== input.enrollmentId || (cur.client_id ?? null) !== (input.clientId ?? null)) return { status: 'not_found' as const };
    const again = await store.byClientKey(clientKey, t);
    if (again) return { status: 'ok' as const, offer: again, replay: true };
    if (!EDITABLE.includes(cur.status)) return { status: 'final' as const };
    await store.supersede(cur.id, t);
    return { status: 'ok' as const, offer: await store.insertOffer({ ...prep.row, groupId, version: cur.version + 1, clientKey }, t), replay: false };
  }));
}

/** The candidate answers the CURRENT version of their own offer. accept makes one invoice record. */
export async function respondToOffer(enrollmentId: string, groupId: string, version: number, decision: 'accept' | 'decline' | 'talk_first'): Promise<RespondResult> {
  const to: OfferStatus = decision === 'accept' ? 'accepted' : decision === 'decline' ? 'declined' : 'talk_first';
  return store.inTransaction(async (t) => {
    const cur = await store.lockCurrent(groupId, t);
    if (!cur || cur.enrollment_id !== enrollmentId) return { status: 'not_found' as const };
    if (cur.version !== version) return { status: 'stale' as const };
    if (cur.status === to) return { status: 'ok' as const, offer: cur, replay: true, invoiceCreated: false };
    if (!EDITABLE.includes(cur.status)) return { status: 'final' as const };
    const offer = await store.setStatus(cur.id, to, t);
    const invoiceCreated = to === 'accepted' ? await store.insertInvoice(offer, t) : false;
    return { status: 'ok' as const, offer, replay: false, invoiceCreated };
  });
}

/** The employer withdraws the current version (sent or talk_first only). */
export async function withdrawOffer(groupId: string, clientId: string | null): Promise<OfferResult> {
  return store.inTransaction(async (t) => {
    const cur = await store.lockCurrent(groupId, t);
    if (!cur || (cur.client_id ?? null) !== (clientId ?? null)) return { status: 'not_found' as const };
    if (cur.status === 'withdrawn') return { status: 'ok' as const, offer: cur, replay: true };
    if (!EDITABLE.includes(cur.status)) return { status: 'final' as const };
    return { status: 'ok' as const, offer: await store.setStatus(cur.id, 'withdrawn', t), replay: false };
  });
}

/** What the CANDIDATE is shown: the offer and its pay, NEVER the fee, the rate or the invoice (kit F7: the fee is the employer's). */
export interface CandidateOffer {
  id: string; groupId: string; version: number; company: string; role: string; payBasis: 'yearly' | 'hourly';
  salaryCents: number | null; hourlyRateCents: number | null; hoursPerWeek: number | null; startDate: string | null; respondBy: string | null; status: OfferStatus;
}
export function candidateOffer(o: OfferRow): CandidateOffer {
  const n = (v: string | number | null) => (v === null ? null : Number(v));
  return { id: o.id, groupId: o.offer_group_id, version: o.version, company: o.company, role: o.role, payBasis: o.pay_basis,
    salaryCents: n(o.salary_cents), hourlyRateCents: o.hourly_rate_cents, hoursPerWeek: n(o.hours_per_week), startDate: o.start_date,
    respondBy: o.respond_by ? new Date(o.respond_by).toISOString() : null, status: o.status };
}
