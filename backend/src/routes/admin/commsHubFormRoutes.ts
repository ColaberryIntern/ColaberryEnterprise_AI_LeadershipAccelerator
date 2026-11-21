import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { logFailure, sendValidated } from '../campusRoutes';
import Cohort from '../../models/Cohort';
import { DescribeInput, DescribeRefusedError, describeEvent } from '../../services/commsHub/eventDescribe';

/**
 * What the event form needs besides the event itself (CH3.2): the cohorts the audience picker offers,
 * and "Write with AI" for the description. Same gate and Zod-first rule as every hub route.
 */
export const CohortOption = z.object({ id: z.string().uuid(), name: z.string(), status: z.enum(['open', 'closed', 'completed']), start_date: z.string().nullable() }).strict();
const CohortListResponse = z.object({ cohorts: z.array(CohortOption) }).strict();
const DescribeResponse = z.object({ description: z.string().min(1) }).strict();

export async function listCohorts(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await Cohort.findAll({ attributes: ['id', 'name', 'status', 'start_date'], order: [['start_date', 'DESC']], limit: 200 });
    const cohorts = rows.map((c) => {
      const start = c.get('start_date') as unknown;
      return {
        id: c.get('id') as string,
        name: c.get('name') as string,
        status: c.get('status') as 'open' | 'closed' | 'completed',
        start_date: start == null ? null : String(start).slice(0, 10),
      };
    });
    sendValidated(res, CohortListResponse, { cohorts }, 'comms_hub_cohorts');
  } catch (err) {
    logFailure('comms_hub_cohorts_failed', err);
    res.status(500).json({ error: 'Could not load the cohorts.' });
  }
}

export async function describeRoute(req: Request, res: Response): Promise<void> {
  const b = DescribeInput.safeParse(req.body);
  if (!b.success) {
    res.status(400).json({ error: b.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), error_class: 'ValidationError' });
    return;
  }
  try {
    sendValidated(res, DescribeResponse, { description: await describeEvent(b.data) }, 'comms_hub_event_describe');
  } catch (err) {
    if (err instanceof DescribeRefusedError) { res.status(422).json({ error: err.message }); return; }
    logFailure('comms_hub_event_describe_failed', err);
    res.status(502).json({ error: 'The AI writer is not answering right now. Write it yourself, or try again in a minute.' });
  }
}

const gate = requireSection('comms_hub');
const router = Router();
router.get('/api/admin/comms-hub/cohorts', gate, listCohorts);
router.post('/api/admin/comms-hub/events/describe', gate, describeRoute);

export default router;
