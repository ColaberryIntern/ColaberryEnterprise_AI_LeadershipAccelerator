/**
 * serviceProposalRoutes - grow Our Services from case studies (package spec 1D, 1E).
 *
 *   POST /api/admin/factory/case-studies/:caseStudyId/propose-service  { name, category?, description?, keywords?, naicsCodes? }
 *        -> creates a `growth` service + a `confirmed` link, or links an existing namesake (`existing: true`).
 *   POST /api/admin/factory/services/:serviceId/promote
 *        -> growth -> active, refused with 409 and a plain sentence unless the service has >= 1 confirmed case study.
 *
 * Its own router rather than more handlers in `factoryRoutes.ts` (past the 500-line ceiling). Every route is
 * `requireSection('program')` and tenant-scoped through `lookupGovContractsContainer()`; an unresolvable workspace is
 * a 503, never a write into an unknown tenant. Bodies are Zod-validated and `.strict()`, so a request cannot set
 * `status`, `created_by` or `tenant_id` itself.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { lookupGovContractsContainer } from '../../scripts/lib/factoryDemoContainer';
import {
  proposeServiceFromCaseStudy, promoteServiceOffering, ServiceProposalError,
} from '../../services/factory/serviceProposal';

const router = Router();
type AdminRequest = Request & { admin?: { email?: string; sub?: string } };
const actorIdentity = (req: AdminRequest): string => String(req.admin?.email ?? req.admin?.sub ?? 'unknown-admin');

function logFail(event: string, err: unknown, context: Record<string, unknown>): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: (err as Error)?.name ?? 'Error', context: { ...context, message: String((err as Error)?.message ?? err).slice(0, 200) },
  }));
}

const caseStudyParam = z.object({ caseStudyId: z.string().uuid() });
const serviceParam = z.object({ serviceId: z.string().uuid() });
export const proposeBody = z.object({
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().max(120).nullish(),
  description: z.string().trim().max(2000).nullish(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  naicsCodes: z.array(z.string().trim().regex(/^\d{2,6}$/, 'NAICS codes are 2-6 digits')).max(20).optional(),
}).strict();

async function tenantOr503(res: Response, event: string, id: string): Promise<string | null> {
  const container = await lookupGovContractsContainer().catch((err: unknown) => { logFail(event, err, { id }); return null; });
  if (!container) {
    res.status(503).json({ error: 'The government contracts workspace is not configured.' });
    return null;
  }
  return container.tenant.id;
}

router.post(
  '/api/admin/factory/case-studies/:caseStudyId/propose-service',
  requireSection('program'),
  async (req: AdminRequest, res: Response) => {
    const p = caseStudyParam.safeParse(req.params);
    if (!p.success) { res.status(400).json({ error: 'Invalid case study id.' }); return; }
    const b = proposeBody.safeParse(req.body ?? {});
    if (!b.success) { res.status(400).json({ error: 'A service needs a name (2-200 characters); other fields are optional.', issues: b.error.issues }); return; }
    const tenantId = await tenantOr503(res, 'service_propose_scope', p.data.caseStudyId);
    if (!tenantId) return;
    try {
      const result = await proposeServiceFromCaseStudy({
        tenantId, caseStudyId: p.data.caseStudyId, actor: actorIdentity(req), name: b.data.name,
        category: b.data.category ?? null, description: b.data.description ?? null,
        keywords: b.data.keywords, naicsCodes: b.data.naicsCodes,
      });
      res.status(result.existing ? 200 : 201).json(result);
    } catch (err) {
      if (err instanceof ServiceProposalError) { res.status(err.httpStatus).json({ error: err.message, errorClass: err.errorClass }); return; }
      logFail('service_propose_failed', err, { id: p.data.caseStudyId });
      res.status(500).json({ error: 'Could not propose the service.' });
    }
  },
);

router.post(
  '/api/admin/factory/services/:serviceId/promote',
  requireSection('program'),
  async (req: AdminRequest, res: Response) => {
    const p = serviceParam.safeParse(req.params);
    if (!p.success) { res.status(400).json({ error: 'Invalid service id.' }); return; }
    const tenantId = await tenantOr503(res, 'service_promote_scope', p.data.serviceId);
    if (!tenantId) return;
    try {
      res.json(await promoteServiceOffering({ tenantId, serviceId: p.data.serviceId, actor: actorIdentity(req) }));
    } catch (err) {
      if (err instanceof ServiceProposalError) { res.status(err.httpStatus).json({ error: err.message, errorClass: err.errorClass }); return; }
      logFail('service_promote_failed', err, { id: p.data.serviceId });
      res.status(500).json({ error: 'Could not promote the service.' });
    }
  },
);

export default router;
