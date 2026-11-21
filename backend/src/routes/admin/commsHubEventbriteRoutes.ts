import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { listEventbriteEvents } from '../../services/commsHub/eventbrite/eventbriteEvents';
import { listRegistrants, RegistrantsNotFound, type RegistrantList } from '../../services/commsHub/eventbrite/registrants';
import { registrantsCsv, registrantsFilename } from '../../services/commsHub/eventbrite/registrantsCsv';
import { logActivity } from '../../services/commsHub/activityLog';
import { logFailure, sendValidated } from '../campusRoutes';
import { actorOf } from './commsHubEventRoutes';

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

/*
 * CH9.3 registrants. People's names and emails, so: digits-only id, no-store caching, the phone only
 * in the CSV, and every view and download written to the hub activity log (who, which event, how
 * many rows; never the people). No query string on either route, so a "Report a problem" capture of
 * a failed request cannot carry registrant data.
 */
const IdParams = z.object({ ccppEventId: z.string().regex(/^\d{1,20}$/, 'That is not an Eventbrite event id.') }).strict();

export const RegistrantViewSchema = z.object({
  name: z.string(), email: z.string(), registered_at: z.string().nullable(),
  sources: z.array(z.enum(['eventbrite', 'site'])), has_account: z.boolean(),
}).strict();
export const RegistrantListSchema = z.object({
  event: z.object({ ccpp_event_id: z.string(), title: z.string(), starts_at: z.string() }).strict(),
  eventbrite: z.enum(['ok', 'unavailable', 'not_configured']),
  count: z.number().int().nonnegative(),
  rows: z.array(RegistrantViewSchema),
}).strict();

async function loadFor(req: Request, res: Response): Promise<RegistrantList | null> {
  const p = IdParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'That is not an Eventbrite event id.', error_class: 'ValidationError' }); return null; }
  try {
    return await listRegistrants(p.data.ccppEventId);
  } catch (err) {
    if (err instanceof RegistrantsNotFound) { res.status(404).json({ error: err.message, error_class: 'NotFound' }); return null; }
    logFailure('comms_hub_registrants_failed', err);
    res.status(500).json({ error: 'Could not load the registrants.', error_class: 'RegistrantsLoadFailed' });
    return null;
  }
}

async function audit(req: Request, action: 'registrants.viewed' | 'registrants.exported', list: RegistrantList): Promise<void> {
  try {
    await logActivity(actorOf(req), action, 'eventbrite_event', null,
      { ccpp_event_id: list.event.ccpp_event_id, title: list.event.title, rows: list.rows.length, eventbrite: list.eventbrite });
  } catch (err) {
    // Logged, not swallowed. The answer still goes: the person already has the right to see it.
    logFailure('comms_hub_registrants_audit_failed', err);
  }
}

router.get('/api/admin/comms-hub/eventbrite-events/:ccppEventId/registrants', gate, async (req: Request, res: Response) => {
  const list = await loadFor(req, res);
  if (!list) return;
  await audit(req, 'registrants.viewed', list);
  res.set('Cache-Control', 'no-store');
  sendValidated(res, RegistrantListSchema, {
    event: list.event, eventbrite: list.eventbrite, count: list.rows.length,
    // The on-screen list never carries phone numbers; the CSV does.
    rows: list.rows.map(({ phone: _phone, ...r }) => r),
  }, 'comms_hub_registrants');
});

router.get('/api/admin/comms-hub/eventbrite-events/:ccppEventId/registrants.csv', gate, async (req: Request, res: Response) => {
  const list = await loadFor(req, res);
  if (!list) return;
  await audit(req, 'registrants.exported', list);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${registrantsFilename(list.event)}"`);
  res.set('Cache-Control', 'no-store');
  res.send(registrantsCsv(list.rows));
});

export default router;
