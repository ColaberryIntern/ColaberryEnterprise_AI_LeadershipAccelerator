import type { Transaction } from 'sequelize';
import { q } from './careerDeskStore';

/**
 * Career Prep v27, CP11.1 (kit F9): the statements behind the staff desk's INBOX HEALTH, BOOKINGS and PLACEMENTS AND FEES
 * tabs (the review queue's are in careerDeskStore.ts). Read and write only; careerDeskService.ts decides.
 * No statement selects placement_interviews.room_url or room_provider_id, or the learner's personal email or phone:
 * staff see the learner's name and job-search address, which is what the desk needs. Fees are shown to staff (never to
 * candidates, T29). Every list is capped.
 */
type When = Date | string;
export interface InboxRow { enrollment_id: string; full_name: string | null; address: string | null; verified_at: When | null; last_received_at: When | null; last_test_at: When | null;
  last_test_ms: number | null; broken_since: When | null; forwarding_confirmed_at: When | null; confirm_pending: boolean | null; last30: number }
export interface BookingRow { id: string; enrollment_id: string; full_name: string | null; company: string | null; position: string | null; type: string | null; sub_type: string | null;
  state: string; starts_at: When; minutes: number | null; interviewer_emails: string[] | null; contact_name: string | null; recording_consent: string | null }
export interface OfferRow { id: string; enrollment_id: string; full_name: string | null; client_name: string | null; company: string; role: string; pay_basis: string;
  salary_cents: string | number | null; hourly_rate_cents: number | null; hours_per_week: string | number | null; first_year_cents: string | number; fee_rate_bp: number;
  fee_cents: string | number; start_date: string | Date | null; status: string; created_at: When; invoice_id: string | null; invoice_status: string | null }
export interface KpiRow { open: number; accepted: number; fees_cents: string | number; invoiced_cents: string | number; paid_cents: string | number }
export interface ForwardingRow { forwarding_link: string | null; forwarding_code: string | null; forwarding_confirmed_at: When | null }

const LIMIT = 200;

/** Every Career Prep learner (the ids), with their inbox when they have one: a learner without one reads "Not set up yet". */
const inboxes = (ids: string[], since: Date) => (ids.length ? q<InboxRow>(`SELECT e.id AS enrollment_id, e.full_name, j.address, j.verified_at, j.last_received_at,
    j.last_test_at, j.last_test_ms, j.broken_since, j.forwarding_confirmed_at,
    ((j.forwarding_link IS NOT NULL OR j.forwarding_code IS NOT NULL) AND j.forwarding_confirmed_at IS NULL) AS confirm_pending,
    (SELECT COUNT(*)::int FROM inbox_received r WHERE r.enrollment_id = e.id AND r.received_at > :since) AS last30
  FROM enrollments e LEFT JOIN job_search_inboxes j ON j.enrollment_id = e.id WHERE e.id IN (:ids) ORDER BY e.full_name NULLS LAST, e.id LIMIT 500`, { ids, since })
  : Promise.resolve([] as InboxRow[]));

const forwarding = async (e: string): Promise<ForwardingRow | undefined> => (await q<ForwardingRow>(
  'SELECT forwarding_link, forwarding_code, forwarding_confirmed_at FROM job_search_inboxes WHERE enrollment_id = :e', { e }))[0];

const markForwarded = async (e: string, t: Transaction) => (await q(`UPDATE job_search_inboxes SET forwarding_confirmed_at = NOW(), updated_at = NOW()
  WHERE enrollment_id = :e AND forwarding_confirmed_at IS NULL RETURNING id`, { e }, t)).length > 0;

const bookings = () => q<BookingRow>(`SELECT i.id, i.enrollment_id, e.full_name, i.company, i.position, i.type, i.sub_type, i.state, i.starts_at, i.minutes,
    i.interviewer_emails, i.contact_name, i.recording_consent
  FROM placement_interviews i JOIN enrollments e ON e.id = i.enrollment_id WHERE i.starts_at IS NOT NULL ORDER BY i.starts_at DESC, i.id LIMIT ${LIMIT}`);

const offers = () => q<OfferRow>(`SELECT o.id, o.enrollment_id, e.full_name, c.name AS client_name, o.company, o.role, o.pay_basis, o.salary_cents, o.hourly_rate_cents,
    o.hours_per_week, o.first_year_cents, o.fee_rate_bp, o.fee_cents, o.start_date, o.status, o.created_at, inv.id AS invoice_id, inv.status AS invoice_status
  FROM placement_offers o JOIN enrollments e ON e.id = o.enrollment_id LEFT JOIN hire_clients c ON c.id = o.client_id LEFT JOIN placement_invoices inv ON inv.offer_id = o.id
  WHERE o.superseded_at IS NULL ORDER BY o.created_at DESC, o.id LIMIT ${LIMIT}`);

/** Over every current offer, not just the listed 200. */
const kpis = async (): Promise<KpiRow> => (await q<KpiRow>(`SELECT COUNT(*) FILTER (WHERE o.status IN ('sent', 'talk_first'))::int AS open,
    COUNT(*) FILTER (WHERE o.status = 'accepted')::int AS accepted, COALESCE(SUM(inv.fee_cents), 0) AS fees_cents,
    COALESCE(SUM(inv.fee_cents) FILTER (WHERE inv.status = 'invoiced'), 0) AS invoiced_cents, COALESCE(SUM(inv.fee_cents) FILTER (WHERE inv.status = 'paid'), 0) AS paid_cents
  FROM placement_offers o LEFT JOIN placement_invoices inv ON inv.offer_id = o.id WHERE o.superseded_at IS NULL`))[0];

const clients = () => q<{ id: string; name: string; candidates: number }>(`SELECT c.id, c.name,
    (SELECT COUNT(*)::int FROM hire_client_candidates x WHERE x.client_id = c.id) AS candidates FROM hire_clients c ORDER BY c.name, c.id LIMIT 500`);

/** The invoice's status under its row lock: the previous one, or undefined when there is no such invoice. */
async function setInvoice(id: string, status: string, t: Transaction): Promise<string | undefined> {
  const [row] = await q<{ status: string }>('SELECT status FROM placement_invoices WHERE id = :id FOR UPDATE', { id }, t);
  if (!row) return undefined;
  if (row.status !== status) await q('UPDATE placement_invoices SET status = :status, updated_at = NOW() WHERE id = :id', { id, status }, t);
  return row.status;
}

/** 'added', 'already' (UNIQUE (client_id, enrollment_id)) or 'not_found' (no such client or learner). */
async function putForward(clientId: string, enrollmentId: string, by: string, t: Transaction): Promise<'added' | 'already' | 'not_found'> {
  const r = { c: clientId, e: enrollmentId, by };
  const made = await q(`INSERT INTO hire_client_candidates (client_id, enrollment_id, put_forward_by) SELECT :c, :e, :by
    WHERE EXISTS (SELECT 1 FROM hire_clients WHERE id = :c) AND EXISTS (SELECT 1 FROM enrollments WHERE id = :e)
    ON CONFLICT (client_id, enrollment_id) DO NOTHING RETURNING id`, r, t);
  if (made.length) return 'added';
  return (await q('SELECT 1 FROM hire_client_candidates WHERE client_id = :c AND enrollment_id = :e', r, t)).length ? 'already' : 'not_found';
}

/** The latest "Zoom recording permission missing" day row (zoomScopePreflight.ts) written since `since`, if any. */
const scopeMissing = async (since: Date) => (await q<{ created_at: When }>(`SELECT created_at FROM placement_events WHERE event = 'zoom_scope_missing'
  AND created_at > :since ORDER BY created_at DESC LIMIT 1`, { since }))[0];

export const opsStore = { inboxes, forwarding, markForwarded, bookings, offers, kpis, clients, setInvoice, putForward, scopeMissing };
