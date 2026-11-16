/**
 * caseStudyFinderRoutes - the Case Study Finder API (Services Upgrade CF1). ADVISORY ONLY: no route here creates,
 * links, edits or publishes a service or a case study. Building a proposal is CF2's separate, explicit route.
 *
 *   GET  /api/admin/factory/case-study-finder        latest run (progress) + latest completed result
 *   POST /api/admin/factory/case-study-finder/run    start a run (202), or 409 with the run already going
 *
 * requireSection('program') and tenant-scoped through lookupGovContractsContainer(); no workspace is a 503.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { lookupGovContractsContainer } from '../../scripts/lib/factoryDemoContainer';
import { latestFinder, processFinderRun, startFinderRun } from '../../services/factory/caseStudyFinder/finderRun';

const router = Router();
type AdminRequest = Request & { admin?: { email?: string; sub?: string } };
const actorIdentity = (req: AdminRequest): string => String(req.admin?.email ?? req.admin?.sub ?? 'unknown-admin');

function logFail(event: string, err: unknown): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: (err as Error)?.name ?? 'Error', context: { message: String((err as Error)?.message ?? err).slice(0, 200) },
  }));
}

async function tenantOr503(res: Response, event: string): Promise<string | null> {
  const container = await lookupGovContractsContainer().catch((err: unknown) => { logFail(event, err); return null; });
  if (!container) { res.status(503).json({ error: 'The government contracts workspace is not configured.' }); return null; }
  return container.tenant.id;
}

const runBody = z.object({}).strict();

router.get('/api/admin/factory/case-study-finder', requireSection('program'), async (_req: AdminRequest, res: Response) => {
  const tenantId = await tenantOr503(res, 'case_study_finder_scope');
  if (!tenantId) return;
  try { res.json(await latestFinder(tenantId)); } catch (err) {
    logFail('case_study_finder_get_failed', err);
    res.status(500).json({ error: 'Could not load the Case Study Finder.' });
  }
});

router.post('/api/admin/factory/case-study-finder/run', requireSection('program'), async (req: AdminRequest, res: Response) => {
  if (!runBody.safeParse(req.body ?? {}).success) { res.status(400).json({ error: 'This request takes no options.' }); return; }
  const tenantId = await tenantOr503(res, 'case_study_finder_scope');
  if (!tenantId) return;
  try {
    const { run, started } = await startFinderRun(tenantId, actorIdentity(req));
    if (!started) { res.status(409).json({ error: 'A Finder run is already in progress.', run }); return; }
    // Runs after the response; processFinderRun never throws (a failure is stored on the run).
    setImmediate(() => { void processFinderRun(run.id, tenantId); });
    res.status(202).json({ run });
  } catch (err) {
    logFail('case_study_finder_start_failed', err);
    res.status(500).json({ error: 'Could not start the Case Study Finder.' });
  }
});

export default router;
