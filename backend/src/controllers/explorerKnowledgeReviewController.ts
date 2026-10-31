import { Request, Response } from 'express';
import { z } from 'zod';

import { classifyError } from '../utils/errorClassifier';
import { env } from '../config/env';
import {
  decideDocument,
  getDocument,
  listDocuments,
  listPassages,
  retireDocument,
  type ReviewVerdict,
} from '../services/explorerGrowth/explorerKnowledgeReviewRepository';

/**
 * Reviewing an ingested knowledge document.
 *
 * ## This is the write the upload surface deliberately was not
 *
 * `explorerKnowledgeController` argues that an upload is safe to add because a stored
 * document lands at `unstated` and the quote gate refuses it — the worst outcome is an
 * unhelpful row waiting for a reviewer. This endpoint IS that reviewer, and marking a
 * document `grounded` is the single step that lets its text reach a learner. So it carries
 * the strictness the upload did not need: a verdict enum that cannot express "unreviewed",
 * a row lock around the decision, and a refusal to re-approve withdrawn text.
 *
 * ## Same master flag, no sub-flag
 *
 * Gated on `growthOsEnabled` like the upload, and for the same reason it needs no flag of
 * its own: a grounded document still cannot be sent until `draftRender` is on, so a
 * sub-flag here would gate nothing that is not already gated downstream, at the cost of
 * four hand-maintained pins in the flag registry's tests.
 *
 * ## Params ARE validated, which is new in this repo
 *
 * Elsewhere `req.params.id` is cast ad hoc. That is survivable where the value is
 * interpolated into a Sequelize `where`, and it is not survivable here: these queries
 * `CAST(:id AS uuid)`, and Postgres answers a malformed uuid with a thrown error, which
 * would surface as a 500 reading "the server broke" when the truth is "that is not an id".
 * A Zod uuid check turns it into the 400 it always was.
 */

const UUID = z.string().uuid();

const idParamsSchema = z.object({ id: UUID });

/**
 * `.strict()` throughout, so a typo'd filter is a 400 rather than a silently wider list.
 * A reviewer who types `?confidence=unstate` and is shown every document would reasonably
 * conclude nothing is awaiting review.
 */
const listQuerySchema = z
  .object({
    confidence: z.enum(['grounded', 'drafted-verify', 'unstated']).optional(),
    brand_id: UUID.optional(),
    include_retired: z.enum(['true', 'false']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

const passagesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

/**
 * The verdict a reviewer may record.
 *
 * `unstated` is NOT here, and its absence is the contract. It means "nobody ever said
 * anything", which stops being true the moment a human opens the document — so it is not
 * reachable by review, and admitting it would let a reviewed document be laundered back
 * into the queue with no trace that it was seen.
 */
const decisionBodySchema = z
  .object({ confidence: z.enum(['grounded', 'drafted-verify']) })
  .strict();

function logLine(fields: Record<string, unknown>): string {
  return JSON.stringify({ service: 'explorer-knowledge-review', ...fields });
}

/**
 * The master gate and the admin identity, resolved together.
 *
 * Returns the actor on success and has already answered the request on failure, so every
 * handler starts with the same three lines and none of them can forget one of the two
 * checks. An absent `explorerGrowth` block reads as OFF rather than throwing, the same way
 * the upload handler treats it — a TypeError here becomes a 500 that reads as "review is
 * broken" instead of "the feature is off".
 */
function gate(req: Request, res: Response, event: string): string | null {
  const flags = env.explorerGrowth;
  if (!flags || !flags.growthOsEnabled) {
    console.warn(
      logLine({ level: 'warn', event, outcome: 'failure', error_class: 'FeatureDisabled' }),
    );
    res.status(403).json({ error: 'Explorer Growth is switched off.', error_class: 'FeatureDisabled' });
    return null;
  }

  const actor = req.admin?.email;
  if (!actor) {
    // Behind `requireAdmin` this cannot normally happen. A decision attributed to nobody is
    // a provenance record that answers nothing, so it fails closed rather than writing one.
    res.status(403).json({ error: 'No admin identity on the request.', error_class: 'AuthError' });
    return null;
  }

  return actor;
}

function badRequest(res: Response, error: z.ZodError): void {
  res.status(400).json({
    error: 'Validation failed',
    error_class: 'ValidationError',
    details: error.flatten(),
  });
}

function serverError(res: Response, err: unknown, event: string): void {
  const errorClass = classifyError(err);
  console.error(
    logLine({
      level: 'error',
      event,
      outcome: 'failure',
      error_class: errorClass,
      message: (err as { message?: string })?.message?.slice(0, 200) ?? null,
    }),
  );
  // The upstream message never reaches the caller; it can carry table and column names.
  res.status(500).json({ error: 'The request failed.', error_class: errorClass });
}

/**
 * Every document response says whether its text can be quoted.
 *
 * Derived from `confidence` in one place rather than left to each caller, because the
 * mapping is not the obvious one: `drafted-verify` sounds like a softer approval and the
 * gate refuses it exactly as hard as `unstated`. A UI computing this for itself would get
 * it wrong, and would get it wrong in the direction of showing a reviewer that unapproved
 * text is live.
 */
function withQuotable<T extends { confidence: string; retired_at: string | null }>(doc: T) {
  return { ...doc, quotable: doc.confidence === 'grounded' && !doc.retired_at };
}

export async function getKnowledgeDocumentsHandler(req: Request, res: Response): Promise<void> {
  if (!gate(req, res, 'list_refused_flag_off')) return;

  const parsed = listQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) return badRequest(res, parsed.error);

  try {
    const { documents, total } = await listDocuments({
      confidence: parsed.data.confidence,
      brandId: parsed.data.brand_id ?? null,
      includeRetired: parsed.data.include_retired === 'true',
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });

    res.json({
      documents: documents.map(withQuotable),
      total,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
  } catch (err) {
    serverError(res, err, 'list_failed');
  }
}

/**
 * One document plus a page of its passages.
 *
 * This is the one endpoint that returns document TEXT, and it is the reason the upload
 * response does not: a reviewer has to read the thing to judge it, so the text is served
 * here, behind the same guard, one page at a time, rather than echoed everywhere.
 */
export async function getKnowledgeDocumentHandler(req: Request, res: Response): Promise<void> {
  if (!gate(req, res, 'detail_refused_flag_off')) return;

  const params = idParamsSchema.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);

  const query = passagesQuerySchema.safeParse(req.query ?? {});
  if (!query.success) return badRequest(res, query.error);

  try {
    const document = await getDocument(params.data.id);
    if (!document) {
      res.status(404).json({ error: 'No such document.', error_class: 'NotFound' });
      return;
    }

    const { passages, total } = await listPassages(params.data.id, {
      limit: query.data.limit,
      offset: query.data.offset,
    });

    res.json({
      document: withQuotable(document),
      passages,
      passage_total: total,
      limit: query.data.limit,
      offset: query.data.offset,
    });
  } catch (err) {
    serverError(res, err, 'detail_failed');
  }
}

export async function postKnowledgeDecisionHandler(req: Request, res: Response): Promise<void> {
  const actor = gate(req, res, 'decision_refused_flag_off');
  if (!actor) return;

  const params = idParamsSchema.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);

  const body = decisionBodySchema.safeParse(req.body ?? {});
  if (!body.success) return badRequest(res, body.error);

  try {
    const outcome = await decideDocument(
      params.data.id,
      body.data.confidence as ReviewVerdict,
      actor,
    );

    if (outcome.status === 'not_found') {
      res.status(404).json({ error: 'No such document.', error_class: 'NotFound' });
      return;
    }

    if (outcome.status === 'retired') {
      // 409, not 400: the request was well-formed and the caller is allowed. The DOCUMENT
      // is in a state where this decision cannot apply, and saying so is the useful answer.
      res.status(409).json({
        error: 'That document was retired and cannot be approved. Restore it first.',
        error_class: 'DocumentRetired',
        retired_at: outcome.retiredAt,
      });
      return;
    }

    console.log(
      logLine({
        level: 'info',
        event: 'document_decided',
        outcome: 'success',
        document_id: outcome.document.id,
        confidence: outcome.document.confidence,
        // Recorded because this is the moment text becomes reachable by a learner, and
        // "who made it quotable, and when" is the question an audit actually asks.
        quotable: outcome.document.confidence === 'grounded',
        reviewed_by: actor,
      }),
    );

    res.json({ document: withQuotable(outcome.document) });
  } catch (err) {
    serverError(res, err, 'decision_failed');
  }
}

export async function postKnowledgeRetireHandler(req: Request, res: Response): Promise<void> {
  const actor = gate(req, res, 'retire_refused_flag_off');
  if (!actor) return;

  const params = idParamsSchema.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);

  try {
    const outcome = await retireDocument(params.data.id, actor);

    if (outcome.status === 'not_found') {
      res.status(404).json({ error: 'No such document.', error_class: 'NotFound' });
      return;
    }

    console.log(
      logLine({
        level: 'info',
        event: 'document_retired',
        outcome: 'success',
        document_id: params.data.id,
        reviewed_by: actor,
      }),
    );

    // 200 on a repeat as well as on the first call: the end state is what the caller asked
    // for either way, and a retry that reads as an error invites someone to "fix" it.
    res.json({ document: withQuotable(outcome.document!) });
  } catch (err) {
    serverError(res, err, 'retire_failed');
  }
}
