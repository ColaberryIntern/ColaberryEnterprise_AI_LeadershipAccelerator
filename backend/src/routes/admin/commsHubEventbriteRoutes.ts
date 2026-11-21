import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { listEventbriteEvents } from '../../services/commsHub/eventbrite/eventbriteEvents';
import { logFailure, sendValidated } from '../campusRoutes';

/**
 * Communications Hub: the Eventbrite events (CH9.2), read-only, under /api/admin/comms-hub. Zod on
 * the query before the service runs; the answer is checked against its declared shape. Every route
 * carries requireSection('comms_hub').
 */
const ListQuery = z.object({ window: z.enum(['upcoming', 'past']).default('upcoming') }).strict();

export const EventbriteEventSchema = z.object({
  ccpp_event_id: z.string().regex(/^\d{1,20}$/),
  title: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  registration_url: z.string().nullable(),
  image_url: z.string().nullable(),
  registered: z.number().int().nonnegative().nullable(),
  eventbrite_status: z.string(),
}).strict();

export const EventbriteListSchema = z.object({
  status: z.enum(['ok', 'unavailable', 'not_configured']),
  window: z.enum(['upcoming', 'past']),
  events: z.array(EventbriteEventSchema),
  fetched_at: z.string(),
}).strict();

const router = Router();
const gate = requireSection('comms_hub');

router.get('/api/admin/comms-hub/eventbrite-events', gate, async (req: Request, res: Response) => {
  const q = ListQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: 'window must be upcoming or past.', error_class: 'ValidationError' }); return; }
  try {
    sendValidated(res, EventbriteListSchema, await listEventbriteEvents(q.data.window), 'comms_hub_eventbrite_list');
  } catch (err) {
    logFailure('comms_hub_eventbrite_list_route_failed', err);
    res.status(500).json({ error: 'Could not load the Eventbrite events.' });
  }
});

export default router;
