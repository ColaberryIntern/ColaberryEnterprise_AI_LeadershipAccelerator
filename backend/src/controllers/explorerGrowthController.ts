import { Request, Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import { classifyError } from '../utils/errorClassifier';
import { env } from '../config/env';
import { isExplorerFeatureEnabled } from '../config/explorerGrowthFlags';
import { runDraftRenderBatch } from '../services/explorerGrowth/drafts/runDraftRender';
import {
  contentQuerySchema,
  contentRefreshBodySchema,
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
import { getCampusActivity, getOutreach } from '../services/explorerGrowth/explorerCampusService';
import {
  getDistribution,
  getLearners,
  getSummary,
} from '../services/explorerGrowth/explorerOverviewService';
import {
  getContentHealth,
  getDecisions,
  getShadow,
} from '../services/explorerGrowth/explorerDecisionsService';
import {
  getEligibility,
  getLearnerDecisions,
  getLearnerProfile,
  getLearnerScores,
  getLearnerSignals,
} from '../services/explorerGrowth/explorerLearnerService';
import { getExplorerWhyByDecision } from '../services/explorerGrowth/explorerWhyService';

/**
 * Explorer Growth Command Center — read handlers (spec §27).
 *
 * Thin by contract: validate, call one service, return. No business logic here.
 * Every handler is a GET; Phase A writes nothing.
 *
 * ── NO LEARNER EMAIL REACHES A LOG LINE ─────────────────────────────────────
 * Handlers log the enrollment id and the error class, never the payload. The
 * payload carries `email_normalized` for the admin UI, and an error logger that
 * dumps `req` or the response body would put learner addresses into stdout,
 * where they are retained by the container runtime.
 */

/** 400 with the field-level detail Zod produced. Zod 4 exposes `.issues`. */
function badRequest(res: Response, err: ZodError): void {
  res.status(400).json({
    error: 'Invalid request',
    details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

/**
 * Run a handler with validated params and query.
 *
 * Validation failures are 400 and never reach a service — a malformed learner id
 * that reaches a query becomes `WHERE enrollment_id = 'garbage'`, returns no
 * rows, and gets reported as 404, which is a different claim.
 *
 * A `null` result is 404. Services return null only for "no such learner" or "no
 * such decision", so the distinction between absent and empty stays intact.
 */
function handler<P, Q>(
  paramSchema: ZodType<P> | null,
  querySchema: ZodType<Q> | null,
  run: (params: P, query: Q) => Promise<unknown>,
  notFound = 'Not found',
) {
  return async (req: Request, res: Response): Promise<void> => {
    let params: P;
    let query: Q;
    try {
      params = paramSchema ? paramSchema.parse(req.params) : (undefined as P);
      // Raw `req.query`, deliberately: the schemas parse the strings Express
      // actually delivers, and a pre-parsed value would fail validation.
      query = querySchema ? querySchema.parse(req.query) : (undefined as Q);
    } catch (err) {
      if (err instanceof ZodError) return badRequest(res, err);
      throw err;
    }

    // THE TRY/CATCH IS NOT DEFENSIVE PADDING. Express 4 does not catch a
    // rejected promise from an async handler: the rejection escapes to the
    // process, `app.use(errorHandler)` is never reached, and no response is ever
    // sent — the caller hangs until it times out.
    //
    // Worse than the hung request: production runs Node with the default
    // `--unhandled-rejections=throw` and registers no `unhandledRejection`
    // listener, so ONE rejected query here — a connection blip, a statement
    // timeout — kills the whole backend container, not just this request. The
    // container restarts, so the symptom is a brief total outage traced to an
    // admin page nobody was looking at.
    //
    // This repo has already paid for that lesson and wrote it down:
    // `db/ensureExplorerCampaignKeyIndex.ts` — "no `unhandledRejection`
    // handler. A throwing index creation therefore means the backend never
    // binds its port." The sibling `routes/admin/caseStudyMetricRoutes.ts`
    // wraps every service call for the same reason.
    try {
      const result = await run(params, query);
      if (result === null) {
        res.status(404).json({ error: notFound });
        return;
      }
      res.json(result);
    } catch (err) {
      // Classified, per the Observability contract: a bare `Error` in a log line
      // is not an acceptable classification. The message is logged, the payload
      // is not — it carries learner emails.
      const errorClass = classifyError(err);
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'explorer-growth-command-center',
          event: 'command_center_read_failed',
          error_class: errorClass,
          outcome: 'failure',
          path: req.path,
          message: (err as { message?: string })?.message?.slice(0, 200) ?? null,
        }),
      );
      res.status(500).json({ error: 'Command Center read failed', error_class: errorClass });
    }
  };
}

// ─── The one write (Phase 2) ────────────────────────────────────────────────

/**
 * `POST /content/refresh` — re-run the draft render for a date.
 *
 * ── WHY THIS IS NOT BUILT ON `handler()` ABOVE ──────────────────────────────
 *
 * That wrapper validates params and query and treats every failure the same way,
 * which is right for fourteen reads. A write needs three things it does not do:
 * a BODY schema, a 403 when the feature is dark, and a log line that says a write
 * was attempted. Bending the read wrapper to cover all three would make every
 * read carry a write's semantics — so this is its own function, and it is the only
 * one of its kind in this file.
 *
 * ── THE FLAG CHECK IS A REFUSAL, NOT A NO-OP ────────────────────────────────
 *
 * Read through `isExplorerFeatureEnabled`, so BOTH the master switch and
 * `draftRender` must be on — the same sanctioned read the cron uses, never the raw
 * sub-flag. When it is off this answers 403 rather than running and reporting
 * zero: a button that returns "0 drafts written" from a disabled feature is
 * indistinguishable from one that found nothing to do, and those need opposite
 * actions from whoever pressed it.
 *
 * ── IT CANNOT SEND ──────────────────────────────────────────────────────────
 *
 * The stage behind this writes drafts whose status the sender's claim predicate
 * excludes, asserted against the sender's own source in `draftsCannotSend`. So the
 * blast radius of a mis-click is model spend, which the schema and the service both
 * cap, and which this reports back so the cost is visible rather than inferred.
 */
export async function postContentRefreshHandler(req: Request, res: Response): Promise<void> {
  let body: { date?: string; limit?: number };
  try {
    body = contentRefreshBodySchema.parse(req.body ?? {});
  } catch (err) {
    if (err instanceof ZodError) return badRequest(res, err);
    throw err;
  }

  // FAIL CLOSED on a missing flags object, rather than throwing.
  //
  // `isExplorerFeatureEnabled` reads `flags.growthOsEnabled`, so an `env` without
  // an `explorerGrowth` block is a TypeError inside the gate — which Express turns
  // into a 500 and which reads to the operator as "the re-run broke" rather than
  // "the feature is off". For a dark-launched WRITE the safe reading of an absent
  // config is OFF, never on, and never a crash.
  const flags = env.explorerGrowth;
  if (!flags || !isExplorerFeatureEnabled('draftRender', flags)) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        service: 'explorer-growth-command-center',
        event: 'content_refresh_refused_flag_off',
        outcome: 'failure',
        error_class: 'FeatureDisabled',
      }),
    );
    res.status(403).json({
      error: 'The draft render is switched off.',
      error_class: 'FeatureDisabled',
    });
    return;
  }

  try {
    const result = await runDraftRenderBatch({
      ...(body.date ? { decisionDate: body.date } : {}),
      ...(body.limit ? { limit: body.limit } : {}),
    });

    console.log(
      JSON.stringify({
        level: 'info',
        service: 'explorer-growth-command-center',
        event: 'content_refresh_ran',
        outcome: 'success',
        attempted: result.attempted,
        drafted: result.drafted,
        rejected: result.rejected,
      }),
    );

    // `outcomes` is withheld on purpose: it carries per-learner detail including
    // recipient addresses, and this endpoint answers "what did the run do", not
    // "who did it do it to". The Why drilldown is where a single learner's draft
    // is read, behind the same admin guard but one decision at a time.
    res.json({
      attempted: result.attempted,
      drafted: result.drafted,
      rejected: result.rejected,
      skipped: result.skipped,
      failed: result.failed,
      by_reason: result.by_reason,
    });
  } catch (err) {
    const errorClass = classifyError(err);
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'explorer-growth-command-center',
        event: 'content_refresh_failed',
        error_class: errorClass,
        outcome: 'failure',
        message: (err as { message?: string })?.message?.slice(0, 200) ?? null,
      }),
    );
    res.status(500).json({ error: 'The re-run failed. Nothing was written.', error_class: errorClass });
  }
}

// ─── Overview ───────────────────────────────────────────────────────────────

export const getSummaryHandler = handler(null, null, () => getSummary());

export const getDistributionHandler = handler(null, distributionQuerySchema, (_p, q) =>
  getDistribution(q.days),
);

// ─── Campus + outreach (2026-10-26) ─────────────────────────────────────────

export const getCampusActivityHandler = handler(null, null, () => getCampusActivity());

export const getOutreachHandler = handler(null, outreachQuerySchema, (_p, q) => getOutreach(q.view, q.limit));

// ─── Journey ────────────────────────────────────────────────────────────────

export const getLearnersHandler = handler(null, learnersQuerySchema, (_p, q) => getLearners(q));

export const getLearnerHandler = handler(
  learnerParamsSchema,
  null,
  (p) => getLearnerProfile(p.enrollmentId),
  'No such learner',
);

export const getLearnerSignalsHandler = handler(
  learnerParamsSchema,
  learnerSeriesQuerySchema,
  (p, q) => getLearnerSignals(p.enrollmentId, q.days),
  'No such learner',
);

export const getLearnerScoresHandler = handler(
  learnerParamsSchema,
  learnerSeriesQuerySchema,
  (p, q) => getLearnerScores(p.enrollmentId, q.days),
  'No such learner',
);

/**
 * A learner's decision history.
 *
 * Uses `decisionsQuerySchema` for its BOUND, which §27 does not specify for this
 * route. Without it the list is unbounded — every other list route caps at 200,
 * and a learner with a year of daily decisions would return 365 rows while the
 * roster beside it pages at 50.
 */
export const getLearnerDecisionsHandler = handler(
  learnerParamsSchema,
  decisionsQuerySchema,
  (p, q) => getLearnerDecisions(p.enrollmentId, q.limit, q.offset),
  'No such learner',
);

// ─── Decisions, Shadow, Content ─────────────────────────────────────────────

export const getDecisionsHandler = handler(null, decisionsQuerySchema, (_p, q) => getDecisions(q));

/** The Why drilldown — keyed on the DECISION id, not the learner's. */
export const getWhyHandler = handler(
  decisionParamsSchema,
  null,
  (p) => getExplorerWhyByDecision(p.id),
  'No such decision',
);

export const getShadowHandler = handler(null, shadowQuerySchema, (_p, q) => getShadow(q));

export const getContentHandler = handler(null, contentQuerySchema, (_p, q) => getContentHealth(q));

// ─── Eligibility ────────────────────────────────────────────────────────────

export const getEligibilityHandler = handler(
  eligibilityParamsSchema,
  null,
  (p) => getEligibility(p.enrollmentId),
  'No such learner',
);
