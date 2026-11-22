import { HEALTH_LABEL, inboxHealth, type InboxHealth } from './inboxHealth';
import { recordingNote, type RecState } from './roomView';
import { STATE_LABEL } from './placementInterviewsView';
import { isInterviewState } from './interviewStates';
import { money } from './feeCalculator';
import { label } from './timeLabel';
import { plain } from './careerDeskQueue';
import type { BookingRow, InboxRow, KpiRow, OfferRow } from './careerDeskOpsStore';

/**
 * Career Prep v27, CP11.1 (kit F9): the staff desk's INBOX HEALTH, BOOKINGS and PLACEMENTS AND FEES rows in plain words.
 * PURE (`now` passed in). Times are shown in Central. Staff see the learner's name and job-search address only (no
 * personal email or phone); fees are staff-only. The recruiters are D3's (Karthik and Vivek), named, never invented:
 * there is no per-learner recruiter assignment yet (the T13 roster sends recruiter = null), so none is claimed.
 */
export const RECRUITERS: ReadonlyArray<{ name: string }> = [{ name: 'Karthik' }, { name: 'Vivek' }];
export const RECORDING_SCOPE_NOTE = 'Recording unavailable: Zoom permission missing';
const CENTRAL = 'America/Chicago';
const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
const day = 24 * 60 * 60_000;

export interface InboxLine { enrollmentId: string; learner: string | null; address: string | null; health: InboxHealth; healthLabel: string;
  lastForwardedAt: string | null; lastForwardedLabel: string | null; last30Days: number; lastTestAt: string | null; lastTestMs: number | null;
  confirmationPending: boolean; canSendTest: boolean }
export function inboxLine(r: InboxRow, now: Date): InboxLine {
  const d = (v: Date | string | null) => (v ? new Date(v) : null);
  const health = inboxHealth({ address: r.address, verifiedAt: d(r.verified_at), lastReceivedAt: d(r.last_received_at), lastTestAt: d(r.last_test_at),
    lastTestMs: r.last_test_ms === null || r.last_test_ms === undefined ? null : Number(r.last_test_ms), brokenSince: d(r.broken_since) }, now);
  return { enrollmentId: r.enrollment_id, learner: plain(r.full_name, 160), address: r.address, health, healthLabel: HEALTH_LABEL[health],
    lastForwardedAt: iso(r.last_received_at), lastForwardedLabel: r.last_received_at ? label(new Date(r.last_received_at), CENTRAL) : null,
    last30Days: Number(r.last30 ?? 0), lastTestAt: iso(r.last_test_at), lastTestMs: r.last_test_ms === null ? null : Number(r.last_test_ms),
    confirmationPending: Boolean(r.confirm_pending), canSendTest: Boolean(r.address) };
}
export const since30 = (now: Date) => new Date(now.getTime() - 30 * day);

const TYPE_LABEL: Record<string, string> = { recruiter: 'Recruiter screen', hiring_manager: 'Hiring manager interview', technical: 'Technical interview', behavioral: 'Behavioral interview' };
export interface BookingLine { interviewId: string; enrollmentId: string; learner: string | null; company: string | null; position: string | null; type: string | null;
  typeLine: string; interviewers: string[]; startsAt: string; startsLabel: string; minutes: number; state: string; stateLabel: string; recording: string | null }
export function bookingLine(r: BookingRow): BookingLine {
  const minutes = Number(r.minutes ?? 30);
  const interviewers = [...new Set([plain(r.contact_name, 160), ...(r.interviewer_emails ?? []).map((e) => plain(e, 254))].filter((x): x is string => Boolean(x)))];
  const kind = (r.type && TYPE_LABEL[r.type]) || plain(r.sub_type, 60) || 'Interview';
  return { interviewId: String(r.id), enrollmentId: r.enrollment_id, learner: plain(r.full_name, 160), company: plain(r.company, 200), position: plain(r.position, 200),
    type: r.type ?? null, typeLine: `${kind}, ${minutes} min${interviewers.length ? `, with ${interviewers.join(', ')}` : ''}`, interviewers,
    startsAt: new Date(r.starts_at).toISOString(), startsLabel: label(new Date(r.starts_at), CENTRAL), minutes, state: r.state,
    stateLabel: isInterviewState(r.state) ? STATE_LABEL[r.state] : r.state, recording: recordingNote((r.recording_consent as RecState | null) ?? null) };
}

const STATUS_LABEL: Record<string, string> = { sent: 'Sent', accepted: 'Accepted', declined: 'Declined', talk_first: 'Wants to talk first', withdrawn: 'Withdrawn' };
const INVOICE_LABEL: Record<string, string> = { not_invoiced: 'Not invoiced', invoiced: 'Invoiced', paid: 'Paid' };
export const INVOICE_STATUSES = ['not_invoiced', 'invoiced', 'paid'] as const;
export const percent = (rate: number) => `${Math.round(rate * 1000) / 10}%`;
const cents = (v: string | number | null) => (v === null || v === undefined ? null : Number(v));

export interface OfferLine { offerId: string; enrollmentId: string; learner: string | null; client: string | null; company: string; role: string; pay: string;
  firstYear: string; feeRate: string; fee: string; feeCents: number; status: string; statusLabel: string; startDate: string | null; sentAt: string;
  invoice: { id: string; status: string; statusLabel: string } | null }
export function offerLine(r: OfferRow): OfferLine {
  const salary = cents(r.salary_cents); const hourly = cents(r.hourly_rate_cents);
  const pay = r.pay_basis === 'yearly' && salary !== null ? `${money(salary)} a year` : `${money(hourly ?? 0)} an hour, ${Number(r.hours_per_week ?? 0)} h a week`;
  const start = r.start_date === null ? null : (typeof r.start_date === 'string' ? r.start_date : new Date(r.start_date).toISOString()).slice(0, 10);
  return { offerId: String(r.id), enrollmentId: r.enrollment_id, learner: plain(r.full_name, 160), client: plain(r.client_name, 200), company: r.company, role: r.role, pay,
    firstYear: money(Number(r.first_year_cents)), feeRate: percent(Number(r.fee_rate_bp) / 10_000), fee: money(Number(r.fee_cents)), feeCents: Number(r.fee_cents),
    status: r.status, statusLabel: STATUS_LABEL[r.status] ?? r.status, startDate: start, sentAt: new Date(r.created_at).toISOString(),
    invoice: r.invoice_id ? { id: String(r.invoice_id), status: String(r.invoice_status), statusLabel: INVOICE_LABEL[String(r.invoice_status)] ?? String(r.invoice_status) } : null };
}

export function kpiLine(k: KpiRow | undefined) {
  const n = (v: string | number | undefined) => Number(v ?? 0);
  // feesPending: the stored fee of every current offer still open (sent or talk_first); fees: the invoice records (accepted).
  return { openOffers: n(k?.open), accepted: n(k?.accepted), feesPending: money(n(k?.pending_cents)), fees: money(n(k?.fees_cents)), invoiced: money(n(k?.invoiced_cents)), paid: money(n(k?.paid_cents)) };
}

/** The recording notice: the latest daily zoom_scope_missing row in the last two days (zoomScopePreflight.ts writes one a day). */
export const recordingNotice = (row: { created_at: Date | string } | undefined) =>
  (row ? { status: 'scope_missing' as const, note: RECORDING_SCOPE_NOTE, since: new Date(row.created_at).toISOString() } : null);
export const recordingSince = (now: Date) => new Date(now.getTime() - 2 * day);
