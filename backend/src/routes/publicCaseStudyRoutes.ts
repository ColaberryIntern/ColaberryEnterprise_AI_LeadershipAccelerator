/**
 * Case Study OS - the PUBLIC read API (spec §19). T014.
 *
 * MOUNT ORDER IS LOAD BEARING. This router MUST be registered in `server.ts`
 * ABOVE `app.use(adminRoutes)` (server.ts:151). `adminRoutes` is mounted with no
 * path prefix and chains sub-routers that call `router.use(requireAdmin)` with
 * no path scope, so anything mounted BELOW it never gets the request: the first
 * unscoped admin guard answers 401 first. A public endpoint that returns 401 to
 * anonymous traffic is not a 404 you can debug - it is a page that silently
 * stops existing. That exact shape shipped once already on the strategy-call
 * booking flow (server.ts:139-146 carries the note). `publicCaseStudyRoutes`
 * therefore belongs in the public block at server.ts:147-149, and
 * `publicCaseStudyRoutes.mount.test.ts` fails loudly if it is ever moved below.
 *
 * WHAT THIS ROUTER MAY RETURN. Only `PublicCaseStudySummary` and
 * `PublicCaseStudyDetail`, built by `caseStudyPublicProjection.ts` - an explicit
 * allow-list, not a filtered snapshot. `publicPortfolioRoutes.ts` is the model
 * for the ROUTE SHAPE here (absolute path inside `router.get`, flat `app.use`
 * mount, service imported inside the handler, uniform 404, generic 500) and is
 * deliberately NOT the model for sanitisation: it returns raw JSONB and filters
 * client-side, which is a rendering decision rather than a security boundary.
 *
 * IT NEVER CALLS GITHUB. Spec §6.4. Content comes from the approved snapshot
 * pinned by `case_study_publications.published_snapshot_id` and from nowhere
 * else - there is no analyzer import, no repo reader import, and no `fetch` in
 * this file or in the two modules it uses.
 *
 * UNIFORM 404. `NOT_FOUND_BODY` is the single 404 payload in this file. "No such
 * slug" and "published, but not on this surface" return byte-identical
 * responses, so the difference cannot be probed one slug at a time.
 *
 * FAILURE-FIRST. (1) A read failure returns a generic 500 whose body never
 * carries `err.message`, and logs an `error_class` with no message, no row and
 * no identifier. (2) No retry - a public GET is cheap to repeat and retrying
 * here would amplify an outage. (3) Recovery: the caller retries.
 * (4) Handled: malformed filters, an unknown slug, an unknown collection, a
 * wrong-surface record, a flood, a database failure. Not handled: nothing that
 * reaches the client as anything other than 400, 404, 429 or 500.
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { ensureTraceId } from '../utils/requestContext';
import {
  DEFAULT_PAGE_SIZE,
  buildCaseStudyLedger,
  buildCaseStudyTaxonomy,
  getCaseStudySurfaceProfile,
  isCandidatePubliclyVisible,
  mergeCaseStudyFilters,
  runCaseStudyQuery,
  sanitizeFiltersForAudience,
} from '../services/caseStudy/caseStudyFilterService';
import { projectPublicDetail, projectPublicSummary } from '../services/caseStudy/caseStudyPublicProjection';
import { surfaceView } from '../services/caseStudy/caseStudySurfaceView';
import {
  PUBLIC_SLUG,
  PublicCaseStudyListQuery,
  toPublicFilterInput,
} from '../schemas/publicCaseStudySchema';
import type { CaseStudySurfaceKey } from '../types/caseStudy';
import type {
  CaseStudyFilterInput,
  CaseStudySortKey,
} from '../types/caseStudyFilters';
import type { CaseStudyLedger } from '../services/caseStudy/caseStudyFilterService';
import type { PublishedCaseStudyRecord } from '../services/caseStudy/caseStudyPublicStore';
import type {
  PublicCaseStudyDetail,
  PublicCaseStudySummary,
  PublicCaseStudyTaxonomyFacets,
} from '../types/caseStudyPublic';

const router = Router();

/* ------------------------------------------------------------ constants --- */

/** THE ONLY 404 BODY IN THIS FILE. Byte-identical for every kind of miss. */
const NOT_FOUND_BODY = Object.freeze({ error: 'Not found' });

/** Generic. It never carries `err.message`, a row, an id or a query. */
const SERVER_ERROR_BODY = Object.freeze({ error: 'Unable to load case studies' });

/**
 * Requests per minute per IP across all four endpoints. Env-configurable so the
 * limit is config rather than a literal, and so the suite can prove a 429
 * without sending 240 requests.
 */
const RATE_LIMIT_MAX = Math.max(
  Number.parseInt(process.env.PUBLIC_CASE_STUDY_RATE_LIMIT || '240', 10) || 240,
  1,
);

const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: 'Too many requests' });
  },
});

// PATH-SCOPED GUARDS. NEVER a bare `router.use(publicReadLimiter)`: sub-routers
// mount without a path prefix in this app, so an unscoped middleware rate-limits
// unrelated traffic on every route registered after it. That has caused two
// production outages here (see explorerSignalRoutes.ts, same warning).
router.use('/api/public/case-studies', publicReadLimiter);
router.use('/api/public/case-study-taxonomy', publicReadLimiter);
router.use('/api/public/case-study-collections', publicReadLimiter);

/* --------------------------------------------------------------- surface --- */

/**
 * Phase 1 resolves every public request to `enterprise`.
 *
 * It is a FUNCTION rather than a constant on purpose: spec §31 requires one
 * filter engine serving the public index, the admin preview, saved collections
 * and a future Training renderer, and that only stays true while the surface is
 * a parameter. Adding Training is an edit to this resolver plus a publication
 * row - nothing downstream of here names a surface.
 */
export function resolveRequestSurface(_req: Request): CaseStudySurfaceKey {
  return 'enterprise';
}

/**
 * `PublicSurfaceView` and `surfaceView()` MOVED to
 * `services/caseStudy/caseStudySurfaceView.ts` and are re-exported here so
 * every existing importer keeps its import path.
 *
 * They left because the admin surface-lens lab needs the identical object, and
 * importing this route module from a service would close a routes → services →
 * routes cycle and execute router construction inside a service's import graph.
 * The helper is unchanged; only its address is.
 */
// PRE-EXISTING TYPE ERROR, fixed 2026-08-26. `export type { X } from '...'` is a
// re-export ONLY: it publishes the name to importers and does NOT bind it in
// this module's scope, so the three `readonly surface: PublicSurfaceView`
// declarations below were TS2304 "Cannot find name". The import binds it; the
// re-export keeps every existing importer working.
import type { PublicSurfaceView } from '../services/caseStudy/caseStudySurfaceView';

export type { PublicSurfaceView } from '../services/caseStudy/caseStudySurfaceView';

/* ------------------------------------------------------------- responses --- */

export interface PublicCaseStudyListResponse {
  readonly surface: PublicSurfaceView;
  readonly collection: { readonly slug: string; readonly title: string; readonly description: string | null } | null;
  readonly items: readonly PublicCaseStudySummary[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly hasMore: boolean;
  readonly ledger: CaseStudyLedger;
}

export interface PublicCaseStudyDetailResponse {
  readonly surface: PublicSurfaceView;
  readonly caseStudy: PublicCaseStudyDetail;
}

export interface PublicCaseStudyTaxonomyResponse {
  readonly surface: PublicSurfaceView;
  readonly facets: PublicCaseStudyTaxonomyFacets;
}

/* ------------------------------------------------------------- plumbing --- */

/** Structured, and deliberately minimal: an error CLASS, never a message. */
function log(event: string, outcome: 'success' | 'failure', correlationId: string,
  context: Record<string, string | number | boolean>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'public-case-study-api',
    event,
    correlation_id: correlationId,
    outcome,
    context,
  }));
}

/**
 * A stable class, never `Error`. The MESSAGE is never logged and never returned:
 * a Sequelize error message can quote row values, and a row here can carry an
 * organisation name or a private repository identity.
 */
function errorClass(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (typeof name !== 'string' || name.length === 0) return 'UnknownError';
  if (name.startsWith('SequelizeConnection') || name === 'SequelizeHostNotFoundError') {
    return 'UpstreamUnavailable';
  }
  return name === 'Error' ? 'UnknownError' : name;
}

function serverError(res: Response, event: string, correlationId: string, err: unknown): void {
  log(event, 'failure', correlationId, { error_class: errorClass(err) });
  res.status(500).json(SERVER_ERROR_BODY);
}

const notFound = (res: Response): void => { res.status(404).json(NOT_FOUND_BODY); };

const project = (
  records: readonly PublishedCaseStudyRecord[], surfaceKey: CaseStudySurfaceKey,
): PublicCaseStudySummary[] => records.map((r) => projectPublicSummary({
  surfaceKey, slug: r.candidate.slug, content: r.content,
  publication: r.publication, canonicalBaseUrl: env.publicAppUrl,
}));

/**
 * The one list pipeline, shared by the index and by a saved collection, so a
 * curated path can never show something the index would hide.
 */
async function respondWithList(
  req: Request, res: Response, collectionSlug: string | null, event: string,
): Promise<void> {
  const correlationId = ensureTraceId(req.get('X-Correlation-ID'));
  const parsed = PublicCaseStudyListQuery.safeParse(req.query);
  if (!parsed.success) {
    // Name the offending PARAMETER, never the accepted vocabulary.
    //
    // Echoing raw Zod issues here published every enum this API knows —
    // including `ai_flotation_team`, a surface that has not launched. A public
    // 400 needs to tell a caller which parameter it got wrong; it does not need
    // to hand an enumeration of the platform's internal taxonomy to anyone who
    // sends a junk value. Admins get the full issue list on the admin routes,
    // where the audience is authenticated.
    res.status(400).json({
      error: 'invalid filters',
      invalidParameters: [...new Set(
        parsed.error.issues
          .map((issue) => String(issue.path[0] ?? ''))
          .filter((name) => name.length > 0),
      )].sort(),
    });
    return;
  }
  const surfaceKey = resolveRequestSurface(req);
  const profile = getCaseStudySurfaceProfile(surfaceKey);
  const slug = collectionSlug ?? parsed.data.collection ?? null;

  try {
    const store = await import('../services/caseStudy/caseStudyPublicStore');
    let base: CaseStudyFilterInput = profile.defaultFilters;
    let sort: CaseStudySortKey = profile.defaultSort;
    let meta: PublicCaseStudyListResponse['collection'] = null;

    if (slug) {
      if (!PUBLIC_SLUG.test(slug)) { notFound(res); return; }
      const saved = await store.loadPublishedCollection(slug, surfaceKey);
      // A missing collection is a 404, never an ignored filter: ignoring it would
      // silently return the whole surface under a curated path's name.
      if (!saved) { notFound(res); return; }
      base = mergeCaseStudyFilters(profile.defaultFilters, saved.filters);
      sort = saved.sort;
      meta = { slug: saved.slug, title: saved.title, description: saved.description };
    }

    const records = await store.loadSurfacePublications(surfaceKey);
    const visible = records.filter((r) => isCandidatePubliclyVisible(r.candidate, surfaceKey));
    const filters = sanitizeFiltersForAudience(
      { ...mergeCaseStudyFilters(base, toPublicFilterInput(parsed.data)), surface: surfaceKey },
      'public',
    );
    const paged = runCaseStudyQuery(visible.map((r) => r.candidate), {
      filters,
      sort: parsed.data.sort ? (parsed.data.sort as CaseStudySortKey) : sort,
      page: parsed.data.page ?? 1,
      limit: parsed.data.limit ?? DEFAULT_PAGE_SIZE,
    });
    const bySlug = new Map(visible.map((r) => [r.candidate.slug, r] as [string, PublishedCaseStudyRecord]));
    const page: PublishedCaseStudyRecord[] = [];
    for (const c of paged.items) {
      const record = bySlug.get(c.slug);
      if (record) page.push(record);
    }

    const body: PublicCaseStudyListResponse = {
      surface: surfaceView(profile),
      collection: meta,
      items: project(page, surfaceKey),
      page: paged.page,
      limit: paged.limit,
      total: paged.total,
      hasMore: paged.hasMore,
      ledger: buildCaseStudyLedger(visible.map((r) => r.candidate)),
    };
    log(event, 'success', correlationId, { surface: surfaceKey, returned: body.items.length });
    res.json(body);
  } catch (err) {
    serverError(res, event, correlationId, err);
  }
}

/* --------------------------------------------------------------- routes --- */

/** GET /api/public/case-studies - the index. Unauthenticated by design. */
router.get('/api/public/case-studies', async (req: Request, res: Response): Promise<void> => {
  await respondWithList(req, res, null, 'public_case_study_list');
});

/**
 * GET /api/public/case-studies/:slug
 *
 * Four different misses - unknown slug, no publication row, a publication on
 * another surface, a pin that does not resolve to an approved snapshot - all
 * return the SAME status and the SAME body, so no sequence of requests can tell
 * "does not exist" from "exists but is not yours to see".
 */
router.get('/api/public/case-studies/:slug', async (req: Request, res: Response): Promise<void> => {
  const correlationId = ensureTraceId(req.get('X-Correlation-ID'));
  const slug = String(req.params.slug ?? '');
  if (!PUBLIC_SLUG.test(slug)) { notFound(res); return; }
  const surfaceKey = resolveRequestSurface(req);
  try {
    const store = await import('../services/caseStudy/caseStudyPublicStore');
    const record = await store.loadPublishedRecordBySlug(slug, surfaceKey);
    if (!record || !isCandidatePubliclyVisible(record.candidate, surfaceKey)) {
      notFound(res);
      return;
    }
    const body: PublicCaseStudyDetailResponse = {
      surface: surfaceView(getCaseStudySurfaceProfile(surfaceKey)),
      caseStudy: projectPublicDetail({
        surfaceKey,
        slug: record.candidate.slug,
        content: record.content,
        publication: record.publication,
        canonicalBaseUrl: env.publicAppUrl,
      }),
    };
    log('public_case_study_detail', 'success', correlationId, { surface: surfaceKey });
    res.json(body);
  } catch (err) {
    serverError(res, 'public_case_study_detail', correlationId, err);
  }
});

/** GET /api/public/case-study-taxonomy - facets derived from what is published. */
router.get('/api/public/case-study-taxonomy', async (req: Request, res: Response): Promise<void> => {
  const correlationId = ensureTraceId(req.get('X-Correlation-ID'));
  const surfaceKey = resolveRequestSurface(req);
  try {
    const store = await import('../services/caseStudy/caseStudyPublicStore');
    const records = await store.loadSurfacePublications(surfaceKey);
    const visible = records
      .map((r) => r.candidate)
      .filter((c) => isCandidatePubliclyVisible(c, surfaceKey));
    const body: PublicCaseStudyTaxonomyResponse = {
      surface: surfaceView(getCaseStudySurfaceProfile(surfaceKey)),
      facets: buildCaseStudyTaxonomy(visible),
    };
    log('public_case_study_taxonomy', 'success', correlationId, { surface: surfaceKey });
    res.json(body);
  } catch (err) {
    serverError(res, 'public_case_study_taxonomy', correlationId, err);
  }
});

/** GET /api/public/case-study-collections/:slug - a saved filter set, rendered. */
router.get(
  '/api/public/case-study-collections/:slug',
  async (req: Request, res: Response): Promise<void> => {
    await respondWithList(req, res, String(req.params.slug ?? ''), 'public_case_study_collection');
  },
);

export default router;
