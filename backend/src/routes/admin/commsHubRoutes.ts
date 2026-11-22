import { Router, type Request, type Response } from 'express';
import { requireSection } from '../../middlewares/authMiddleware';
import { getSummary } from '../../services/commsHub/commsHubSummary';
import { CommsHubSummary } from '../../services/commsHub/commsHubSchemas';
import { logFailure, sendValidated } from '../campusRoutes';
import eventRoutes from './commsHubEventRoutes';
import formRoutes from './commsHubFormRoutes';
import photoRoutes from './commsHubPhotoRoutes';
import thumbnailRoutes from './commsHubThumbnailRoutes';
import liveRoutes from './commsHubLiveRoutes';
import planRoutes from './commsHubPlanRoutes';
import messageRoutes from './commsHubMessageRoutes';
import boardRoutes from './commsHubBoardRoutes';
import bugReportRoutes from './commsHubBugReportRoutes';
import eventbriteRoutes from './commsHubEventbriteRoutes';
import adoptRoutes from './commsHubAdoptRoutes';
import countsRoutes from './commsHubCountsRoutes';
import whatsAppRoutes from './commsHubWhatsAppRoutes';

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
// CH4.1 event pictures (inputs to thumbnails).
router.use(photoRoutes);
// CH4.4 the thumbnail studio.
router.use(thumbnailRoutes);
// CH5.2 the event's Live panel.
router.use(liveRoutes);
// CH6.4 the event's promotion plan.
router.use(planRoutes);
// CH6.5 Compose: messages, drafts, recipients, approval.
router.use(messageRoutes);
// CH7.4 Today and Schedule & history: the board, safety controls and activity log.
router.use(boardRoutes);
// CH9.1 Report a problem, on every hub tab.
router.use(bugReportRoutes);
// CH9.2 the Eventbrite events, read-only from the CCPP mirror.
router.use(eventbriteRoutes);
// CH9.5 manage an Eventbrite event in the hub.
router.use(adoptRoutes);
// CH9.7 registered / watched live / watched the replay, on the event.
router.use(countsRoutes);
// CH10.1 WhatsApp: the channel's status (ships switched off).
router.use(whatsAppRoutes);

export default router;
