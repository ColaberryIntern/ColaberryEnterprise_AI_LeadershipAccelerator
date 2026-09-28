import { Request, Response } from 'express';
import { z } from 'zod';
import { computeJourneyMetrics, MAX_WINDOW_DAYS } from '../services/growthJourney/performance/journeyMetricsService';
import { badRequest, logReadFailure, scopedContext } from './growthJourneyController';

/**
 * The journey's registered metrics, for the scope the caller may see (T605).
 *
 * ─── THE SCOPE COMES FROM THE MEMBERSHIPS, NEVER FROM THE QUERY ─────────────
 *
 * `scopedContext` resolves the caller's tenant and brands from their
 * `tenant_memberships` and refuses (403) a `?brand_id=` outside them; the
 * service then reads only `authorizedBrandIds`, narrowed by that parameter when
 * it was given. A caller with no membership resolves to a context with no
 * tenant, which reads as an empty scope - no rows, no metrics, not an error,
 * which is the same fail-closed behaviour every other journey read has. In
 * production today that is every admin, because `tenant_memberships` is empty;
 * stated here so the empty answer is not read as a bug in this route.
 *
 * ─── WHAT IT RETURNS ────────────────────────────────────────────────────────
 *
 * Every registered `journey.*` metric, each with its registry definition
 * (name, unit, status, reason), its computed value in the Phase 4 rate
 * vocabulary (null with `no_denominator`, never a 0 nobody can defend), and its
 * own freshness verdict. No row of any journey table reaches the response: the
 * service aggregates in the database and returns scalars.
 */

const querySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  brand_id: z.string().uuid().optional(),
  program_id: z.string().uuid().optional(),
  window_days: z.coerce.number().int().min(1).max(MAX_WINDOW_DAYS).optional(),
});

export async function getJourneyMetricsHandler(req: Request, res: Response): Promise<void> {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    badRequest(res, parsed.error);
    return;
  }
  const query = parsed.data;
  try {
    const ctx = await scopedContext(req, res, query);
    if (!ctx) return; // scopedContext has already answered 403/404.
    const result = await computeJourneyMetrics({
      tenantId: ctx.tenantId ?? '',
      brandIds: ctx.authorizedBrandIds ?? (ctx.brandId ? [ctx.brandId] : []),
      brandId: query.brand_id ?? ctx.brandId ?? null,
      programId: query.program_id ?? null,
      windowDays: query.window_days,
    });
    res.json(result);
  } catch (err) {
    const errorClass = logReadFailure(req, err, 'journey_metrics_read_failed');
    res.status(500).json({ error: 'Journey metrics read failed', error_class: errorClass });
  }
}
