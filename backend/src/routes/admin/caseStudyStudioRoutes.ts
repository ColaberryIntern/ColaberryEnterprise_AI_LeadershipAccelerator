import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  CaseStudyAdminError, isCaseStudyAdminError,
} from '../../services/caseStudy/caseStudyAdminStore';
import {
  clearStoryline, getStoryline, saveStoryline,
} from '../../services/caseStudy/caseStudyStoryline';
import { proveRepository } from '../../services/caseStudy/caseStudyRepoProof';
import { generateStoryDraft } from '../../services/caseStudy/caseStudyStoryDraftGenerator';
import {
  listDrafts, promoteDraft, proposeDrafts, rejectDraft,
} from '../../services/caseStudy/caseStudyAiDraftStore';
import {
  listArtifacts, setArtifactStatus,
} from '../../services/caseStudy/caseStudyArtifactPromotion';
import {
  listCharts, resolveChart, saveChart, setChartApproval,
} from '../../services/caseStudy/caseStudyChartService';
import {
  createQuote, listQuotes, setQuoteApproval,
} from '../../services/caseStudy/caseStudyQuoteService';
import { CASE_STUDY_CHART_TYPES, CASE_STUDY_QUOTE_SOURCES } from '../../types/caseStudyStory';

/**
 * Story Studio API — the routes the seven-tab authoring surface drives.
 *
 * A SEPARATE ROUTER FROM `caseStudyAdminRoutes.ts`, and not for size alone.
 * That file is the REVIEW desk's API: read a record, correct a field, approve,
 * publish. This one is the AUTHORING surface: direction, analysis, drafting,
 * asset promotion. Keeping them apart means the review desk's route table stays
 * readable as the list of things a reviewer can do, and `caseStudyAdminRoutes`
 * stays at 398 lines rather than crossing the ceiling.
 *
 * EVERY CONVENTION HERE IS COPIED FROM ITS SIBLING DELIBERATELY:
 *
 *   · FULL PATHS including `/api/admin`, because `adminRoutes` mounts children
 *     with `router.use(child)` and no prefix.
 *   · `requireAdmin` ON EVERY ROUTE INDIVIDUALLY. There is no
 *     `router.use(requireAdmin)`: an admin sub-router is mounted with no path
 *     scope, so an unscoped guard would apply to every request reaching
 *     adminRoutes afterwards — which has caused a production outage in this
 *     repo.
 *   · Paths live under `/api/admin/case-studies/...` so `mgmtSectionGate`'s
 *     existing `PATH_SECTION` row (`/api/admin/case-studies` → `program`) covers
 *     them. A new prefix would be deny-by-default for every scoped management
 *     role while legacy admin passed — a surface that half-works and looks fine.
 *   · Zod v4 (`error.issues`, never `.errors`), parsed before any service call.
 *   · THIN AND SILENT: parse → call the service that owns the rule → map the
 *     error. No business logic and no logging, so there is no second, less
 *     careful path that could put an actor's email or a quotation on stdout.
 *
 * NOTHING HERE DECIDES ANYTHING ABOUT TRUTH. No route in this file publishes,
 * approves a snapshot, or writes to `case_study_snapshots.content` except by
 * calling `promoteDraft`, which requires a named human actor and goes through
 * `applyHumanOverride`.
 */

const router = Router();

const uuid = z.uuid();
const idParams = z.object({ id: uuid });

const storylineBody = z.object({
  text: z.string().trim().min(1).max(4000),
}).strict();

const analyzeBody = z.object({
  // GitHub's own limits. Not a guess: owner ≤ 39, repo ≤ 100.
  owner: z.string().trim().min(1).max(39),
  repo: z.string().trim().min(1).max(100),
}).strict();

const generateBody = z.object({
  repositories: z.array(analyzeBody).min(1).max(5),
}).strict();

const draftParams = z.object({ id: uuid, draftId: uuid });

const artifactBody = z.object({
  status: z.enum(['candidate', 'approved', 'rejected']),
  visibility: z.enum(['public', 'request_only', 'private']),
}).strict();

/**
 * `.strict()` IS LOAD-BEARING ON THIS ONE, not stylistic.
 *
 * A chart may never carry its own numbers. `CaseStudyChartSpec` has no values
 * field and `case_study_charts` has no values column, and `.strict()` is the
 * third of the four independent layers: a request carrying `values` is a 400
 * naming the key, rather than a silently ignored property that leaves the
 * sender believing the chart holds data it does not.
 */
const chartBody = z.object({
  chartId: uuid.optional(),
  chartType: z.enum(CASE_STUDY_CHART_TYPES),
  title: z.string().trim().min(1).max(255),
  caption: z.string().trim().max(2000).nullable().optional(),
  metricKeys: z.array(z.string().trim().min(1).max(120)).max(8),
}).strict();

const chartApprovalBody = z.object({ approved: z.boolean() }).strict();

const attributionBody = z.discriminatedUnion('displayMode', [
  z.object({
    displayMode: z.literal('named'),
    displayName: z.string().trim().min(1).max(255),
    role: z.string().trim().min(1).max(255),
    kind: z.string().trim().min(1).max(40),
    // REQUIRED on this branch and absent from the other two. The union is the
    // consent rule: "named without consent" has no shape to occupy, so a
    // request expressing it fails at the schema and never reaches a service.
    consentRecordedAt: z.iso.datetime(),
  }).strict(),
  z.object({
    displayMode: z.literal('role_only'),
    role: z.string().trim().min(1).max(255),
    kind: z.string().trim().min(1).max(40),
  }).strict(),
  z.object({
    displayMode: z.literal('anonymous'),
    kind: z.string().trim().min(1).max(40),
  }).strict(),
]);

const quoteBody = z.object({
  text: z.string().trim().min(1).max(1000),
  attribution: attributionBody,
  source: z.enum(CASE_STUDY_QUOTE_SOURCES),
}).strict();

const quoteApprovalBody = z.object({
  approved: z.boolean(),
  verificationClass: z.enum(['verified', 'anonymized', 'illustrative', 'pending']).optional(),
}).strict();

/** Zod v4: `error.issues`. Never `.errors` — that property does not exist. */
function parse<T>(schema: z.ZodType<T>, value: unknown, res: Response): T | null {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  res.status(400).json({
    error: 'Invalid Story Studio request',
    error_class: 'ValidationError',
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
  return null;
}

function sendError(res: Response, err: unknown): void {
  if (isCaseStudyAdminError(err)) {
    res.status(err.http_status).json({
      error: err.message, error_class: err.error_class, ...err.details,
    });
    return;
  }
  res.status(500).json({ error: 'Story Studio request failed', error_class: 'InternalError' });
}

function run<T>(res: Response, work: () => Promise<T>): Promise<void> {
  return work().then((payload) => { res.json(payload); }).catch((err) => { sendError(res, err); });
}

/**
 * Written to provenance and to `decided_by`. Never logged here.
 *
 * IT REFUSES RATHER THAN INVENTS. The previous version ended `|| 'admin'`, and
 * that literal was the whole gap between this file's header — "promoteDraft…
 * requires a named human actor" — and what was actually enforced.
 * `requireAdmin` checks `role` and nothing else: it never requires `sub` or
 * `email` to be present, so a token carrying neither passed the guard, and
 * `promoteDraft`'s own check is `actor.trim().length === 0`, which the string
 * `'admin'` satisfies. An AI-drafted value could therefore be promoted into
 * snapshot content, and the provenance entry that is supposed to say WHO took
 * responsibility for it would say `admin` — which names nobody.
 *
 * That is worse than an error, because it is an audit trail that reads as
 * complete. The quarantine model in `caseStudyAiDraftStore.ts` rests entirely
 * on "a named human is accountable for this value"; a default actor is that
 * claim with the name removed. So an unattributable caller is refused here, at
 * the boundary, in the same fail-closed direction as every other rule in this
 * subsystem.
 */
const actorOf = (req: Request): string => {
  const actor = (req.admin?.email || req.admin?.sub || '').trim();
  if (!actor) {
    throw new CaseStudyAdminError('ValidationError',
      'This action is recorded against the person who took it, and your session carries no identity. Sign in again.',
      { field: 'actor' });
  }
  return actor;
};

const correlationOf = (req: Request): string | undefined => {
  const header = req.header('x-correlation-id');
  return typeof header === 'string' && header.length > 0 && header.length <= 200
    ? header : undefined;
};

/* ─────────────────────────────────────────── step 1 — the storyline ──── */

/** Read the editorial direction. Null when nobody has written one. */
router.get('/api/admin/case-studies/:id/storyline', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  void run(res, async () => ({ storyline: await getStoryline(params.id) }));
});

/**
 * Write the direction. IDEMPOTENT — the table's primary key is
 * `case_study_id`, so saving twice leaves one row.
 */
router.put('/api/admin/case-studies/:id/storyline', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  const body = parse(storylineBody, req.body, res);
  if (!body) return;
  void run(res, async () => ({
    storyline: await saveStoryline({
      caseStudyId: params.id, text: body.text, actor: actorOf(req),
    }),
  }));
});

router.delete('/api/admin/case-studies/:id/storyline', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  void run(res, () => clearStoryline(params.id));
});

/* ──────────────────────────────────────────── step 3 — the analysis ──── */

/**
 * Analyse one repository and report BOTH halves — what it proves and what it
 * structurally cannot.
 *
 * A POST rather than a GET despite being a read, because it performs bounded
 * outbound GitHub requests and carries a body of two identifiers. It writes
 * nothing: `analyzeRepository` imports no model and touches no database.
 */
router.post('/api/admin/case-studies/:id/analyze', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  const body = parse(analyzeBody, req.body, res);
  if (!body) return;
  void run(res, async () => ({
    proof: await proveRepository({
      owner: body.owner, repo: body.repo, ...(correlationOf(req) ? { correlationId: correlationOf(req) } : {}),
    }),
  }));
});

/* ────────────────────────────────── step 4 — generate a story draft ──── */

/**
 * Generate proposals and QUARANTINE them.
 *
 * The response carries what was stored AND what was refused, both from the
 * generator's allowlist and from the store's forbidden-class screen. A refusal
 * is a result an operator should see, not a silence.
 *
 * Nothing this route does can reach a public page. The values land in
 * `case_study_ai_drafts`; snapshot content is untouched.
 */
router.post('/api/admin/case-studies/:id/story-draft', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  const body = parse(generateBody, req.body, res);
  if (!body) return;

  void run(res, async () => {
    const storyline = await getStoryline(params.id);
    const proofs = [];
    for (const ref of body.repositories) {
      proofs.push(await proveRepository({ owner: ref.owner, repo: ref.repo }));
    }
    const generated = await generateStoryDraft({
      recordTitle: 'this Case Study',
      storyline: storyline ? storyline.text : null,
      proofs,
    });
    const stored = await proposeDrafts({
      caseStudyId: params.id,
      proposals: generated.proposals,
      generatedBy: generated.generatedBy,
    });
    return {
      generatedBy: generated.generatedBy,
      drafts: stored.stored,
      refused: [...generated.refused, ...stored.refused],
    };
  });
});

/** Every proposal, decided history included. */
router.get('/api/admin/case-studies/:id/story-drafts', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  void run(res, async () => ({ drafts: await listDrafts(params.id) }));
});

/**
 * PROMOTE — the one route in this file that writes into snapshot content.
 *
 * `actorOf(req)` is passed as the human taking responsibility, and
 * `promoteDraft` refuses without one. The value lands via `applyHumanOverride`
 * carrying tier `human_override` and this person's name, as a NEW DRAFT
 * SNAPSHOT VERSION — so an already-approved published snapshot is untouched.
 */
router.post('/api/admin/case-studies/:id/story-drafts/:draftId/promote', requireAdmin, (req: Request, res: Response) => {
  const params = parse(draftParams, req.params, res);
  if (!params) return;
  // `async` so that a refusal from `actorOf` becomes a rejected promise `run`
  // can map, rather than a synchronous throw Express would turn into a bare 500.
  void run(res, async () => promoteDraft({
    caseStudyId: params.id,
    draftId: params.draftId,
    actor: actorOf(req),
    ...(correlationOf(req) ? { correlationId: correlationOf(req) } : {}),
  }));
});

router.post('/api/admin/case-studies/:id/story-drafts/:draftId/reject', requireAdmin, (req: Request, res: Response) => {
  const params = parse(draftParams, req.params, res);
  if (!params) return;
  void run(res, async () => ({
    draft: await rejectDraft({
      caseStudyId: params.id, draftId: params.draftId, actor: actorOf(req),
    }),
  }));
});

/* ──────────────────────────────────── visuals — artifacts and charts ──── */

router.get('/api/admin/case-studies/:id/artifacts', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  void run(res, async () => ({ artifacts: await listArtifacts(params.id) }));
});

/**
 * D-0: the artifact promotion path. Before this route existed, no application
 * code could move an artifact off `candidate`, so the entire hero, carousel and
 * figure surface could not populate at all.
 *
 * IDEMPOTENT: promoting the same artifact twice returns `outcome: 'unchanged'`
 * and writes nothing the second time.
 */
router.patch('/api/admin/case-studies/:id/artifacts/:artifactId', requireAdmin, (req: Request, res: Response) => {
  const params = parse(z.object({ id: uuid, artifactId: uuid }), req.params, res);
  if (!params) return;
  const body = parse(artifactBody, req.body, res);
  if (!body) return;
  // `async` for the same reason as the promote route above.
  void run(res, async () => setArtifactStatus({
    caseStudyId: params.id,
    artifactId: params.artifactId,
    status: body.status,
    visibility: body.visibility,
    actor: actorOf(req),
  }));
});

/** Charts, each with what it actually resolves to and what it silently omits. */
router.get('/api/admin/case-studies/:id/charts', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  void run(res, async () => {
    const charts = await listCharts(params.id);
    const resolutions = [];
    for (const chart of charts) resolutions.push(await resolveChart(chart));
    return { charts: resolutions };
  });
});

router.put('/api/admin/case-studies/:id/charts', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  const body = parse(chartBody, req.body, res);
  if (!body) return;
  void run(res, async () => ({
    chart: await saveChart({
      caseStudyId: params.id,
      ...(body.chartId ? { chartId: body.chartId } : {}),
      chartType: body.chartType,
      title: body.title,
      caption: body.caption ?? null,
      metricKeys: body.metricKeys,
    }),
  }));
});

router.post('/api/admin/case-studies/:id/charts/:chartId/approval', requireAdmin, (req: Request, res: Response) => {
  const params = parse(z.object({ id: uuid, chartId: uuid }), req.params, res);
  if (!params) return;
  const body = parse(chartApprovalBody, req.body, res);
  if (!body) return;
  void run(res, async () => ({
    chart: await setChartApproval({
      caseStudyId: params.id, chartId: params.chartId, approved: body.approved,
    }),
  }));
});

/* ─────────────────────────────────────────────────────────── quotes ──── */

router.get('/api/admin/case-studies/:id/quotes', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  void run(res, async () => ({ quotes: await listQuotes(params.id) }));
});

/**
 * Record a quotation a HUMAN obtained. There is no generate route for quotes
 * anywhere in this file, and adding one would be the single most dangerous
 * change available in this subsystem.
 */
router.post('/api/admin/case-studies/:id/quotes', requireAdmin, (req: Request, res: Response) => {
  const params = parse(idParams, req.params, res);
  if (!params) return;
  const body = parse(quoteBody, req.body, res);
  if (!body) return;
  void run(res, async () => ({
    quote: await createQuote({
      caseStudyId: params.id,
      text: body.text,
      attribution: body.attribution as never,
      source: body.source,
      actor: actorOf(req),
    }),
  }));
});

router.post('/api/admin/case-studies/:id/quotes/:quoteId/approval', requireAdmin, (req: Request, res: Response) => {
  const params = parse(z.object({ id: uuid, quoteId: uuid }), req.params, res);
  if (!params) return;
  const body = parse(quoteApprovalBody, req.body, res);
  if (!body) return;
  void run(res, async () => ({
    quote: await setQuoteApproval({
      caseStudyId: params.id,
      quoteId: params.quoteId,
      approved: body.approved,
      ...(body.verificationClass ? { verificationClass: body.verificationClass } : {}),
      actor: actorOf(req),
    }),
  }));
});

export default router;
export { CaseStudyAdminError };
