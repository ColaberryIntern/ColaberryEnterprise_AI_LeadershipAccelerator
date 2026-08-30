import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { runMetric } from '../../services/caseStudy/metrics/metricRunner';
import { METRIC_DEFINITION_KEYS } from '../../services/caseStudy/metrics/metricDefinitions';
import { ensureTraceId } from '../../utils/requestContext';

/**
 * Running a metric definition against a Case Study. `METRIC_PROVENANCE_PIPELINE.md`
 * §5.2 — admin-triggered, and a SEPARATE ACTION FROM SYNC.
 *
 * A THIRD SIBLING to the review desk and the authoring surface, for the same
 * reason those two are apart: this is the MEASUREMENT surface, and its route
 * table should read as the list of things an operator can measure. It is also
 * the only one of the three whose routes spend GitHub quota.
 *
 * EVERY CONVENTION IS COPIED FROM ITS SIBLINGS DELIBERATELY:
 *
 *   · FULL PATHS including `/api/admin`, because `adminRoutes` mounts children
 *     with `router.use(child)` and no prefix.
 *   · `requireAdmin` ON EVERY ROUTE INDIVIDUALLY. There is no
 *     `router.use(requireAdmin)`: an admin sub-router mounts with no path scope,
 *     so an unscoped guard would apply to every request reaching adminRoutes
 *     afterwards — which has caused a production outage in this repo.
 *   · Paths under `/api/admin/case-studies/...` so `mgmtSectionGate`'s existing
 *     `PATH_SECTION` row (`/api/admin/case-studies` → `program`) covers them. A
 *     new prefix would be deny-by-default for every scoped management role while
 *     legacy admin passed — a surface that half-works and looks fine.
 *   · Zod v4 (`error.issues`, never `.errors`), parsed before any service call.
 *   · THIN: parse → call the service that owns the rule → map the outcome.
 *
 * NOTHING HERE PROMOTES ANYTHING. A run writes `verification_class: 'pending'`
 * and `publishable: false`, and the writer never sets `verified_by`,
 * `verified_at` or `is_headline`. Promotion is a separate human act and belongs
 * to a later stage; there is no route for it in this file, on purpose.
 */

const router = Router();

const idParams = z.object({ id: z.uuid() });

const runBody = z.object({
  // The registry is the enum, so a key that no definition implements is refused
  // at the schema rather than reaching the runner to be refused again. Keeping
  // one source of truth means adding a definition adds its key here for free.
  definitionKey: z.enum(METRIC_DEFINITION_KEYS as [string, ...string[]]),
  /** Pins the run to a specific approved snapshot instead of the highest version. */
  snapshotId: z.uuid().optional(),
}).strict();

/** Zod v4: `error.issues`. Never `.errors` — that property does not exist. */
function parse<T>(schema: z.ZodType<T>, value: unknown, res: Response): T | null {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  res.status(400).json({
    error: 'Invalid metric run request',
    error_class: 'ValidationError',
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
  return null;
}

/**
 * A blocked run is not a server fault, and the two kinds are not the same fault.
 *
 * `unknown_definition` is the caller naming something that does not exist — 400.
 * The other two describe the RECORD's state: it has no approved snapshot, or no
 * repositories. The request was well formed and the operator did nothing wrong,
 * so 409 says "not in a state where this is possible" rather than blaming the
 * input. Both carry the reason as `error_class`, so a UI can tell an operator
 * what to do next instead of showing a generic failure.
 */
const BLOCKED_STATUS: Record<string, number> = {
  unknown_definition: 400,
  no_approved_snapshot: 409,
  no_repositories: 409,
};

router.post(
  '/api/admin/case-studies/:id/metrics/run',
  requireAdmin,
  async (req: Request, res: Response) => {
    const params = parse(idParams, req.params, res);
    if (!params) return;
    const body = parse(runBody, req.body, res);
    if (!body) return;

    try {
      const outcome = await runMetric({
        caseStudyId: params.id,
        definitionKey: body.definitionKey,
        ...(body.snapshotId ? { snapshotId: body.snapshotId } : {}),
        correlationId: ensureTraceId(req.header('X-Correlation-ID') ?? undefined),
        // The clock is read HERE, once, at the boundary. The runner and the
        // writer both take it as input so a run stays reproducible and a test is
        // never racing a real clock.
        computedAt: new Date().toISOString(),
      });

      if (outcome.status === 'blocked') {
        res.status(BLOCKED_STATUS[outcome.reason] ?? 409).json({
          error: outcome.message,
          error_class: outcome.reason,
        });
        return;
      }

      // A REFUSAL IS 200, NOT AN ERROR. The run did exactly what it should: it
      // found a figure a human had published and left it alone. The caller needs
      // the divergence rendered, not an exception — and a 4xx would train an
      // operator to read "the published number is being protected" as a fault.
      res.json({ status: outcome.status, write: outcome.write, repoStats: outcome.repoStats });
    } catch {
      res.status(500).json({ error: 'Metric run failed', error_class: 'InternalError' });
    }
  }
);

/** The definitions an operator can run, for populating the control. */
router.get(
  '/api/admin/case-studies/metrics/definitions',
  requireAdmin,
  (_req: Request, res: Response) => {
    res.json({ definitionKeys: METRIC_DEFINITION_KEYS });
  }
);

export default router;
