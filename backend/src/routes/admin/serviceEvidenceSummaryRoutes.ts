/**
 * serviceEvidenceSummaryRoutes - GET /api/admin/factory/services/evidence-summary?status=active|growth|all
 * (Services Upgrade SV2.1, package spec 1F). The one read that feeds the Our Services evidence page.
 *
 * READ-ONLY. `requireSection('program')` and tenant-scoped through `lookupGovContractsContainer()`, matching its
 * siblings (caseStudyServiceLinkRoutes, caseStudyOutsideIntakeRoutes): an unresolvable workspace is a 503, never a
 * read across tenants. Its own router because factoryRoutes.ts is past the 500-line ceiling.
 *
 * CONTRACT AT THE BOUNDARY (CLAUDE.md Contract Enforcement): the query is Zod-validated (400 on a bad status), and
 * the response is validated against EvidenceSummarySchema before it is sent. In dev and test a violation FAILS LOUD
 * (500, errorClass ContractViolation) so a builder/schema drift breaks a test; in production it is logged and the
 * body is still sent, so a cosmetic drift never takes the page down. Error bodies are fixed sentences.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { lookupGovContractsContainer } from '../../scripts/lib/factoryDemoContainer';
import { getServiceEvidenceSummary } from '../../services/factory/serviceEvidenceSummary';
import { EvidenceSummarySchema, SUMMARY_STATUS } from '../../services/factory/serviceEvidenceSummaryTypes';

const router = Router();

function log(level: 'error' | 'warn', event: string, err: unknown, context: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level, service: 'backend', event, outcome: 'failure',
    error_class: (err as Error)?.name ?? 'Error', context: { ...context, message: String((err as Error)?.message ?? err).slice(0, 300) },
  }));
}

export const evidenceSummaryQuery = z.object({ status: z.enum(SUMMARY_STATUS).optional() });

/** Fail loud outside production so schema drift is caught by tests and in dev. */
const failLoud = (): boolean => process.env.APP_ENV === 'dev' || process.env.NODE_ENV === 'test';

router.get(
  '/api/admin/factory/services/evidence-summary',
  requireSection('program'),
  async (req: Request, res: Response) => {
    const q = evidenceSummaryQuery.safeParse(req.query ?? {});
    if (!q.success) { res.status(400).json({ error: 'status must be active, growth or all.' }); return; }
    const started = Date.now();
    const container = await lookupGovContractsContainer().catch((err: unknown) => { log('error', 'service_evidence_summary_scope_failed', err); return null; });
    if (!container) {
      res.status(503).json({ error: 'The government contracts workspace is not configured.' });
      return;
    }
    try {
      const summary = await getServiceEvidenceSummary({ tenantId: container.tenant.id, status: q.data.status ?? 'active' });
      const check = EvidenceSummarySchema.safeParse(summary);
      if (!check.success) {
        const issue = check.error.issues[0];
        const detail = { path: issue?.path.join('.'), code: issue?.code, issues: check.error.issues.length };
        if (failLoud()) {
          log('error', 'service_evidence_summary_contract_violation', { name: 'ContractViolation', message: 'response failed EvidenceSummarySchema' }, detail);
          res.status(500).json({ error: 'The evidence summary did not match its contract.', errorClass: 'ContractViolation' });
          return;
        }
        log('warn', 'service_evidence_summary_contract_violation', { name: 'ContractViolation', message: 'response failed EvidenceSummarySchema' }, detail);
      }
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'info', service: 'backend', event: 'service_evidence_summary_served', outcome: 'success',
        duration_ms: Date.now() - started, // Optional chaining: in production a drifted body is still served, so this line must not throw on it.
        context: { status: summary?.status ?? null, services: summary?.services?.length ?? null, feed: summary?.opportunityFeed?.source ?? null },
      }));
      res.json(summary);
    } catch (err) {
      log('error', 'service_evidence_summary_failed', err);
      res.status(500).json({ error: 'Could not load the evidence summary.' });
    }
  },
);

export default router;
