/**
 * CP11.1 tests: a HOSTILE in-memory stand-in for careerDeskStore.ts and careerDeskOpsStore.ts. Each statement's effect is
 * applied only as the statement says (conditional updates return false when their WHERE would not match). EVERY row it
 * hands back also carries the sentinel provider link (room_url, a join_url, a meeting_link inside summaries) and the
 * learner's personal email and phone, so the desk's views must copy named fields only. Use it from a jest.mock factory:
 *   jest.mock('../careerDeskStore', () => require('./helpers/fakeDeskStore').storeModule);
 * The real statements run on Postgres in careerDeskStore.integration.test.ts.
 */
import { SENTINEL_PROVIDER_URL } from './noRoomUrl';

type Row = Record<string, unknown>;
export const HOSTILE = { room_url: SENTINEL_PROVIDER_URL, room_provider_id: 'zm-1', join_url: SENTINEL_PROVIDER_URL, email: 'ann.personal@mail.example', phone: '+1 555 0100' };
export const deskDb = {
  items: [] as Row[], interviews: [] as Row[], events: [] as Row[], audits: [] as Row[], inboxes: [] as Row[], offers: [] as Row[], invoices: [] as Row[],
  clients: [] as Row[], candidates: [] as Row[], scopeMissing: null as Row | null, fail: false,
};
export function resetDeskDb(): void {
  Object.assign(deskDb, { items: [], interviews: [], events: [], audits: [], inboxes: [], offers: [], invoices: [], clients: [], candidates: [], scopeMissing: null, fail: false });
}
const down = () => { if (deskDb.fail) throw Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }); };
const hostile = <T extends Row>(r: T) => ({ ...HOSTILE, ...r });
const iv = (id: unknown) => deskDb.interviews.find((x) => x.id === id);
const name = (e: unknown) => `Learner ${String(e).slice(0, 4)}`;
const run = async <T>(fn: (t: unknown) => Promise<T>) => fn({});

const queueStore = {
  openItems: async () => { down(); return deskDb.items.filter((i) => i.status === 'open').map((i) => hostile({ ...i, full_name: name(i.enrollment_id) })); },
  item: async (id: string) => { down(); const i = deskDb.items.find((x) => x.id === id); return i ? hostile({ ...i }) : undefined; },
  related: async (ids: string[]) => deskDb.interviews.filter((x) => ids.includes(String(x.enrollment_id))).map((x) => hostile({ ...x })),
  reviewInterviews: async () => deskDb.interviews.filter((x) => x.state === 'review').map((x) => hostile({ ...x, full_name: name(x.enrollment_id), updated_at: x.updated_at ?? new Date('2026-11-20T15:00:00Z') })),
  confirmGaveUp: async (max: number) => deskDb.interviews.filter((x) => x.state === 'booked' && !x.confirm_done_at && Number(x.confirm_attempts ?? 0) >= max).map((x) => hostile({ ...x, full_name: name(x.enrollment_id) })),
  heldReplies: async () => deskDb.interviews.filter((x) => x.state === 'new' && x.booking_link_round && !x.booking_link_sent_at
    && deskDb.events.some((e) => e.src === `booking_link_held:${x.id}:${x.booking_link_round}`)).map((x) => hostile({ ...x, full_name: name(x.enrollment_id), held_at: new Date('2026-11-20T16:00:00Z') })),
  interview: async (id: string) => { down(); const x = iv(id); return x ? hostile({ ...x, full_name: name(x.enrollment_id), job_address: 'ann.jobs@gmail.com' }) : undefined; },
  sourceEvent: async (src: string) => deskDb.events.find((e) => e.inbox_src === src)?.payload,
  reviewToNew: async (id: string, c: string | null) => {
    const x = iv(id);
    if (!x || x.state !== 'review' || x.booking_link_sent_at) return null;
    Object.assign(x, { state: 'new', booking_link_round: x.booking_link_round ?? 'first', booking_link_attempts: 0, contact_email: c ?? x.contact_email });
    return String(x.booking_link_round);
  },
  makeInterview: async (n: Row) => {
    const had = deskDb.interviews.find((x) => x.source_event_id === n.sourceEventId);
    if (had) return String(had.id);
    const id = `9${String(deskDb.interviews.length + 1).padStart(7, '0')}-0000-4000-8000-000000000000`;
    deskDb.interviews.push({ id, enrollment_id: n.enrollmentId, source_event_id: n.sourceEventId, company: n.company, position: n.position, contact_email: n.contactEmail,
      state: 'review', booking_link_round: null, booking_link_sent_at: null, confidence: n.confidence });
    return id;
  },
  cancelReview: async (id: string) => { const x = iv(id); if (x?.state !== 'review') return false; x.state = 'cancelled'; return true; },
  retryConfirm: async (id: string, max: number) => { const x = iv(id); if (!x || x.state !== 'booked' || x.confirm_done_at || Number(x.confirm_attempts) < max) return false; x.confirm_attempts = 0; return true; },
  setType: async (id: string, type: string) => { const x = iv(id); if (!x || ['done', 'cancelled'].includes(String(x.state)) || x.type === type) return false; x.type = type; return true; },
  forgetReadback: async (id: string) => { const x = iv(id); if (!x) return false; x.readback_recording = null; x.readback_forgotten = true; return true; },
  resolveItem: async (id: string, by: string) => { const i = deskDb.items.find((x) => x.id === id); if (i?.status !== 'open') return false; Object.assign(i, { status: 'resolved', resolved_by: by }); return true; },
};

export const storeModule = {
  q: async () => [], inTransaction: run, queueStore,
  audit: async (a: Row) => { down(); deskDb.audits.push(a); },
};

const opsStore = {
  inboxes: async (ids: string[]) => { down(); return ids.map((e) => hostile({ enrollment_id: e, full_name: name(e), address: null, verified_at: null, last_received_at: null, last_test_at: null,
    last_test_ms: null, broken_since: null, forwarding_confirmed_at: null, confirm_pending: false, last30: 0, ...(deskDb.inboxes.find((x) => x.enrollment_id === e) ?? {}) })); },
  forwarding: async (e: string) => { const x = deskDb.inboxes.find((r) => r.enrollment_id === e); return x ? hostile({ forwarding_link: null, forwarding_code: null, forwarding_confirmed_at: null, ...x }) : undefined; },
  markForwarded: async (e: string) => { const x = deskDb.inboxes.find((r) => r.enrollment_id === e); if (!x || x.forwarding_confirmed_at) return false; x.forwarding_confirmed_at = new Date(); return true; },
  bookings: async () => { down(); return deskDb.interviews.filter((x) => x.starts_at).map((x) => hostile({ ...x, full_name: name(x.enrollment_id) })); },
  offers: async () => { down(); return deskDb.offers.map((o) => hostile({ ...o, full_name: name(o.enrollment_id) })); },
  kpis: async () => ({ open: deskDb.offers.filter((o) => o.status === 'sent').length, accepted: deskDb.offers.filter((o) => o.status === 'accepted').length,
    fees_cents: deskDb.invoices.reduce((s, i) => s + Number(i.fee_cents), 0), invoiced_cents: 0, paid_cents: deskDb.invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.fee_cents), 0) }),
  clients: async () => deskDb.clients.map((c) => hostile({ ...c, candidates: deskDb.candidates.filter((x) => x.client_id === c.id).length })),
  setInvoice: async (id: string, status: string) => { const i = deskDb.invoices.find((x) => x.id === id); if (!i) return undefined; const prev = String(i.status); i.status = status; return prev; },
  putForward: async (c: string, e: string, by: string) => {
    if (!deskDb.clients.some((x) => x.id === c)) return 'not_found';
    if (deskDb.candidates.some((x) => x.client_id === c && x.enrollment_id === e)) return 'already';
    deskDb.candidates.push({ client_id: c, enrollment_id: e, by }); return 'added';
  },
  scopeMissing: async () => (deskDb.scopeMissing ? hostile({ ...deskDb.scopeMissing }) : undefined),
};
export const opsModule = { opsStore };
