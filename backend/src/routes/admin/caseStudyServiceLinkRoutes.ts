/**
 * caseStudyServiceLinkRoutes — the admin surface for "which case study proves which service".
 *
 * ITS OWN ROUTER, not four more handlers bolted onto `factoryRoutes.ts`. That file is already past this repo's
 * 500-line hard ceiling, and CLAUDE.md's Modular Composition rule says the next change to an oversize file splits
 * before it adds. The route prefixes still sit under `/api/admin/factory/`, so nothing moves for the browser.
 *
 * Every route is `requireSection('program')` and tenant-scoped through `lookupGovContractsContainer()`, matching
 * its sibling: the service catalog is tenant-owned, so an unresolvable workspace is a 503 rather than a silent
 * read across tenants.
 *
 * THE SUGGEST ROUTE WRITES, which is why it is a POST and why its response reports `inserted` separately from
 * `proposed`. It is safe to call repeatedly: it only ever adds rows for pairs that have none, and never touches a
 * row a person has decided. A caller that re-runs it sees `inserted: 0`, which is the evidence it was idempotent
 * rather than a promise that it was.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { lookupGovContractsContainer } from '../../scripts/lib/factoryDemoContainer';
import {
  suggestLinksForCaseStudy,
  listLinksForCaseStudy,
  listLinksForService,
  decideLink,
  CaseStudyNotFoundError,
  CaseStudyServiceLinkNotFoundError,
} from '../../services/caseStudy/caseStudyServiceLinkStore';

const router = Router();

function logFail(event: string, err: any, context: Record<string, unknown>): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event,
    outcome: 'failure', error_class: err?.constructor?.name ?? 'Error', context: { ...context, message: err?.message },
  }));
}

function actorIdentity(req: Request): string {
  return String((req as any).admin?.email ?? (req as any).admin?.sub ?? 'unknown-admin');
}

const caseStudyParam = z.object({ caseStudyId: z.string().uuid() });
const serviceParam = z.object({ serviceId: z.string().uuid() });
const linkParam = z.object({ id: z.string().uuid() });
const stateQuery = z.object({ state: z.enum(['suggested', 'confirmed', 'rejected']).optional() });
// `suggested` is deliberately NOT accepted: a decision is what a person did, and there is no route back to
// "nobody has looked at this yet". The store refuses it too; this is the boundary saying so in a 400.
const decideBody = z.object({ state: z.enum(['confirmed', 'rejected']) });

/** GET /api/admin/factory/case-studies/:caseStudyId/service-links?state= — this record's services. */
router.get(
  '/api/admin/factory/case-studies/:caseStudyId/service-links',
  requireSection('program'),
  async (req: Request, res: Response) => {
    const p = caseStudyParam.safeParse(req.params);
    if (!p.success) { res.status(400).json({ error: 'Invalid case study id.' }); return; }
    const q = stateQuery.safeParse(req.query ?? {});
    if (!q.success) { res.status(400).json({ error: 'Invalid state filter.' }); return; }
    const container = await lookupGovContractsContainer();
    if (!container) {
      logFail('cs_service_links_list_scope', new Error('gov container not resolvable'), { id: p.data.caseStudyId });
      res.status(503).json({ error: 'The government contracts workspace is not configured.' });
      return;
    }
    try {
      const links = await listLinksForCaseStudy({
        caseStudyId: p.data.caseStudyId, tenantId: container.tenant.id, state: q.data.state,
      });
      res.json({ links });
    } catch (err: any) {
      logFail('cs_service_links_list_failed', err, { id: p.data.caseStudyId });
      res.status(500).json({ error: 'Could not load the service links.' });
    }
  },
);

/**
 * POST /api/admin/factory/case-studies/:caseStudyId/service-links/suggest — run the advisory pass.
 *
 * Writes new rows as `suggested` only. Idempotent: a second call inserts nothing and leaves every decided row
 * alone, so this is safe to wire to a button someone will double-click.
 */
router.post(
  '/api/admin/factory/case-studies/:caseStudyId/service-links/suggest',
  requireSection('program'),
  async (req: Request, res: Response) => {
    const p = caseStudyParam.safeParse(req.params);
    if (!p.success) { res.status(400).json({ error: 'Invalid case study id.' }); return; }
    const container = await lookupGovContractsContainer();
    if (!container) {
      logFail('cs_service_links_suggest_scope', new Error('gov container not resolvable'), { id: p.data.caseStudyId });
      res.status(503).json({ error: 'The government contracts workspace is not configured.' });
      return;
    }
    try {
      const result = await suggestLinksForCaseStudy({
        caseStudyId: p.data.caseStudyId,
        tenantId: container.tenant.id,
        // Records WHO RAN the pass, never that they agreed with it. The decision fields stay empty until someone
        // confirms, which is the difference between a keyword match and quotable past performance.
        suggestedBy: actorIdentity(req),
      });
      const links = await listLinksForCaseStudy({
        caseStudyId: p.data.caseStudyId, tenantId: container.tenant.id,
      });
      res.json({ ...result, links });
    } catch (err: any) {
      if (err instanceof CaseStudyNotFoundError) {
        res.status(404).json({ error: 'That case study was not found.' });
        return;
      }
      logFail('cs_service_links_suggest_failed', err, { id: p.data.caseStudyId });
      res.status(500).json({ error: 'Could not suggest service links.' });
    }
  },
);

/** GET /api/admin/factory/services/:serviceId/case-studies?state= — the evidence behind one service. */
router.get(
  '/api/admin/factory/services/:serviceId/case-studies',
  requireSection('program'),
  async (req: Request, res: Response) => {
    const p = serviceParam.safeParse(req.params);
    if (!p.success) { res.status(400).json({ error: 'Invalid service id.' }); return; }
    const q = stateQuery.safeParse(req.query ?? {});
    if (!q.success) { res.status(400).json({ error: 'Invalid state filter.' }); return; }
    const container = await lookupGovContractsContainer();
    if (!container) {
      logFail('service_case_studies_scope', new Error('gov container not resolvable'), { id: p.data.serviceId });
      res.status(503).json({ error: 'The government contracts workspace is not configured.' });
      return;
    }
    try {
      const links = await listLinksForService({
        serviceOfferingId: p.data.serviceId, tenantId: container.tenant.id, state: q.data.state,
      });
      res.json({ links });
    } catch (err: any) {
      logFail('service_case_studies_failed', err, { id: p.data.serviceId });
      res.status(500).json({ error: 'Could not load the case studies for that service.' });
    }
  },
);

/** POST /api/admin/factory/service-links/:id/decide — confirm or reject one suggestion. */
router.post(
  '/api/admin/factory/service-links/:id/decide',
  requireSection('program'),
  async (req: Request, res: Response) => {
    const p = linkParam.safeParse(req.params);
    if (!p.success) { res.status(400).json({ error: 'Invalid link id.' }); return; }
    const b = decideBody.safeParse(req.body ?? {});
    if (!b.success) {
      res.status(400).json({ error: 'A link can only be confirmed or rejected.', issues: b.error.issues });
      return;
    }
    const container = await lookupGovContractsContainer();
    if (!container) {
      logFail('service_link_decide_scope', new Error('gov container not resolvable'), { id: p.data.id });
      res.status(503).json({ error: 'The government contracts workspace is not configured.' });
      return;
    }
    try {
      const link = await decideLink({
        id: p.data.id, tenantId: container.tenant.id, state: b.data.state, decidedBy: actorIdentity(req),
      });
      res.json({ link });
    } catch (err: any) {
      if (err instanceof CaseStudyServiceLinkNotFoundError) {
        res.status(404).json({ error: 'That link was not found in this workspace.' });
        return;
      }
      logFail('service_link_decide_failed', err, { id: p.data.id });
      res.status(500).json({ error: 'Could not record the decision.' });
    }
  },
);

export default router;
