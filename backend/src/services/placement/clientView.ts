import { roomPageUrl } from './roomLink';
import type { CandidateRow, ClientInterviewRow, ClientOfferRow } from './clientStore';

/**
 * Career Prep v27, CP10.2: what the employer portal is shown, PURE (rows in, response shapes out; clientStore.ts scoped
 * the rows to the signed-in client). The interview's Join is the hire site's room PAGE (`/room/?i=..&e=..&t=..`, signed,
 * roomLink.ts), only for a booked interview with a time, never the meeting provider's link. Offers carry the fee: the
 * fee is the employer's (kit F7); the candidate's shape (offerService.candidateOffer) never does.
 */
export interface ClientCandidate { enrollmentId: string; name: string; initials: string; putForwardAt: string }
export interface ClientInterview {
  id: string; enrollmentId: string; candidateName: string; company: string | null; role: string | null;
  status: 'not_booked' | 'booked' | 'held' | 'cancelled'; startsAt: string | null; minutes: number | null; joinPage: string | null; recorded: boolean;
}
export interface ClientOffer {
  id: string; groupId: string; version: number; enrollmentId: string; candidateName: string; role: string; payBasis: 'yearly' | 'hourly';
  salaryCents: number | null; hourlyRateCents: number | null; hoursPerWeek: number | null; firstYearCents: number; feeRateBp: number; feeCents: number;
  startDate: string | null; respondBy: string | null; status: string; invoiceStatus: 'not_invoiced' | 'invoiced' | 'paid' | null; sentAt: string;
}

const iso = (v: Date | string) => new Date(v).toISOString();
const num = (v: string | number | null) => (v === null ? null : Number(v));
export const displayName = (n: string | null) => (n ?? '').trim() || 'Candidate';

/** "AL" for "Ann Lee", "A" for "Ann", "C" when there is no name. */
export function initials(name: string | null): string {
  const parts = displayName(name).split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export const candidateView = (r: CandidateRow): ClientCandidate => ({ enrollmentId: r.enrollment_id, name: displayName(r.full_name), initials: initials(r.full_name), putForwardAt: iso(r.put_forward_at) });

/** new / awaiting / review = not booked yet; booked; done = held; cancelled. */
function status(state: string): ClientInterview['status'] {
  if (state === 'booked') return 'booked';
  if (state === 'done') return 'held';
  if (state === 'cancelled') return 'cancelled';
  return 'not_booked';
}

export function interviewView(r: ClientInterviewRow): ClientInterview {
  const s = status(r.state);
  const start = r.starts_at ? new Date(r.starts_at) : null;
  const joinPage = s === 'booked' && start && r.minutes ? roomPageUrl(r.id, new Date(start.getTime() + r.minutes * 60_000)) : null;
  return { id: r.id, enrollmentId: r.enrollment_id, candidateName: displayName(r.full_name), company: r.company, role: r.position, status: s,
    startsAt: start ? start.toISOString() : null, minutes: r.minutes, joinPage, recorded: r.recording_consent === 'on' };
}

export function offerView(r: ClientOfferRow): ClientOffer {
  return { id: r.id, groupId: r.offer_group_id, version: r.version, enrollmentId: r.enrollment_id, candidateName: displayName(r.full_name), role: r.role,
    payBasis: r.pay_basis, salaryCents: num(r.salary_cents), hourlyRateCents: r.hourly_rate_cents, hoursPerWeek: num(r.hours_per_week),
    firstYearCents: Number(r.first_year_cents), feeRateBp: r.fee_rate_bp, feeCents: Number(r.fee_cents),
    startDate: r.start_date === null ? null : typeof r.start_date === 'string' ? r.start_date.slice(0, 10) : iso(r.start_date).slice(0, 10),
    respondBy: r.respond_by ? iso(r.respond_by) : null, status: r.status, invoiceStatus: (r.invoice_status as ClientOffer['invoiceStatus']) ?? null, sentAt: iso(r.created_at) };
}
