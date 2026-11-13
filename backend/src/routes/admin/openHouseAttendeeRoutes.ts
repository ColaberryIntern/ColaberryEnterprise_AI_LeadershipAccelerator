import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { reconcileOpenHouseAttendees } from '../../services/attendeeReconciliation';

const router = Router();

/**
 * Who is actually coming to the next Open House - from BOTH rosters.
 *
 * Mounted under /api/admin/marketing deliberately: mgmtSectionGate maps that
 * prefix to the `campaigns` section, which is the section the Marketing nav group
 * carries. A link whose section the API does not recognise renders for someone the
 * API then 403s, and `adminNavMarketing.test.ts` exists because that has happened.
 *
 * Read-only. It sends nothing, writes nothing, and reminds nobody.
 */
router.get('/api/admin/marketing/open-house/attendees', requireAdmin, async (_req: Request, res: Response) => {
  try {
    res.json(await reconcileOpenHouseAttendees());
  } catch (err: any) {
    // A CCPP outage does NOT reach here - the service reports that as
    // `eventbrite.status: 'unavailable'` and still returns our own registrants.
    // Getting here means our own database failed, and there is nothing to show.
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'open_house_attendees_failed',
      outcome: 'failure',
      error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'The attendee list could not be loaded.', error_class: 'InternalError' });
  }
});

export default router;
