import { Request, Response } from 'express';
import { z } from 'zod';
import { badRequest, logReadFailure, READ_FAILURE, scopedContext } from './growthJourneyController';
import {
  explorerScopeQuerySchema,
  splitScope,
  type ExplorerScopeQuery,
} from '../schemas/growthJourneyExplorerSchema';
import {
  contentQuerySchema,
  decisionParamsSchema,
  decisionsQuerySchema,
  distributionQuerySchema,
  eligibilityParamsSchema,
  learnerParamsSchema,
  learnerSeriesQuerySchema,
  learnersQuerySchema,
  outreachQuerySchema,
  shadowQuerySchema,
} from '../schemas/explorerGrowthSchema';
import {
  readExplorerCampusActivity,
  readExplorerContent,
  readExplorerDecisions,
  readExplorerDistribution,
  readExplorerEligibility,
  readExplorerLearner,
  readExplorerLearnerDecisions,
  readExplorerLearnerSignals,
  readExplorerLearners,
  readExplorerOutreach,
  readExplorerShadow,
  readExplorerSummary,
  readExplorerWhy,
  type ScopedRead,
} from '../services/growthJourney/reads/explorerBrandReads';

/**
 * Explorer Growth's reads, inside the Growth Journey workspace, scoped by brand.
 *
 * Thirteen handlers over ONE serve helper, the same discipline
 * `growthJourneyInspectController` uses: a handler names its schema, its log
 * event and its read, and owns nothing else.
 *
 * ─── IT VALIDATES WITH EXPLORER'S OWN SCHEMAS, NOT COPIES ───────────────────
 *
 * The query half of every request is validated by the exact schema the matching
 * Explorer route uses, imported unchanged. Only the scope keys are lifted
 * out first (`splitScope`), because Explorer's schemas are `.strict()` and would
 * reject them. So a brand-scoped read enforces byte-identical input rules to the
 * page it mirrors - which is what makes "the same page, by brand" a fact about
 * the contract rather than a claim in a plan.
 *
 * ─── TWO LAYERS OF SCOPE, AND THEY ANSWER DIFFERENT QUESTIONS ───────────────
 *
 * `scopedContext` answers "may this caller ask about this brand at all?" from
 * their memberships, and refuses with 403 rather than widening. Only then does
 * `resolveExplorerScope` (inside the reads) answer "is this brand the one
 * Explorer's population belongs to?" and return `data: null` when it is not.
 *
 * The order matters. Authorization first means a caller who holds no membership
 * never learns anything about which brand owns Explorer's data, not even by
 * inference from a different refusal shape.
 *
 * ─── WHAT THIS RETURNS IN PRODUCTION ON THE DAY IT SHIPS ────────────────────
 *
 * `tenant_memberships` holds zero rows, so `ctx.brandId` is null for every
 * admin and a request naming a brand gets **403**. That is the state the UI has
 * to render as a named configuration step rather than a red error, and it
 * resolves when an operator populates memberships - not when somebody loosens
 * the guard. A request naming NO brand is in scope and unnarrowed, which is how
 * the page is useful before the seed runs.
 */

/** The tenancy echo plus Explorer's own verdict, in one object the UI can branch on. */
interface ScopeEnvelope {
  tenant_id: string;
  brand_id: string | null;
  program_id: string | null;
  in_scope: boolean;
  reason: string;
}

function envelope<T>(
  read: ScopedRead<T>,
  tenantId: string,
  programId: string | null
): { data: T | null; scope: ScopeEnvelope; invariant?: ScopedRead<T>['invariant'] } {
  const body: { data: T | null; scope: ScopeEnvelope; invariant?: ScopedRead<T>['invariant'] } = {
    data: read.data,
    scope: {
      tenant_id: tenantId,
      brand_id: read.scope.brand_id,
      program_id: programId,
      in_scope: read.scope.in_scope,
      reason: read.scope.reason,
    },
  };
  // Only present when the summary read computed it. Absent, rather than null, so
  // "not applicable here" and "checked" are not the same value.
  if (read.invariant) body.invariant = read.invariant;
  return body;
}

/**
 * Parse, authorize, read, answer - and one failure path, matching `serveRead`.
 *
 * Not `serveRead` itself: that helper validates the whole query string with a
 * single schema, which cannot work when the query belongs to Explorer's strict
 * schema and the scope keys do not. The refusal and failure SHAPES are reused
 * from the same module, so a 400, 403 and 500 are indistinguishable between this
 * controller and its siblings.
 */
async function serveExplorerRead<S extends z.ZodTypeAny>(
  req: Request,
  res: Response,
  querySchema: S,
  event: string,
  read: (
    query: z.infer<S>,
    scope: { requestedBrandId: string | null; ctxBrandId: string | null }
  ) => Promise<ScopedRead<unknown>>
): Promise<void> {
  const split = splitScope(req.query as Record<string, unknown>);

  const scopeParsed = explorerScopeQuerySchema.safeParse(split.scope);
  if (!scopeParsed.success) return badRequest(res, scopeParsed.error);

  // Explorer's own schema, unchanged. An unknown key is still a 400: it was not
  // a scope key, so it is in `rest`, and `rest` is strict.
  const queryParsed = querySchema.safeParse(split.rest);
  if (!queryParsed.success) return badRequest(res, queryParsed.error);

  const scopeQuery: ExplorerScopeQuery = scopeParsed.data;

  try {
    const ctx = await scopedContext(req, res, scopeQuery);
    if (!ctx) return; // scopedContext has already answered 403/404.

    const result = await read(queryParsed.data as z.infer<S>, {
      requestedBrandId: scopeQuery.brand_id ?? null,
      ctxBrandId: ctx.brandId ?? null,
    });

    // `null`, never an echo of the request: see the scope schema on why
    // `program_id` is not accepted at all. Explorer Growth is one programme, so
    // there is no programme filter to report.
    res.json(envelope(result, ctx.tenantId ?? '', null));
  } catch (err) {
    const errorClass = logReadFailure(req, err, event);
    res.status(500).json({ error: READ_FAILURE, error_class: errorClass });
  }
}

/**
 * The six reads that carry a path parameter.
 *
 * Params are parsed BEFORE the query, so a malformed learner id is a 400 whether
 * or not the query string also happens to be wrong - and the message names the
 * id, which is the field the caller got wrong.
 */
async function serveExplorerReadWithParams<P extends z.ZodTypeAny, S extends z.ZodTypeAny>(
  req: Request,
  res: Response,
  paramsSchema: P,
  querySchema: S,
  event: string,
  read: (
    params: z.infer<P>,
    query: z.infer<S>,
    scope: { requestedBrandId: string | null; ctxBrandId: string | null }
  ) => Promise<ScopedRead<unknown>>
): Promise<void> {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  await serveExplorerRead(req, res, querySchema, event, (query, scope) =>
    read(params.data as z.infer<P>, query, scope)
  );
}

/**
 * The reads that take no query parameters still reject unknown keys.
 *
 * Strict and empty, so `?limit=50` on `/summary` is a 400 rather than a silently
 * ignored parameter - a caller asking for something it will not get must not be
 * able to believe it got it. The scope keys are already lifted out before this
 * runs, so they are not unknown here.
 */
const noQuerySchema = z.object({}).strict();

/* ── The thirteen handlers ──────────────────────────────────────────────────── */

export async function getExplorerSummaryHandler(req: Request, res: Response): Promise<void> {
  await serveExplorerRead(req, res, noQuerySchema, 'explorer_brand_summary_read_failed', (_q, s) =>
    readExplorerSummary(s.requestedBrandId, s.ctxBrandId)
  );
}

export async function getExplorerDistributionHandler(req: Request, res: Response): Promise<void> {
  await serveExplorerRead(req, res, distributionQuerySchema, 'explorer_brand_distribution_read_failed', (q, s) =>
    readExplorerDistribution(s.requestedBrandId, s.ctxBrandId, q.days)
  );
}

export async function getExplorerCampusHandler(req: Request, res: Response): Promise<void> {
  await serveExplorerRead(req, res, noQuerySchema, 'explorer_brand_campus_read_failed', (_q, s) =>
    readExplorerCampusActivity(s.requestedBrandId, s.ctxBrandId)
  );
}

export async function getExplorerOutreachHandler(req: Request, res: Response): Promise<void> {
  await serveExplorerRead(req, res, outreachQuerySchema, 'explorer_brand_outreach_read_failed', (q, s) =>
    readExplorerOutreach(s.requestedBrandId, s.ctxBrandId, {
      view: q.view,
      limit: q.limit,
      offset: q.offset,
    })
  );
}

export async function getExplorerLearnersHandler(req: Request, res: Response): Promise<void> {
  await serveExplorerRead(req, res, learnersQuerySchema, 'explorer_brand_learners_read_failed', (q, s) =>
    readExplorerLearners(s.requestedBrandId, s.ctxBrandId, q)
  );
}

export async function getExplorerLearnerHandler(req: Request, res: Response): Promise<void> {
  await serveExplorerReadWithParams(
    req,
    res,
    learnerParamsSchema,
    noQuerySchema,
    'explorer_brand_learner_read_failed',
    (p, _q, s) => readExplorerLearner(s.requestedBrandId, s.ctxBrandId, p.enrollmentId)
  );
}

export async function getExplorerLearnerSignalsHandler(req: Request, res: Response): Promise<void> {
  await serveExplorerReadWithParams(
    req,
    res,
    learnerParamsSchema,
    learnerSeriesQuerySchema,
    'explorer_brand_learner_signals_read_failed',
    (p, q, s) => readExplorerLearnerSignals(s.requestedBrandId, s.ctxBrandId, p.enrollmentId, q.days)
  );
}

export async function getExplorerLearnerDecisionsHandler(req: Request, res: Response): Promise<void> {
  await serveExplorerReadWithParams(
    req,
    res,
    learnerParamsSchema,
    // `decisionsQuerySchema` for its BOUND, exactly as Explorer's own
    // `getLearnerDecisionsHandler` does and for the reason it documents: §27
    // specifies no bound for this route, and without one a learner with a year
    // of daily decisions returns 365 rows while the roster beside it pages at
    // 50. Its `action` / `date` / `executed` keys are accepted and unused here
    // because they are accepted and unused on the Explorer route too. Parity is
    // the point; diverging would make the brand-scoped copy stricter than the
    // page it mirrors.
    decisionsQuerySchema,
    'explorer_brand_learner_decisions_read_failed',
    // The page is threaded through rather than defaulted here: the service is
    // paginated, and a default chosen in a controller silently caps a drawer.
    (p, q, s) =>
      readExplorerLearnerDecisions(s.requestedBrandId, s.ctxBrandId, p.enrollmentId, q.limit, q.offset)
  );
}

export async function getExplorerEligibilityHandler(req: Request, res: Response): Promise<void> {
  await serveExplorerReadWithParams(
    req,
    res,
    eligibilityParamsSchema,
    noQuerySchema,
    'explorer_brand_eligibility_read_failed',
    (p, _q, s) => readExplorerEligibility(s.requestedBrandId, s.ctxBrandId, p.enrollmentId)
  );
}

export async function getExplorerDecisionsHandler(req: Request, res: Response): Promise<void> {
  await serveExplorerRead(req, res, decisionsQuerySchema, 'explorer_brand_decisions_read_failed', (q, s) =>
    readExplorerDecisions(s.requestedBrandId, s.ctxBrandId, q)
  );
}

export async function getExplorerWhyHandler(req: Request, res: Response): Promise<void> {
  await serveExplorerReadWithParams(
    req,
    res,
    decisionParamsSchema,
    noQuerySchema,
    'explorer_brand_why_read_failed',
    (p, _q, s) => readExplorerWhy(s.requestedBrandId, s.ctxBrandId, p.id)
  );
}

export async function getExplorerShadowHandler(req: Request, res: Response): Promise<void> {
  await serveExplorerRead(req, res, shadowQuerySchema, 'explorer_brand_shadow_read_failed', (q, s) =>
    readExplorerShadow(s.requestedBrandId, s.ctxBrandId, q)
  );
}

export async function getExplorerContentHandler(req: Request, res: Response): Promise<void> {
  await serveExplorerRead(req, res, contentQuerySchema, 'explorer_brand_content_read_failed', (q, s) =>
    readExplorerContent(s.requestedBrandId, s.ctxBrandId, q)
  );
}

/**
 * Every handler this controller exposes, so a route test can assert one route
 * per handler AND one handler per read in `EXPLORER_BRAND_READS`.
 *
 * The count has already drifted once in this build's own plan - T2 grew from six
 * reads to eleven to thirteen while T4 still said eight paths, leaving four UI
 * panels with no reachable route. A table in a document cannot keep two lists in
 * step. This list plus the equality test can.
 */
export const EXPLORER_BRAND_HANDLERS = [
  'getExplorerSummaryHandler',
  'getExplorerDistributionHandler',
  'getExplorerCampusHandler',
  'getExplorerOutreachHandler',
  'getExplorerLearnersHandler',
  'getExplorerLearnerHandler',
  'getExplorerLearnerSignalsHandler',
  'getExplorerLearnerDecisionsHandler',
  'getExplorerEligibilityHandler',
  'getExplorerDecisionsHandler',
  'getExplorerWhyHandler',
  'getExplorerShadowHandler',
  'getExplorerContentHandler',
] as const;
