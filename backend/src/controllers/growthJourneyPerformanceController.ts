import { Request, Response } from 'express';
import type { z } from 'zod';
import { getCampaignMetricsByJourney } from '../services/marketingAnalyticsService';
import { computeJourneyMetrics } from '../services/growthJourney/performance/journeyMetricsService';
import { readOutcomes, readRates, readReceipts } from '../services/growthJourney/performance/performanceReads';
import {
  byJourneyQuerySchema,
  metricsQuerySchema,
  outcomesQuerySchema,
  ratesQuerySchema,
  receiptsQuerySchema,
} from '../schemas/growthJourneySchema';
import { badRequest, logReadFailure, scopedContext } from './growthJourneyController';

/**
 * The journey's performance reads (T605 the metrics, T606 the rest).
 *
 * ─── THE SCOPE COMES FROM THE MEMBERSHIPS, NEVER FROM THE QUERY ─────────────
 *
 * Every handler resolves the caller's tenant and brands through `scopedContext`,
 * which grants a requested `brand_id` only against a real membership and
 * refuses anything else with a 403 before a query runs. The services then read
 * `authorizedBrandIds`, narrowed by that parameter when it was given. A caller
 * with no membership resolves to an empty scope, which reads as an empty page
 * rather than an error - the same fail-closed shape every other journey read
 * has, and in production today that is every admin, because
 * `tenant_memberships` is empty.
 *
 * ─── WHAT LEAVES HERE ───────────────────────────────────────────────────────
 *
 * Scalars and definition strings. The list reads project column by column and
 * pass `status_reason` through `safeField`; no `metadata`, no `evidence`, no
 * `payload`, no `lead_id`. See `performanceReads.ts`'s header for the rule and
 * the access suite for the adversarial control.
 */

/** One shape for all five handlers: parse, scope, read, answer - with one failure path. */
async function serveRead<S extends z.ZodTypeAny>(
  req: Request,
  res: Response,
  schema: S,
  event: string,
  read: (query: z.infer<S>, scope: { tenantId: string; brandIds: string[]; brandId: string | null; programId: string | null }) => Promise<unknown>,
): Promise<void> {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    badRequest(res, parsed.error);
    return;
  }
  const query = parsed.data as z.infer<S> & { tenant_id?: string; brand_id?: string; program_id?: string };
  try {
    const ctx = await scopedContext(req, res, query);
    if (!ctx) return; // scopedContext has already answered 403/404.
    const brandIds = ctx.authorizedBrandIds ?? (ctx.brandId ? [ctx.brandId] : []);
    const brandId = query.brand_id ?? ctx.brandId ?? null;
    const scoped = brandId ? brandIds.filter((b) => b === brandId) : brandIds;
    res.json(await read(query, {
      tenantId: ctx.tenantId ?? '',
      brandIds: scoped,
      brandId,
      programId: query.program_id ?? null,
    }));
  } catch (err) {
    const errorClass = logReadFailure(req, err, event);
    res.status(500).json({ error: 'Journey performance read failed', error_class: errorClass });
  }
}

export async function getJourneyMetricsHandler(req: Request, res: Response): Promise<void> {
  await serveRead(req, res, metricsQuerySchema, 'journey_metrics_read_failed', (query, scope) =>
    computeJourneyMetrics({ tenantId: scope.tenantId, brandIds: scope.brandIds, brandId: scope.brandId, programId: scope.programId, windowDays: query.window_days }));
}

export async function getJourneyRatesHandler(req: Request, res: Response): Promise<void> {
  await serveRead(req, res, ratesQuerySchema, 'journey_rates_read_failed', async (query, scope) => ({
    ...(await readRates({ brandIds: scope.brandIds, windowDays: query.window_days })),
    scope: { tenant_id: scope.tenantId, brand_id: scope.brandId, program_id: scope.programId },
  }));
}

export async function getJourneyReceiptsHandler(req: Request, res: Response): Promise<void> {
  await serveRead(req, res, receiptsQuerySchema, 'journey_receipts_read_failed', async (query, scope) => ({
    ...(await readReceipts({ brandIds: scope.brandIds, programId: scope.programId, limit: query.limit, offset: query.offset, status: query.status, channel: query.channel })),
    scope: { tenant_id: scope.tenantId, brand_id: scope.brandId, program_id: scope.programId },
  }));
}

export async function getJourneyOutcomesHandler(req: Request, res: Response): Promise<void> {
  await serveRead(req, res, outcomesQuerySchema, 'journey_outcomes_read_failed', async (query, scope) => ({
    ...(await readOutcomes({ brandIds: scope.brandIds, limit: query.limit, offset: query.offset, outcomeType: query.outcome_type, source: query.source })),
    scope: { tenant_id: scope.tenantId, brand_id: scope.brandId, program_id: scope.programId },
  }));
}

/**
 * The Marketing Ops by-journey roll-up, under the journey's own prefix.
 *
 * The SAME service the marketing route calls (`getCampaignMetricsByJourney`) - §14 forbids a second
 * computation of the same rows, and this is the one screen where brand x programme x path belongs.
 * The difference is the scoping: the marketing route checks one requested brand against the admin's
 * tenant scope, while here the caller's memberships decide, and the rows are filtered to the brands
 * that survived that. A caller with no membership gets an empty list, never another brand's rows.
 */
export async function getJourneyByJourneyHandler(req: Request, res: Response): Promise<void> {
  await serveRead(req, res, byJourneyQuerySchema, 'journey_by_journey_read_failed', async (query, scope) => {
    if (scope.brandIds.length === 0) return { journeys: [], scope: { tenant_id: scope.tenantId, brand_id: scope.brandId, program_id: null, start: query.start ?? null, end: query.end ?? null } };
    const journeys = await getCampaignMetricsByJourney({ start: query.start, end: query.end, brandId: scope.brandId ?? undefined });
    const allowed = new Set(scope.brandIds);
    return {
      journeys: journeys.filter((row) => allowed.has(row.brand_id)),
      scope: { tenant_id: scope.tenantId, brand_id: scope.brandId, program_id: null, start: query.start ?? null, end: query.end ?? null },
    };
  });
}
