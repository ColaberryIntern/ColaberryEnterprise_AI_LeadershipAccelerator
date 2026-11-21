import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { adoptEventbriteEvent, AdoptEndedError, AdoptNotFoundError, AdoptUnavailableError } from '../../services/commsHub/eventbrite/adoption';
import { EventResponse } from '../../services/commsHub/eventSchemas';
import { registrantReach } from '../../services/commsHub/eventbrite/registrantAudience';
import { ConnectorPermanentError } from '../../services/commsHub/connectors/types';
import { logFailure, sendValidated } from '../campusRoutes';
import { actorOf } from './commsHubEventRoutes';

/**
 * "Manage in the hub" for an Eventbrite event (CH9.5): POST .../eventbrite-events/:ccppEventId/adopt.
 * 201 when the hub event was created, 200 when it already existed (adopting twice is the same answer).
 * Gated on comms_hub; the id is digits only. Refusals: 404 not a public event, 409 already over,
 * 503 the Eventbrite list is unavailable.
 */
const IdParams = z.object({ ccppEventId: z.string().regex(/^\d{1,20}$/) }).strict();
const router = Router();

router.post('/api/admin/comms-hub/eventbrite-events/:ccppEventId/adopt', requireSection('comms_hub'), async (req: Request, res: Response) => {
  const p = IdParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'That is not an Eventbrite event id.', error_class: 'ValidationError' }); return; }
  try {
    const { event, created } = await adoptEventbriteEvent(p.data.ccppEventId, actorOf(req));
    res.status(created ? 201 : 200);
    sendValidated(res, EventResponse, { event }, 'comms_hub_adopt');
  } catch (err) {
    if (err instanceof AdoptNotFoundError) { res.status(404).json({ error: err.message, error_class: 'NotFound' }); return; }
    if (err instanceof AdoptEndedError) { res.status(409).json({ error: err.message, error_class: 'EventEnded' }); return; }
    if (err instanceof AdoptUnavailableError) { res.status(503).json({ error: err.message, error_class: 'UpstreamUnavailable' }); return; }
    logFailure('comms_hub_adopt_failed', err);
    res.status(500).json({ error: 'The event could not be added to the hub.', error_class: 'AdoptFailed' });
  }
});

/**
 * CH9.6: before approving a message to an event's registrants, Compose shows "N of M registrants have
 * platform accounts". Counts only, never people. 404 for an event the hub does not manage from Eventbrite.
 */
const ReachParams = z.object({ id: z.string().uuid() }).strict();
const ReachSchema = z.object({ registrants: z.number().int().nonnegative(), reachable: z.number().int().nonnegative(), eventbrite: z.enum(['ok', 'unavailable', 'not_configured']) }).strict();
router.get('/api/admin/comms-hub/events/:id/registrant-reach', requireSection('comms_hub'), async (req: Request, res: Response) => {
  const p = ReachParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not an event id.', error_class: 'ValidationError' }); return; }
  try {
    res.set('Cache-Control', 'no-store');
    sendValidated(res, ReachSchema, await registrantReach(p.data.id), 'comms_hub_registrant_reach');
  } catch (err) {
    if (err instanceof ConnectorPermanentError) { res.status(404).json({ error: err.message, error_class: 'NotFound' }); return; }
    logFailure('comms_hub_registrant_reach_failed', err);
    res.status(500).json({ error: 'Could not count the registrants.', error_class: 'ReachFailed' });
  }
});

export default router;
