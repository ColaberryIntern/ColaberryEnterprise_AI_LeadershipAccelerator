/**
 * serviceGapRoutes - the AI Service Gap Detector API (Services Upgrade GD1). ADVISORY ONLY: no route here creates,
 * links, promotes, publishes or edits a service or a case study. Acting on a recommendation goes through the existing
 * human-click routes (service-links/:id/decide, case-studies/:id/propose-service, PATCH services/:id, promote).
 *
 *   GET  /api/admin/factory/service-gap-opportunities                    counters, clusters, latest per intake case, latest run
 *   GET  /api/admin/factory/case-studies/:caseStudyId/service-gap-analysis   latest analysis for one case (stale-flagged)
 *   POST /api/admin/factory/case-studies/:caseStudyId/service-gap-analysis   analyze or reuse; { force?: true } re-runs
 *   POST /api/admin/factory/service-gap-analysis/batch                    start "Analyze unlinked case studies" (202 / 409)
 *   GET  /api/admin/factory/service-gap-analysis/runs/latest              batch progress
 *   POST /api/admin/factory/service-gap-analyses/:id/review               { state: accepted|dismissed, note? }
 *
 * Every route is requireSection('program') and tenant-scoped through lookupGovContractsContainer(); an unresolvable
 * workspace is a 503 (fail closed). Bodies are Zod `.strict()`. Single analyses are rate-limited per admin.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { lookupGovContractsContainer } from '../../scripts/lib/factoryDemoContainer';
import { analyzeCaseStudy, latestAnalyses, reviewAnalysis, GapReviewNotFound } from '../../services/factory/serviceGap/serviceGapAnalysis';
import { latestRun, processRun, startRun } from '../../services/factory/serviceGap/serviceGapBatch';
import { loadCatalog, loadEvidence } from '../../services/factory/serviceGap/serviceGapLoader';
import { buildOpportunities } from '../../services/factory/serviceGap/serviceGapOpportunities';
import { caseStudyFingerprint, catalogFingerprint } from '../../services/factory/serviceGap/serviceGapRetrieval';
import { reviewBody } from '../../services/factory/serviceGap/serviceGapTypes';

const router = Router();
type AdminRequest = Request & { admin?: { email?: string; sub?: string } };
const actorIdentity = (req: AdminRequest): string => String(req.admin?.email ?? req.admin?.sub ?? 'unknown-admin');

function logFail(event: string, err: unknown, context: Record<string, unknown>): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: (err as Error)?.name ?? 'Error', context: { ...context, message: String((err as Error)?.message ?? err).slice(0, 200) },
  }));
}

async function tenantOr503(res: Response, event: string, id: string): Promise<string | null> {
  const container = await lookupGovContractsContainer().catch((err: unknown) => { logFail(event, err, { id }); return null; });
  if (!container) { res.status(503).json({ error: 'The government contracts workspace is not configured.' }); return null; }
  return container.tenant.id;
}

const caseParam = z.object({ caseStudyId: z.string().uuid() });
const idParam = z.object({ id: z.string().uuid() });
const analyzeBody = z.object({ force: z.boolean().optional() }).strict();

/** Per-admin sliding window for single analyses: each one can cost a model call. */
export const ANALYZE_LIMIT = { max: 20, windowMs: 60_000 };
const recent = new Map<string, number[]>();
export function allowAnalyze(actor: string, now = Date.now()): boolean {
  const hits = (recent.get(actor) ?? []).filter((t) => now - t < ANALYZE_LIMIT.windowMs);
  if (hits.length >= ANALYZE_LIMIT.max) { recent.set(actor, hits); return false; }
  hits.push(now); recent.set(actor, hits);
  return true;
}
export function __resetAnalyzeLimit(): void { recent.clear(); }

router.get('/api/admin/factory/service-gap-opportunities', requireSection('program'), async (req: AdminRequest, res: Response) => {
  const tenantId = await tenantOr503(res, 'service_gap_opportunities_scope', '-');
  if (!tenantId) return;
  try { res.json(await buildOpportunities(tenantId)); } catch (err) {
    logFail('service_gap_opportunities_failed', err, {});
    res.status(500).json({ error: 'Could not load service recommendations.' });
  }
});

router.get('/api/admin/factory/case-studies/:caseStudyId/service-gap-analysis', requireSection('program'), async (req: AdminRequest, res: Response) => {
  const p = caseParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid case study id.' }); return; }
  const tenantId = await tenantOr503(res, 'service_gap_get_scope', p.data.caseStudyId);
  if (!tenantId) return;
  try {
    const ev = (await loadEvidence([p.data.caseStudyId])).get(p.data.caseStudyId);
    if (!ev) { res.status(404).json({ error: 'Case study not found.' }); return; }
    const catalogFp = catalogFingerprint(await loadCatalog(tenantId));
    const latest = await latestAnalyses(tenantId, new Map([[ev.id, { caseFp: caseStudyFingerprint(ev), catalogFp }]]));
    res.json({ analysis: latest.get(ev.id) ?? null });
  } catch (err) {
    logFail('service_gap_get_failed', err, { id: p.data.caseStudyId });
    res.status(500).json({ error: 'Could not load the analysis.' });
  }
});

router.post('/api/admin/factory/case-studies/:caseStudyId/service-gap-analysis', requireSection('program'), async (req: AdminRequest, res: Response) => {
  const p = caseParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid case study id.' }); return; }
  const b = analyzeBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'The only option is force (true/false).', issues: b.error.issues }); return; }
  const tenantId = await tenantOr503(res, 'service_gap_analyze_scope', p.data.caseStudyId);
  if (!tenantId) return;
  const actor = actorIdentity(req);
  if (!allowAnalyze(actor)) { res.status(429).json({ error: 'Too many analyses in a minute. Use "Analyze unlinked case studies" for the backlog.' }); return; }
  try {
    const ev = (await loadEvidence([p.data.caseStudyId])).get(p.data.caseStudyId);
    if (!ev) { res.status(404).json({ error: 'Case study not found.' }); return; }
    const { view, reused } = await analyzeCaseStudy({ tenantId, evidence: ev, catalog: await loadCatalog(tenantId), actor, force: b.data.force === true });
    res.json({ analysis: view, reused });
  } catch (err) {
    logFail('service_gap_analyze_failed', err, { id: p.data.caseStudyId });
    res.status(500).json({ error: 'Could not analyze this case study. Manual linking still works.' });
  }
});

router.post('/api/admin/factory/service-gap-analysis/batch', requireSection('program'), async (req: AdminRequest, res: Response) => {
  const tenantId = await tenantOr503(res, 'service_gap_batch_scope', '-');
  if (!tenantId) return;
  try {
    const actor = actorIdentity(req);
    const { run, started, caseStudyIds } = await startRun(tenantId, actor);
    if (!started) { res.status(409).json({ error: 'An analysis run is already in progress.', run }); return; }
    // Fire and forget: progress is on the run row; processRun never throws.
    void processRun({ runId: run.id, tenantId, caseStudyIds, actor });
    res.status(202).json({ run });
  } catch (err) {
    logFail('service_gap_batch_start_failed', err, {});
    res.status(500).json({ error: 'Could not start the analysis run.' });
  }
});

router.get('/api/admin/factory/service-gap-analysis/runs/latest', requireSection('program'), async (req: AdminRequest, res: Response) => {
  const tenantId = await tenantOr503(res, 'service_gap_run_scope', '-');
  if (!tenantId) return;
  try { res.json({ run: await latestRun(tenantId) }); } catch (err) {
    logFail('service_gap_run_failed', err, {});
    res.status(500).json({ error: 'Could not load the analysis run.' });
  }
});

router.post('/api/admin/factory/service-gap-analyses/:id/review', requireSection('program'), async (req: AdminRequest, res: Response) => {
  const p = idParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Invalid analysis id.' }); return; }
  const b = reviewBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'state must be accepted or dismissed; note is optional (max 500).', issues: b.error.issues }); return; }
  const tenantId = await tenantOr503(res, 'service_gap_review_scope', p.data.id);
  if (!tenantId) return;
  try {
    res.json({ analysis: await reviewAnalysis({ tenantId, id: p.data.id, state: b.data.state, note: b.data.note ?? null, actor: actorIdentity(req) }) });
  } catch (err) {
    if (err instanceof GapReviewNotFound) { res.status(404).json({ error: err.message }); return; }
    logFail('service_gap_review_failed', err, { id: p.data.id });
    res.status(500).json({ error: 'Could not save the review.' });
  }
});

export default router;
