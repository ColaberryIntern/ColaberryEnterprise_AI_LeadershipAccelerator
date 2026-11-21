import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { logFailure, sendValidated } from '../campusRoutes';
import { EventInput, EventInputError } from '../../services/commsHub/eventInput';
import { CancelResponse, EventListResponse, EventResponse } from '../../services/commsHub/eventSchemas';
import { cancelEventAndOffer } from '../../services/commsHub/eventCancel';
import {
  listEvents, getEvent, createEvent, updateEvent, duplicateEvent,
  EventNotFoundError, EventStateError, type EventScope,
} from '../../services/commsHub/eventService';
import type { Actor } from '../../services/commsHub/activityLog';

/**
 * Communications Hub events API (CH2.2), under /api/admin/comms-hub/events. Zod on params, query
 * and body before any service runs; every route carries requireSection('comms_hub').
 */
const IdParams = z.object({ id: z.string().uuid() }).strict();
const ListQuery = z.object({ scope: z.enum(['upcoming', 'past', 'cancelled', 'all']).default('upcoming') }).strict();

export function actorOf(req: Request): Actor {
  return { id: req.admin?.sub ?? null, label: req.admin?.email ?? null };
}

/** One place maps service errors to HTTP, so every route answers the same way. */
export function sendError(res: Response, err: unknown, event: string): void {
  if (err instanceof EventNotFoundError) { res.status(404).json({ error: err.message }); return; }
  if (err instanceof EventStateError) { res.status(409).json({ error: err.message }); return; }
  if (err instanceof EventInputError) { res.status(400).json({ error: err.message, error_class: 'ValidationError' }); return; }
  logFailure(event, err);
  res.status(500).json({ error: 'Something went wrong saving this event. Nothing was changed.' });
}

function badRequest(res: Response, issues: z.ZodIssue[]): void {
  res.status(400).json({ error: issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), error_class: 'ValidationError' });
}

export async function listRoute(req: Request, res: Response): Promise<void> {
  const q = ListQuery.safeParse(req.query);
  if (!q.success) { badRequest(res, q.error.issues); return; }
  try { sendValidated(res, EventListResponse, { events: await listEvents(q.data.scope as EventScope) }, 'comms_hub_event_list'); } catch (err) { sendError(res, err, 'comms_hub_event_list_failed'); }
}

export async function getRoute(req: Request, res: Response): Promise<void> {
  const p = IdParams.safeParse(req.params);
  if (!p.success) { badRequest(res, p.error.issues); return; }
  try { sendValidated(res, EventResponse, { event: await getEvent(p.data.id) }, 'comms_hub_event_get'); } catch (err) { sendError(res, err, 'comms_hub_event_get_failed'); }
}

export async function createRoute(req: Request, res: Response): Promise<void> {
  const b = EventInput.safeParse(req.body);
  if (!b.success) { badRequest(res, b.error.issues); return; }
  try {
    const event = await createEvent(b.data, actorOf(req));
    res.status(201);
    sendValidated(res, EventResponse, { event }, 'comms_hub_event_create');
  } catch (err) { sendError(res, err, 'comms_hub_event_create_failed'); }
}

export async function updateRoute(req: Request, res: Response): Promise<void> {
  const p = IdParams.safeParse(req.params);
  if (!p.success) { badRequest(res, p.error.issues); return; }
  const b = EventInput.safeParse(req.body);
  if (!b.success) { badRequest(res, b.error.issues); return; }
  try { sendValidated(res, EventResponse, { event: await updateEvent(p.data.id, b.data, actorOf(req)) }, 'comms_hub_event_update'); } catch (err) { sendError(res, err, 'comms_hub_event_update_failed'); }
}

export async function duplicateRoute(req: Request, res: Response): Promise<void> {
  const p = IdParams.safeParse(req.params);
  if (!p.success) { badRequest(res, p.error.issues); return; }
  try {
    const event = await duplicateEvent(p.data.id, actorOf(req));
    res.status(201);
    sendValidated(res, EventResponse, { event }, 'comms_hub_event_duplicate');
  } catch (err) { sendError(res, err, 'comms_hub_event_duplicate_failed'); }
}

export async function cancelRoute(req: Request, res: Response): Promise<void> {
  const p = IdParams.safeParse(req.params);
  if (!p.success) { badRequest(res, p.error.issues); return; }
  // CH7.3: the event and its unsent messages are cancelled together; then the prepared stream, and a cancellation draft offered.
  try { sendValidated(res, CancelResponse, await cancelEventAndOffer(p.data.id, actorOf(req)), 'comms_hub_event_cancel'); } catch (err) { sendError(res, err, 'comms_hub_event_cancel_failed'); }
}

const gate = requireSection('comms_hub');
const router = Router();
router.get('/api/admin/comms-hub/events', gate, listRoute);
router.post('/api/admin/comms-hub/events', gate, createRoute);
router.get('/api/admin/comms-hub/events/:id', gate, getRoute);
router.put('/api/admin/comms-hub/events/:id', gate, updateRoute);
router.post('/api/admin/comms-hub/events/:id/duplicate', gate, duplicateRoute);
router.post('/api/admin/comms-hub/events/:id/cancel', gate, cancelRoute);

export default router;
