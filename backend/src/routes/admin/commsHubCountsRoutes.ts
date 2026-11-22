import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { eventCounts, EventCountsNotFound } from '../../services/commsHub/eventCounts';
import { logFailure, sendValidated } from '../campusRoutes';

/**
 * CH9.7 GET /api/admin/comms-hub/events/:id/counts: registered, watched live, watched the replay.
 * Counts only, never people. Each is a number or null with the reason it is not known.
 */
const Params = z.object({ id: z.string().uuid() }).strict();
const CountSchema = z.object({ value: z.number().int().nonnegative().nullable(), reason: z.string().nullable() }).strict();
export const EventCountsSchema = z.object({ registered: CountSchema, watched_live: CountSchema, watched_replay: CountSchema }).strict();

const router = Router();
router.get('/api/admin/comms-hub/events/:id/counts', requireSection('comms_hub'), async (req: Request, res: Response) => {
  const p = Params.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not an event id.', error_class: 'ValidationError' }); return; }
  try {
    res.set('Cache-Control', 'no-store');
    sendValidated(res, EventCountsSchema, await eventCounts(p.data.id), 'comms_hub_event_counts');
  } catch (err) {
    if (err instanceof EventCountsNotFound) { res.status(404).json({ error: err.message, error_class: 'NotFound' }); return; }
    logFailure('comms_hub_event_counts_failed', err);
    res.status(500).json({ error: 'The counts could not be loaded.', error_class: 'CountsFailed' });
  }
});

export default router;
