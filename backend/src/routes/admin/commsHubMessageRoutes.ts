import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { logFailure } from '../campusRoutes';
import { cancelMessage, MessageRuleError, rejectMessage, submitForApproval, undoApproval } from '../../services/commsHub/messages/approvals';
import { createDraftMessage, DraftModelError, editDraft, regenerateDrafts } from '../../services/commsHub/messages/drafting';
import { approveAndSchedule, destinationOptions, listMessages, messageView, setDestinations, setSendTime } from '../../services/commsHub/messages/messageService';
import { COMMS_HUB_MESSAGE_KINDS, COMMS_HUB_MESSAGE_STATUSES } from '../../db/ensureCommsHubSchema';
import { actorOf } from './commsHubEventRoutes';
import { retryFailedDeliveries } from '../../services/commsHub/delivery/messageLifecycle';

/**
 * Compose (CH6.5), under /api/admin/comms-hub/messages. Every write goes through the CH6.2/CH6.3
 * services, so the status machine, the approval hash and the draft validator apply here exactly as
 * they do everywhere else. Nothing here sends: sending is the worker's job (CH7).
 */
const Id = z.object({ id: z.string().uuid() }).strict();
const Kind = z.enum(COMMS_HUB_MESSAGE_KINDS as unknown as [string, ...string[]]);
const CreateBody = z.object({
  event_id: z.string().uuid().nullable().optional(),
  subject: z.string().trim().max(300).nullable().optional(),
  kind: Kind,
  tone: z.enum(['friendly', 'professional', 'urgent']).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  include: z.object({ thumbnail: z.boolean(), join_link: z.boolean(), registration_link: z.boolean() }).partial().strict().optional(),
}).strict();
const RegenerateBody = z.object({ instruction: z.enum(['shorter', 'warmer', 'more_detail']) }).strict();
const EditBody = z.object({ channel: z.enum(['community_post', 'in_app']), title: z.string().max(120).nullable().optional(), body: z.string().trim().min(1, 'Write something first.').max(2000) }).strict();
const DestBody = z.object({
  destinations: z.array(z.object({
    channel: z.enum(['community_post', 'in_app']), target_type: z.enum(['cohort_feed', 'in_app_audience']),
    target_id: z.string().min(1).max(64), label: z.string().max(255).nullable(),
  }).strict()).max(50),
}).strict();
const TimeBody = z.object({ send_at: z.string().datetime().nullable() }).strict();
const RejectBody = z.object({ note: z.string().trim().max(500).nullable().optional() }).strict();
const ListQuery = z.object({ status: z.string().optional() });

function fail(res: Response, err: unknown, event: string): void {
  if (err instanceof MessageRuleError) { res.status(err.status).json({ error: err.message, reason: err.reason, problems: err.problems }); return; }
  if (err instanceof DraftModelError) { res.status(502).json({ error: err.message, reason: 'model' }); return; }
  logFailure(event, err);
  res.status(500).json({ error: 'That did not work. Try again.' });
}

/** Run a write on one message, then answer with the message as it now is. */
function onMessage<B>(schema: z.ZodType<B> | null, run: (id: string, body: B, req: Request) => Promise<unknown>, event: string) {
  return async (req: Request, res: Response): Promise<void> => {
    const p = Id.safeParse(req.params);
    if (!p.success) { res.status(400).json({ error: 'Not a message id.' }); return; }
    let body = undefined as B;
    if (schema) {
      const b = schema.safeParse(req.body ?? {});
      if (!b.success) { res.status(400).json({ error: b.error.issues[0].message, error_class: 'ValidationError' }); return; }
      body = b.data;
    }
    try {
      await run(p.data.id, body, req);
      res.json({ message: await messageView(p.data.id) });
    } catch (err) { fail(res, err, event); }
  };
}

export async function createRoute(req: Request, res: Response): Promise<void> {
  const b = CreateBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: b.error.issues[0].message, error_class: 'ValidationError' }); return; }
  try {
    const { message } = await createDraftMessage({ eventId: b.data.event_id ?? null, subject: b.data.subject ?? null, kind: b.data.kind as never, tone: b.data.tone ?? null, notes: b.data.notes ?? null, include: b.data.include }, actorOf(req));
    res.status(201).json({ message: await messageView(message.id) });
  } catch (err) { fail(res, err, 'comms_hub_message_create_failed'); }
}

export async function listRoute(req: Request, res: Response): Promise<void> {
  const q = ListQuery.safeParse(req.query);
  const statuses = q.success && q.data.status ? q.data.status.split(',').filter((s) => (COMMS_HUB_MESSAGE_STATUSES as readonly string[]).includes(s)) : null;
  try { res.json({ messages: await listMessages(statuses) }); } catch (err) { fail(res, err, 'comms_hub_message_list_failed'); }
}

export async function getRoute(req: Request, res: Response): Promise<void> {
  const p = Id.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not a message id.' }); return; }
  try { res.json({ message: await messageView(p.data.id) }); } catch (err) { fail(res, err, 'comms_hub_message_read_failed'); }
}

export async function optionsRoute(_req: Request, res: Response): Promise<void> {
  try { res.json({ destinations: await destinationOptions() }); } catch (err) { fail(res, err, 'comms_hub_destination_options_failed'); }
}

const gate = requireSection('comms_hub');
const router = Router();
const base = '/api/admin/comms-hub/messages';
router.get(`${base}`, gate, listRoute);
router.post(`${base}`, gate, createRoute);
router.get(`${base}/destination-options`, gate, optionsRoute);
router.get(`${base}/:id`, gate, getRoute);
router.post(`${base}/:id/regenerate`, gate, onMessage(RegenerateBody, (id, b, req) => regenerateDrafts(id, b.instruction, actorOf(req)), 'comms_hub_message_regenerate_failed'));
router.post(`${base}/:id/drafts`, gate, onMessage(EditBody, (id, b, req) => editDraft(id, b.channel, { title: b.title ?? null, body: b.body }, actorOf(req)), 'comms_hub_message_edit_failed'));
router.put(`${base}/:id/destinations`, gate, onMessage(DestBody, (id, b, req) => setDestinations(id, b.destinations, actorOf(req)), 'comms_hub_message_destinations_failed'));
router.put(`${base}/:id/send-time`, gate, onMessage(TimeBody, (id, b, req) => setSendTime(id, b.send_at ? new Date(b.send_at) : null, actorOf(req)), 'comms_hub_message_time_failed'));
router.post(`${base}/:id/submit`, gate, onMessage(null, (id, _b, req) => submitForApproval(id, actorOf(req)), 'comms_hub_message_submit_failed'));
router.post(`${base}/:id/approve`, gate, onMessage(null, (id, _b, req) => approveAndSchedule(id, actorOf(req)), 'comms_hub_message_approve_failed'));
router.post(`${base}/:id/reject`, gate, onMessage(RejectBody, (id, b, req) => rejectMessage(id, actorOf(req), b.note ?? null), 'comms_hub_message_reject_failed'));
router.post(`${base}/:id/undo`, gate, onMessage(null, (id, _b, req) => undoApproval(id, actorOf(req)), 'comms_hub_message_undo_failed'));
router.post(`${base}/:id/cancel`, gate, onMessage(null, (id, _b, req) => cancelMessage(id, actorOf(req)), 'comms_hub_message_cancel_failed'));
// CH7.2: retry only the destinations that did not get it (same rows, same idempotency keys).
router.post(`${base}/:id/retry`, gate, onMessage(null, (id, _b, req) => retryFailedDeliveries(id, actorOf(req)), 'comms_hub_message_retry_failed'));

export default router;
