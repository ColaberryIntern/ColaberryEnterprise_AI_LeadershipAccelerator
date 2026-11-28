import { Router, type Request, type Response } from 'express';
import { requireSection } from '../../middlewares/authMiddleware';
import { buildTodaySample } from '../../services/admissionsOps/todayFixture';
import { TodayPayload } from '../../services/admissionsOps/todaySchema';
import { buildManifest, ManifestResponse } from '../../services/admissionsOps/agentManifest';
import { logFailure, sendValidated } from '../campusRoutes';
import agentRoutes from './admissionsOpsAgentRoutes';

/**
 * Admissions & Ops Command Center admin API (AO2.1 onward). Every route sits under /api/admin/admissions-ops, which
 * mgmtSectionGate maps to 'admissions_ops'; each route also carries requireSection('admissions_ops') so the file is
 * guarded on its own (route-auth lint) and a legacy token without the section is refused.
 *
 * GET /today: the Today payload. Release 1 serves the invented sample (`sample: true`), validated against the Zod
 * contract at the boundary (fail loud in development, log and continue in production). No external call is made,
 * so there is nothing to time out or retry; a builder failure is logged with its error class and returns 500.
 */
export function getToday(_req: Request, res: Response): void {
  try {
    sendValidated(res, TodayPayload, buildTodaySample(new Date()), 'admissions_ops_today');
  } catch (err) {
    logFailure('admissions_ops_today_failed', err);
    res.status(500).json({ error: 'Could not load Today.' });
  }
}

/** GET /agent/manifest (AO2.2): all 16 screens and their declared actions, so an agent can plan before a screen opens. */
export function getManifest(_req: Request, res: Response): void {
  try {
    sendValidated(res, ManifestResponse, { screens: buildManifest() }, 'admissions_ops_manifest');
  } catch (err) {
    logFailure('admissions_ops_manifest_failed', err);
    res.status(500).json({ error: 'Could not load the agent manifest.' });
  }
}

const router = Router();
router.get('/api/admin/admissions-ops/today', requireSection('admissions_ops'), getToday);
router.get('/api/admin/admissions-ops/agent/manifest', requireSection('admissions_ops'), getManifest);
// AO2.3: intents, the person's decision on what was prepared, and the open-approval count (own file, own guards).
router.use(agentRoutes);

export default router;
