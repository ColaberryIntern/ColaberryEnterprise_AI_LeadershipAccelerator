import api from '../../../utils/api';

/**
 * Career Prep v27, CP11.1b (kit F9): the staff interview desk's client. The server is backend/src/routes/admin/careerDeskRoutes.ts
 * (every route requireSection('placement')); the shapes below mirror backend/src/routes/careerDeskSchemas.ts. Every label,
 * action and message on the desk is the server's: this file only carries them. No response carries a meeting link (the
 * server's provider-URL rule); the one link the desk ever shows is the Gmail confirmation a staff member asked to open.
 */
export type SwitchState = 'on' | 'off' | 'unreadable';
export interface RecordingNotice { status: 'scope_missing'; note: string; since: string }
export interface DeskOverview { recruiters: Array<{ name: string }>; switches: { employerMail: SwitchState; inboxTests: SwitchState }; recording: RecordingNotice | null; heldNote: string }
export interface DeskActionChoice { action: string; label: string }
export interface QueueItem {
  source: 'item' | 'interview'; id: string; kind: string; title: string; detail: string | null; learner: string | null; enrollmentId: string | null;
  interviewId: string | null; company: string | null; position: string | null; subject: string | null; confidence: number | null; since: string;
  needsContact: boolean; related: Array<{ interviewId: string; company: string | null; position: string | null; state: string; startsAt: string | null }>;
  actions: DeskActionChoice[];
}
export interface HeldLink { interviewId: string; learner: string | null; enrollmentId: string; company: string | null; position: string | null; hasContact: boolean; heldAt: string; heldLabel: string; action: DeskActionChoice }
export interface DeskQueue { items: QueueItem[]; held: HeldLink[]; heldNote: string }
export interface InboxLine {
  enrollmentId: string; learner: string | null; address: string | null; health: string; healthLabel: string; lastForwardedAt: string | null; lastForwardedLabel: string | null;
  last30Days: number; lastTestAt: string | null; lastTestMs: number | null; confirmationPending: boolean; canSendTest: boolean;
}
export interface DeskInboxes { testsSwitch: SwitchState; learners: InboxLine[] }
export interface BookingLine {
  interviewId: string; enrollmentId: string; learner: string | null; company: string | null; position: string | null; type: string | null; typeLine: string;
  interviewers: string[]; startsAt: string; startsLabel: string; minutes: number; state: string; stateLabel: string; recording: string | null;
}
export interface DeskBookings { recording: RecordingNotice | null; bookings: BookingLine[] }
export interface OfferLine {
  offerId: string; enrollmentId: string; learner: string | null; client: string | null; company: string; role: string; pay: string; firstYear: string; feeRate: string;
  fee: string; feeCents: number; status: string; statusLabel: string; startDate: string | null; sentAt: string; invoice: { id: string; status: string; statusLabel: string } | null;
}
export interface DeskPlacements {
  feeRate: { rate: number; label: string };
  kpis: { openOffers: number; accepted: number; feesPending: string; fees: string; invoiced: string; paid: string };
  offers: OfferLine[]; clients: Array<{ id: string; name: string; candidates: number }>;
}
export type DeskAnswer = { ok: true; outcome: string; message: string; link?: string | null; code?: string | null } | { ok: false; message: string };

const BASE = '/api/admin/placement/desk';
const id = (v: string) => encodeURIComponent(v);

/** A body without its list (a proxy page, an older server) is a failed load, never an empty desk. */
function must<T>(body: unknown, key: string): T {
  if (!body || typeof body !== 'object' || !Array.isArray((body as Record<string, unknown>)[key])) throw new Error(`ContractViolation: the desk's ${key} list is missing`);
  return body as T;
}
export const loadOverview = async (): Promise<DeskOverview> => must((await api.get(BASE)).data, 'recruiters');
export const loadQueue = async (): Promise<DeskQueue> => must((await api.get(`${BASE}/queue`)).data, 'items');
export const loadInboxes = async (): Promise<DeskInboxes> => must((await api.get(`${BASE}/inboxes`)).data, 'learners');
export const loadBookings = async (): Promise<DeskBookings> => must((await api.get(`${BASE}/bookings`)).data, 'bookings');
export const loadPlacements = async (): Promise<DeskPlacements> => must((await api.get(`${BASE}/placements`)).data, 'offers');

/** Why a load failed, in words staff can act on (403: no Placement section; anything else: try again). */
export function loadErrorText(err: unknown, what: string): string {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 403 ? 'You do not have access to Placement.' : `Could not load ${what}. Try again.`;
}

// The desk shows the server's words for every answer it gives (400 to 409, 502), so those come back as values, not throws.
const ANSWERED = new Set([400, 403, 404, 409, 502]);

/** POST one desk action; the answer is the server's message either way. A network failure or a 5xx is a plain "try again". */
export async function deskPost(path: string, body: Record<string, unknown>): Promise<DeskAnswer> {
  try {
    const r = await api.post(`${BASE}${path}`, body, { validateStatus: (s) => (s >= 200 && s < 300) || ANSWERED.has(s) });
    const data = (r.data ?? {}) as { outcome?: string; message?: string; error?: string; link?: string | null; code?: string | null };
    if (r.status >= 300) return { ok: false, message: r.status === 403 ? 'You do not have access to Placement.' : data.error || 'That did not go through. Try again.' };
    if (typeof data.message !== 'string') return { ok: false, message: 'The server answered without a result. Refresh to see where it stands.' };
    return { ok: true, outcome: String(data.outcome ?? ''), message: data.message, ...('link' in data ? { link: data.link } : {}), ...('code' in data ? { code: data.code } : {}) };
  } catch {
    return { ok: false, message: 'That did not go through. Try again.' };
  }
}

export const queueAction = (item: QueueItem, action: string, extra: { enrollmentId?: string; contactEmail?: string } = {}) => (item.source === 'item'
  ? deskPost(`/review-items/${id(item.id)}/actions`, { action, ...(extra.enrollmentId ? { enrollmentId: extra.enrollmentId } : {}) })
  : deskPost(`/interviews/${id(item.id)}/actions`, { action, ...(extra.contactEmail ? { contactEmail: extra.contactEmail } : {}) }));
export const sendHeldLink = (interviewId: string, contactEmail?: string) => deskPost(`/interviews/${id(interviewId)}/actions`, { action: 'send_link', ...(contactEmail ? { contactEmail } : {}) });
export const setInterviewType = (interviewId: string, type: string) => deskPost(`/interviews/${id(interviewId)}/type`, { type });
export const sendInboxTest = (enrollmentId: string) => deskPost(`/inboxes/${id(enrollmentId)}/test`, {});
export const forwarding = (enrollmentId: string, action: 'open' | 'confirm') => deskPost(`/inboxes/${id(enrollmentId)}/forwarding`, { action });
export const setInvoiceStatus = (invoiceId: string, status: string) => deskPost(`/invoices/${id(invoiceId)}/status`, { status });
export const putForward = (clientId: string, enrollmentId: string) => deskPost(`/clients/${id(clientId)}/candidates`, { enrollmentId });
