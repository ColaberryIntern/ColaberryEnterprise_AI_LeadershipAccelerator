import { Router, type Request, type Response } from 'express';
import { requireSection } from '../../middlewares/authMiddleware';
import { getSummary } from '../../services/commsHub/commsHubSummary';
import { CommsHubSummary } from '../../services/commsHub/commsHubSchemas';
import { logFailure, sendValidated } from '../campusRoutes';
import eventRoutes from './commsHubEventRoutes';
import formRoutes from './commsHubFormRoutes';

/**
 * Communications Hub admin API (CH1.3 onward). Every route sits under /api/admin/comms-hub, which
 * mgmtSectionGate maps to 'comms_hub'; each route also carries requireSection('comms_hub') so the
 * file is guarded on its own (route-auth lint) and a legacy token without the section is refused.
 */
export async function getHubSummary(_req: Request, res: Response): Promise<void> {
  try {
    sendValidated(res, CommsHubSummary, await getSummary(), 'comms_hub_summary');
  } catch (err) {
    logFailure('comms_hub_summary_failed', err);
    res.status(500).json({ error: 'Could not load the Communications Hub summary.' });
  }
}

const router = Router();
router.get('/api/admin/comms-hub/summary', requireSection('comms_hub'), getHubSummary);
// CH3.2 form helpers first: /events/describe is a fixed path and must never be read as an event id.
router.use(formRoutes);
// CH2.2 events. Importing it also registers the events counters on the summary.
router.use(eventRoutes);

export default router;
