import { Router, type Request, type Response } from 'express';
import type { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { logFailure, sendValidated } from '../campusRoutes';
import * as desk from '../../services/placement/careerDeskService';
import { interviewAction, itemAction, sendLink, setInterviewType, type DeskResult } from '../../services/placement/careerDeskActions';
import {
  ActionResponse, BigId, BookingsResponse, ForwardingBody, InboxesResponse, InterviewActionBody, InvoiceBody, ItemActionBody, OverviewResponse,
  PlacementsResponse, PutForwardBody, QueueResponse, TypeBody, Uuid,
} from '../careerDeskSchemas';

/**
 * Career Prep v27, CP11.1a: the staff interview desk API. EVERY route is requireSection('placement') (owner and admin
 * through ALL_SECTIONS, other staff only through a per-member extra section), and the paths sit under
 * /api/admin/placement, which mgmtSectionGate already maps to 'placement' (deny-by-default for scoped tokens).
 * Bodies and params are Zod-checked (400). No response carries the meeting provider's link (the provider-URL rule: the
 * desk's tests run expectNoRoomUrl on every one). Answers: 200 done (or "nothing changed" on a replay), 404 no such
 * thing, 409 not possible now (Send test with career_prep_inbox_tests_enabled off answers
 * 409 {error:"Inbox tests are switched off"}), 502 a send failed, 500 a database error.
 */
const BASE = '/api/admin/placement/desk';
const gate = requireSection('placement');
const staffOf = (req: Request) => String(req.admin?.sub ?? 'staff').slice(0, 80);

function bad(res: Response, what: string): void { res.status(400).json({ error: `Invalid ${what}.` }); }

function answer(res: Response, r: DeskResult & { link?: string | null; code?: string | null }, event: string): void {
  if (r.status !== 'ok') { res.status(r.status === 'not_found' ? 404 : r.status === 'conflict' ? 409 : 502).json({ error: r.message }); return; }
  const body: z.infer<typeof ActionResponse> = { outcome: r.outcome, message: r.message };
  if (r.interviewId) body.interviewId = r.interviewId;
  if ('link' in r) body.link = r.link ?? null;
  if ('code' in r) body.code = r.code ?? null;
  sendValidated(res, ActionResponse, body, event);
}

/** A read: the body through its response contract; a failure is an honest 500. */
const read = <T>(schema: z.ZodType<T>, event: string, load: () => Promise<T>) => async (_req: Request, res: Response): Promise<void> => {
  try { sendValidated(res, schema, await load(), event); } catch (err) { logFailure(`${event}_failed`, err); res.status(500).json({ error: 'Could not load the desk.' }); }
};

/** An action: params and body checked first (400), then the service; a failure is an honest 500. */
function act<B>(param: z.ZodType<string>, body: z.ZodType<B>, event: string, run: (id: string, b: B, staff: string) => Promise<DeskResult>) {
  return async (req: Request, res: Response): Promise<void> => {
    const id = param.safeParse(Object.values(req.params)[0]);
    if (!id.success) { bad(res, 'id'); return; }
    const b = body.safeParse(req.body ?? {});
    if (!b.success) { bad(res, 'request'); return; }
    try { answer(res, await run(id.data, b.data, staffOf(req)), event); } catch (err) { logFailure(`${event}_failed`, err); res.status(500).json({ error: 'That did not go through. Try again.' }); }
  };
}

export async function sendTestRoute(req: Request, res: Response): Promise<void> {
  const id = Uuid.safeParse(req.params.enrollmentId);
  if (!id.success) { bad(res, 'id'); return; }
  try {
    const r = await desk.deskSendTest(id.data, staffOf(req));
    if (r.status === 'conflict' && r.switchedOff) { res.status(409).json({ error: 'Inbox tests are switched off' }); return; }
    answer(res, r, 'desk_send_test');
  } catch (err) { logFailure('desk_send_test_failed', err); res.status(500).json({ error: 'The test did not go through. Try again.' }); }
}

const router = Router();
router.get(BASE, gate, read(OverviewResponse, 'desk_overview', () => desk.overview()));
router.get(`${BASE}/queue`, gate, read(QueueResponse, 'desk_queue', () => desk.reviewQueue()));
router.get(`${BASE}/inboxes`, gate, read(InboxesResponse, 'desk_inboxes', () => desk.inboxHealthList()));
router.get(`${BASE}/bookings`, gate, read(BookingsResponse, 'desk_bookings', () => desk.bookingList()));
router.get(`${BASE}/placements`, gate, read(PlacementsResponse, 'desk_placements', () => desk.placements()));
router.post(`${BASE}/review-items/:id/actions`, gate, act(BigId, ItemActionBody, 'desk_item_action',
  (id, b, staff) => itemAction(id, b.action, { staff, note: b.note ?? null, enrollmentId: b.enrollmentId ?? null })));
router.post(`${BASE}/interviews/:id/actions`, gate, act(Uuid, InterviewActionBody, 'desk_interview_action', (id, b, staff) => (b.action === 'send_link'
  ? sendLink(id, { staff, contactEmail: b.contactEmail ?? null }) : interviewAction(id, b.action, { staff, note: b.note ?? null }))));
router.post(`${BASE}/interviews/:id/type`, gate, act(Uuid, TypeBody, 'desk_interview_type', (id, b, staff) => setInterviewType(id, b.type, { staff })));
router.post(`${BASE}/inboxes/:enrollmentId/test`, gate, sendTestRoute);
router.post(`${BASE}/inboxes/:enrollmentId/forwarding`, gate, act(Uuid, ForwardingBody, 'desk_forwarding', (id, b, staff) => desk.forwardingAction(id, b.action, staff)));
router.post(`${BASE}/invoices/:id/status`, gate, act(BigId, InvoiceBody, 'desk_invoice', (id, b, staff) => desk.setInvoiceStatus(id, b.status, staff)));
router.post(`${BASE}/clients/:id/candidates`, gate, act(Uuid, PutForwardBody, 'desk_put_forward', (id, b, staff) => desk.putForward(id, b.enrollmentId, staff)));

export default router;
