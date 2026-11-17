/**
 * caseStudyFinderRoutes - the Case Study Finder API (Services Upgrade CF1). ADVISORY ONLY: no route here creates,
 * links, edits or publishes a service or a case study. Building a proposal is CF2's separate, explicit route.
 *
 *   GET  /api/admin/factory/case-study-finder        latest run (progress) + latest completed result
 *   POST /api/admin/factory/case-study-finder/run    start a run (202), or 409 with the run already going
 *   POST /api/admin/factory/case-study-finder/proposals/:id/build   { scope, acknowledgeOverlaps? } (CF2)
 *        201 built | 200 exists | 404 | 409 overlap (hard stop or needs acknowledgement) | 409 scope changed.
 *        Creates a PRIVATE draft (skill steps 0-2) and a Basecamp build ticket; never publishes.
 *
 * requireSection('program') and tenant-scoped through lookupGovContractsContainer(); no workspace is a 503.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { lookupGovContractsContainer } from '../../scripts/lib/factoryDemoContainer';
import { latestFinder, processFinderRun, startFinderRun } from '../../services/factory/caseStudyFinder/finderRun';
import { listBuilds, prepareBuild } from '../../services/factory/caseStudyFinder/finderBuild';

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
  try { res.json({ ...(await latestFinder(tenantId)), builds: await listBuilds(tenantId) }); } catch (err) {
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

const proposalParam = z.object({ id: z.string().regex(/^[a-f0-9]{16}$/) });
const buildBody = z.object({
  scope: z.array(z.string().trim().min(1).max(500)).max(40),
  acknowledgeOverlaps: z.boolean().optional(),
}).strict();

router.post('/api/admin/factory/case-study-finder/proposals/:id/build', requireSection('program'), async (req: AdminRequest, res: Response) => {
  const p = proposalParam.safeParse(req.params);
  const b = buildBody.safeParse(req.body ?? {});
  if (!p.success || !b.success) { res.status(400).json({ error: 'Invalid build request.' }); return; }
  const tenantId = await tenantOr503(res, 'case_study_finder_scope');
  if (!tenantId) return;
  try {
    const out = await prepareBuild({ tenantId, proposalId: p.data.id, actor: actorIdentity(req), scope: b.data.scope, acknowledgeOverlaps: !!b.data.acknowledgeOverlaps });
    switch (out.kind) {
      case 'built': res.status(201).json({ build: out.build }); return;
      case 'exists': res.status(200).json({ build: out.build, existing: true }); return;
      case 'not_found': res.status(404).json({ error: 'That proposal is not in the latest Finder result. Run the Finder again.' }); return;
      case 'scope_changed': res.status(409).json({ error: 'The path scope changed since you reviewed it. Review it again.', expected: out.expected }); return;
      default: res.status(409).json({
        error: out.needsAcknowledgement ? 'Possible overlap with an existing case study. Check it, then confirm.' : 'An existing case study already covers this. Nothing was created.',
        overlaps: out.overlaps, needsAcknowledgement: out.needsAcknowledgement,
      });
    }
  } catch (err) {
    logFail('case_study_finder_build_failed', err);
    res.status(500).json({ error: 'Could not prepare the case study build.' });
  }
});

export default router;
