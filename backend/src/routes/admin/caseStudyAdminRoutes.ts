import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { CASE_STUDY_SURFACE_KEYS } from '../../types/caseStudy';
import {
  CASE_STUDY_REPO_ROLES, attachRepository, isCaseStudyRepoError, listRepositories,
  removeRepository, setRepositoryRole, setRepositoryPathScope,
} from '../../services/caseStudy/caseStudyRepoCollection';
import { MAX_SCOPE_PREFIXES } from '../../services/caseStudy/repoPathScope';
import {
  archiveCaseStudy, createCaseStudyFromProject, createCaseStudyFromRepoCollection,
  getCaseStudy, isCaseStudyAdminError, listCaseStudies, updateCaseStudy,
} from '../../services/caseStudy/caseStudyAdminService';
import {
  applyHumanOverride, approveSnapshot, listSyncRuns, previewSurfaceProjection,
} from '../../services/caseStudy/caseStudyAdminReview';
import { isCaseStudySyncError, syncCaseStudy } from '../../services/caseStudy/caseStudySyncService';
import {
  isCaseStudyPublicationError, publishCaseStudy, unpublishCaseStudy,
} from '../../services/caseStudy/caseStudyPublicationService';
import { isCaseStudyProjectSourceError } from '../../services/caseStudy/caseStudyProjectSource';
import { isCaseStudyEvidenceSourceError } from '../../services/caseStudy/caseStudyEvidenceSource';

/**
 * Admin Case Study API — spec §20, the human-in-the-loop surface for the Case
 * Study OS.
 *
 * PATH PREFIX. Every route declares the FULL path including `/api/admin`,
 * because `adminRoutes` mounts its children with `router.use(child)` and NO
 * prefix — every sibling file does the same. See `organizationRoutes.ts`'s
 * header for the outage this prevents, and the part that matters: **a 401 does
 * not prove a route is mounted**, because anything under `/api/` reaches
 * adminRoutes and is rejected by the first `requireAdmin` it meets.
 * `caseStudyAdminRoutes.paths.test.ts` reads `router.stack` for that reason.
 *
 * `requireAdmin` IS ON EVERY ROUTE, INDIVIDUALLY. There is deliberately no
 * `router.use(requireAdmin)` here: an admin sub-router is mounted with no path
 * scope, so an unscoped `router.use` guard applies to every request that reaches
 * adminRoutes afterwards, including other routers' paths. That has caused a
 * production outage in this repo.
 *
 * SECTION RBAC. `mgmtSectionGate`'s `PATH_SECTION` table maps
 * `/api/admin/case-studies` → `program`, the section `/api/admin/projects`
 * already carries. Without that row the gate is deny-by-default for scoped
 * management roles: legacy admin and mgmt `owner`/`admin` pass while every
 * curriculum/revenue/admissions/support token 403s on every call — a surface
 * that half-works and looks fine. `caseStudyAdminRoutes.access.test.ts` proves a
 * scoped `curriculum` token actually reaches a route.
 *
 * VALIDATION. Zod v4 (`error.issues`, never `.errors`), inline at each route —
 * there is no validation middleware in this codebase. Every body, query and
 * route param is parsed BEFORE any service is called. The services validate
 * again; that duplication is intentional, because a service is also reachable
 * from a script and must not trust its caller.
 *
 * THIN, AND SILENT. Every handler is parse → call the service that owns the
 * capability → map the error; no business logic and no logging live here, so
 * there is no second, less careful log path that could put an actor's email or a
 * private repo name on stdout (every service emits its own structured line in
 * `artifactRepoSync.ts:92-102`'s shape, with repo identities routed through
 * `repoLogIdentity`). In particular this file makes no publish decision:
 * `caseStudyPublicationService` is the sole authority, and its named blockers go
 * to the client VERBATIM so an admin can act on them.
 *
 * FAILURE-FIRST. (1) Every failure becomes a status + `error_class` + a sentence
 * naming the field; nothing is swallowed. (2) No retries at this layer — a retry
 * is the admin clicking again, which is safe because sync, publish, unpublish,
 * approve and snapshot persistence are each idempotent in their own service.
 * (3) Recovery is the returned message. (4) Not handled: an untagged error,
 * which becomes a 500 carrying no upstream detail.
 */
const router = Router();

/* ─────────────────────────────────────────────────────────────── schemas ──── */

const uuid = z.uuid();
const idParams = z.object({ id: uuid });
const repoParams = z.object({ id: uuid, repositoryId: uuid });
const snapshotParams = z.object({ id: uuid, snapshotId: uuid });

/** Query strings arrive as text. `z.coerce.boolean()` is NOT used: it reads the
 *  string "false" as true, which would silently invert a filter. */
const flag = z.enum(['true', 'false']).transform((v) => v === 'true');
const count = z.coerce.number().int();

const listQuery = z.object({
  status: z.enum(['draft', 'review', 'approved', 'published', 'archived']).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  industry: z.string().trim().min(1).max(120).optional(),
  projectId: uuid.optional(),
  includeArchived: flag.optional(),
  limit: count.min(1).max(100).optional(),
  offset: count.min(0).optional(),
});

const surfaceKey = z.enum(CASE_STUDY_SURFACE_KEYS);
const slug = z.string().trim().min(1).max(160);
const title = z.string().trim().min(1).max(300);

const fromProjectBody = z.object({ projectId: uuid, title: title.optional(), slug: slug.optional() });
const fromReposBody = z.object({
  title, slug: slug.optional(),
  repositories: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
});

const updateBody = z.object({
  title: title.optional(),
  slug: slug.optional(),
  status: z.enum(['draft', 'review', 'approved', 'archived']).optional(),
  canonicalSummary: z.string().trim().max(8000).nullable().optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  primaryCapability: z.string().trim().max(120).nullable().optional(),
  programKey: z.string().trim().max(80).nullable().optional(),
  builtByType: z.string().trim().max(40).nullable().optional(),
  visibility: z.enum(['public', 'anonymized', 'private']).optional(),
  organizationDisplayName: z.string().trim().max(255).nullable().optional(),
  organizationIsAnonymized: z.boolean().optional(),
  organizationIdentityMode: z.enum(['named', 'anonymized', 'hidden']).optional(),
  organizationNamingConsent: z.boolean().optional(),
  builderIdentityMode: z.enum(['named', 'role_only', 'anonymous']).optional(),
  builderNamingConsent: z.boolean().optional(),
}).refine((p) => Object.keys(p).length > 0, { message: 'supply at least one field to change' });

/**
 * Path prefixes, bounded on both axes and trimmed at the edge. `[]` is
 * deliberately ACCEPTED rather than rejected as empty: on a PATCH it is how an
 * admin clears a scope and returns the repository to describing all of itself.
 */
const pathScope = z.array(z.string().trim().min(1).max(500)).max(MAX_SCOPE_PREFIXES);

const attachBody = z.object({
  reference: z.string().trim().min(1).max(500),
  role: z.enum(CASE_STUDY_REPO_ROLES).optional(),
  visibility: z.enum(['public', 'private', 'unknown']).optional(),
  allowPublicRepoLink: z.boolean().optional(),
  projectId: uuid.nullable().optional(),
  githubConnectionId: uuid.nullable().optional(),
  pathScope: pathScope.optional(),
});

/**
 * A PATCH may carry the role, the scope, or both — but not neither. The
 * `.refine` is the load-bearing line: without it an empty body is a valid
 * request that silently changes nothing and answers 200, which reads to an
 * admin as "saved".
 */
const repoPatchBody = z.object({
  role: z.enum(CASE_STUDY_REPO_ROLES).optional(),
  pathScope: pathScope.optional(),
}).refine(
  (b) => b.role !== undefined || b.pathScope !== undefined,
  { message: 'provide role, pathScope, or both' },
);
const TRIGGERS = ['manual', 'webhook', 'reconciliation', 'project_update'] as const;
const syncBody = z.object({ trigger: z.enum(TRIGGERS).optional() });
const syncRunsQuery = z.object({ limit: count.min(1).max(100).optional(), offset: count.min(0).optional() });
const overrideBody = z.object({
  path: z.string().trim().min(1).max(300), value: z.unknown(),
  note: z.string().trim().min(1).max(500).optional(),
});
const previewQuery = z.object({ surfaceKey: surfaceKey.optional(), snapshotId: uuid.optional() });
const publishBody = z.object({ surfaceKey: surfaceKey.optional(), snapshotId: uuid.optional() });
const unpublishBody = z.object({ surfaceKey: surfaceKey.optional() });

/* ───────────────────────────────────────────────────────────── plumbing ──── */

/** The one surface an admin is publishing to in Phase 1 (spec §7.9). */
const DEFAULT_SURFACE = 'enterprise' as const;

/** Parse, or answer 400 and return null — the caller returns immediately on
 *  null, which is what keeps a malformed request from reaching a service at
 *  all. Zod v4: `error.issues`; `.errors` was removed in v4 and reads undefined. */
function parse<S extends z.ZodType>(schema: S, value: unknown, res: Response): z.infer<S> | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  res.status(400).json({
    error: 'Invalid request',
    error_class: 'ValidationError',
    issues: parsed.error.issues.map((i) => ({
      path: i.path.join('.') || '(root)', message: i.message,
    })),
  });
  return null;
}

/** A tagged service error: `error_class` + `http_status`, the house shape. */
const isTagged = (err: unknown): boolean =>
  isCaseStudyAdminError(err) || isCaseStudyRepoError(err) || isCaseStudySyncError(err)
  || isCaseStudyPublicationError(err) || isCaseStudyProjectSourceError(err)
  || isCaseStudyEvidenceSourceError(err);

/**
 * Map a service error onto a response. A tagged error keeps its own status,
 * `error_class` and message — those messages name a field and its value on
 * purpose. A PUBLISH refusal additionally carries `blockers` VERBATIM (code,
 * field, message, remedy) plus spec §15's `summary` block: an admin told "cannot
 * publish" cannot act, an admin told which metric is pending can. Anything
 * untagged is a bug or an outage — 500, with no upstream detail echoed back.
 */
function sendError(res: Response, err: unknown): void {
  if (isTagged(err)) {
    const tagged = err as { http_status: number; error_class: string; message: string };
    const body: Record<string, unknown> = {
      error: tagged.message, error_class: tagged.error_class,
    };
    if (isCaseStudyPublicationError(err) && err.blockers.length > 0) {
      body.blockers = err.blockers;
      body.summary = err.message;
    }
    res.status(tagged.http_status).json(body);
    return;
  }
  res.status(500).json({ error: 'Case Study request failed', error_class: 'InternalError' });
}

/** Every service call funnels through here, so no route can forget the mapping. */
function run<T>(res: Response, work: () => Promise<T>): Promise<void> {
  return work().then((payload) => { res.json(payload); }).catch((err) => { sendError(res, err); });
}

/** Written to `created_by` / `published_by` / provenance. Never logged here. */
const actorOf = (req: Request): string => req.admin?.email || req.admin?.sub || 'admin';

/** Propagated so one id traces a request through every service it touches. */
function correlationOf(req: Request): string | undefined {
  const header = req.header('x-correlation-id');
  return typeof header === 'string' && header.length > 0 && header.length <= 200
    ? header : undefined;
}

/* ──────────────────────────────────────────────────────────── the routes ──── */

/** List/search candidates. Archived rows are excluded unless asked for. */
router.get('/api/admin/case-studies', requireAdmin, (req: Request, res: Response) => {
  const query = parse(listQuery, req.query, res);
  if (!query) return;
  void run(res, () => listCaseStudies({ ...query, correlationId: correlationOf(req) }));
});

// The create routes are declared BEFORE `/:id`: they are POSTs and `/:id` is a
// GET, so Express would not confuse them today, but whoever adds `POST /:id`
// next would inherit a live bug. The ordering costs nothing.
/** §10.1 — create a candidate from an existing platform Project. */
router.post('/api/admin/case-studies/from-project', requireAdmin, (req: Request, res: Response) => {
  const body = parse(fromProjectBody, req.body, res);
  if (!body) return;
  void run(res, () => createCaseStudyFromProject({
    ...body, actor: actorOf(req), correlationId: correlationOf(req),
  }));
});

/** §10.2 — create a candidate from a pasted set of repository references. */
router.post('/api/admin/case-studies/from-repositories', requireAdmin, (req: Request, res: Response) => {
  const body = parse(fromReposBody, req.body, res);
  if (!body) return;
  void run(res, () => createCaseStudyFromRepoCollection({
    ...body, actor: actorOf(req), correlationId: correlationOf(req),
  }));
});

/** One candidate: repositories, snapshots with provenance, publications, readiness. */
router.get('/api/admin/case-studies/:id', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  void run(res, () => getCaseStudy({
    caseStudyId: params.id, correlationId: correlationOf(req),
  }));
});

/** Edit the human-owned editorial and consent fields (spec §34). */
router.patch('/api/admin/case-studies/:id', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  const patch = parse(updateBody, req.body, res);
  if (!patch) return;
  void run(res, () => updateCaseStudy({
    caseStudyId: params.id, patch, actor: actorOf(req), correlationId: correlationOf(req),
  }));
});

/** Soft-archive (spec §35). Refused with 409 while the record is still published. */
router.post('/api/admin/case-studies/:id/archive', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  void run(res, () => archiveCaseStudy({
    caseStudyId: params.id, actor: actorOf(req), correlationId: correlationOf(req),
  }));
});

/** Every repository this Case Study cites, primary first. */
router.get('/api/admin/case-studies/:id/repositories', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  void run(res, async () => ({
    repositories: await listRepositories({
      caseStudyId: params.id, correlationId: correlationOf(req),
    }),
  }));
});

/** Attach a repo source. The reference parser is Repo Connect's, not a second one. */
router.post('/api/admin/case-studies/:id/repositories', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  const body = parse(attachBody, req.body, res);
  if (!body) return;
  void run(res, () => attachRepository({
    ...body, caseStudyId: params.id, correlationId: correlationOf(req),
  }));
});

/**
 * Update a repo source — its role in the story (§10.2's role vocabulary), the
 * part of it this Case Study is about, or both.
 *
 * Applied in that order when both are sent, because `setRepositoryRole` may
 * DEMOTE another repository to keep the single-primary invariant, and the record
 * returned should be the one that reflects every change the caller asked for.
 */
router.patch('/api/admin/case-studies/:id/repositories/:repositoryId', requireAdmin, (req: Request, res: Response) => {
  const params = parse(repoParams, req.params, res);
  if (!params) return;
  const body = parse(repoPatchBody, req.body, res);
  if (!body) return;
  void run(res, async () => {
    const correlationId = correlationOf(req);
    const target = { caseStudyId: params.id, repositoryId: params.repositoryId, correlationId };
    let record = body.role !== undefined
      ? await setRepositoryRole({ ...target, role: body.role })
      : null;
    if (body.pathScope !== undefined) {
      record = await setRepositoryPathScope({ ...target, pathScope: body.pathScope });
    }
    // `record` cannot be null: the schema's refine guarantees one branch ran.
    return record as NonNullable<typeof record>;
  });
});

/** Detach a repo source. Idempotent: removing one already gone is `removed: false`. */
router.delete('/api/admin/case-studies/:id/repositories/:repositoryId', requireAdmin, (req: Request, res: Response) => {
  const params = parse(repoParams, req.params, res);
  if (!params) return;
  void run(res, () => removeRepository({
    caseStudyId: params.id, repositoryId: params.repositoryId,
    correlationId: correlationOf(req),
  }));
});

/** Sync: analyse the repositories, merge platform facts, build a DRAFT snapshot. */
router.post('/api/admin/case-studies/:id/sync', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  const body = parse(syncBody, req.body ?? {}, res);
  if (!body) return;
  void run(res, () => syncCaseStudy({
    caseStudyId: params.id, trigger: body.trigger ?? 'manual',
    correlationId: correlationOf(req),
  }));
});

/** The append-only sync history — §51's "inspect sync warnings". */
router.get('/api/admin/case-studies/:id/sync-runs', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  const query = parse(syncRunsQuery, req.query, res);
  if (!query) return;
  void run(res, () => listSyncRuns({
    caseStudyId: params.id, ...query, correlationId: correlationOf(req),
  }));
});

/** Apply one human override, as a new snapshot version with `human_override` provenance. */
router.post('/api/admin/case-studies/:id/overrides', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  const body = parse(overrideBody, req.body, res);
  if (!body) return;
  void run(res, () => applyHumanOverride({
    ...body, caseStudyId: params.id, actor: actorOf(req), correlationId: correlationOf(req),
  }));
});

/** Approve one snapshot version. Idempotent; supersedes any earlier approval. */
router.post('/api/admin/case-studies/:id/snapshots/:snapshotId/approve', requireAdmin, (req: Request, res: Response) => {
  const params = parse(snapshotParams, req.params, res);
  if (!params) return;
  void run(res, () => approveSnapshot({
    caseStudyId: params.id, snapshotId: params.snapshotId,
    actor: actorOf(req), correlationId: correlationOf(req),
  }));
});

/** Preview a surface: the snapshot plus the REAL gate decision. Writes nothing. */
router.get('/api/admin/case-studies/:id/preview', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  const query = parse(previewQuery, req.query, res);
  if (!query) return;
  void run(res, () => previewSurfaceProjection({
    caseStudyId: params.id, surfaceKey: query.surfaceKey ?? DEFAULT_SURFACE,
    ...(query.snapshotId ? { snapshotId: query.snapshotId } : {}),
    correlationId: correlationOf(req),
  }));
});

/**
 * Publish. The gate runs inside `publishCaseStudy` on EVERY call, including a
 * repeat publish of a record that is already live, and a refusal comes back as
 * 400 `PublishBlocked` carrying every blocker at once.
 */
router.post('/api/admin/case-studies/:id/publish', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  const body = parse(publishBody, req.body ?? {}, res);
  if (!body) return;
  void run(res, () => publishCaseStudy({
    caseStudyId: params.id, surfaceKey: body.surfaceKey ?? DEFAULT_SURFACE,
    ...(body.snapshotId ? { snapshotId: body.snapshotId } : {}),
    actor: actorOf(req), correlationId: correlationOf(req),
  }));
});

/** Unpublish. Removes public visibility and deletes nothing (spec §35). */
router.post('/api/admin/case-studies/:id/unpublish', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  const body = parse(unpublishBody, req.body ?? {}, res);
  if (!body) return;
  void run(res, () => unpublishCaseStudy({
    caseStudyId: params.id, surfaceKey: body.surfaceKey ?? DEFAULT_SURFACE,
    actor: actorOf(req), correlationId: correlationOf(req),
  }));
});

export default router;
