import type { Request, Response } from 'express';
import { z } from 'zod';
import { sequelize } from '../config/database';
import {
  PackageOnAChangeRequestError,
  PackageOnADecidedRequestError,
  PackageRequestNotFoundError,
  attachPackage,
  loadPackage,
  readinessOf,
} from '../services/agentDomain/toolRequestPackageService';
import { ToolRequestPackagePayloadSchema } from '../schemas/toolRequestPackageSchema';

/**
 * AF11.8 — writing and reading a request's ten-block decision package.
 *
 * ## An incomplete package is a 200, not a 400
 *
 * This is the one thing about this controller that will look wrong at first read. The ticket's
 * words are *"A request missing one does not reach Ali; it bounces to the agent naming the
 * block"* — a bounce, not a refusal. So a package with three blocks outstanding is SAVED and the
 * response carries `readiness.bounced_blocks` for the agent to work through. The request simply
 * does not appear in Ali's queue until it is ready.
 *
 * A 400 here would mean an agent could not save a half-written package, which would force it to
 * compose all ten blocks in one shot and lose everything on the first mistake.
 *
 * What IS a 400: a payload that is the wrong SHAPE (a string where a list belongs), and a package
 * the row's own constraints cannot hold at all — one option, or a recommendation for an option
 * nobody offered. Those are not incomplete, they are unreadable, and `toolRequestPackageService`
 * explains why the database refuses them rather than the gate.
 *
 * ## The actor is not checked here beyond the route's `requireAdmin`
 *
 * Writing a package changes no permission and grants nothing: it is the ARGUMENT for a decision,
 * not the decision. `toolRequestDecisionController` is where the approver rules live, and this
 * file deliberately has no second idea of who may approve — the refusal vocabulary in
 * `promotionCriteria.ts` is the only one.
 */

const IdParamSchema = z.object({ id: z.string().uuid('Not a change request id.') });

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'backend',
    event: 'tool_request_package',
    ...fields,
  }));
}

/** Constructor first, for the reason `toolRequestDecisionController.classify` records. */
function classify(err: unknown): string {
  const ctor = (err as { constructor?: { name?: string } })?.constructor?.name;
  const name = (err as { name?: string })?.name;
  if (ctor && ctor !== 'Error' && ctor !== 'Object') return ctor;
  if (name && name !== 'Error') return name;
  return 'UnknownError';
}

/**
 * A constraint violation is the storage half of a rule the contract also states, so it comes back
 * as a 400 naming the constraint rather than as a 500.
 *
 * Without this, `chk_adtrp_two_real_options` would surface to an agent as "internal server
 * error", which is both wrong and unactionable: the request is fine, the package offered one
 * option.
 */
const CONSTRAINT_SENTENCES: Record<string, string> = {
  chk_adtrp_two_real_options:
    'A package has to offer two or three options. One option is not a choice, and Nothing is '
    + 'always available to the decider without being offered.',
  chk_adtrp_options_are_shaped:
    'Every option needs a letter and a verb saying what choosing it would do.',
  chk_adtrp_no_option_is_a_refusal:
    'An option cannot simply be a refusal. Declining is already available to the decider, so '
    + '"do it" and "do not" is not two options.',
  chk_adtrp_recommendation_is_on_the_list:
    'The recommendation names an option that is not on the list.',
  chk_adtrp_findings_carry_sources:
    'Every key finding needs a non-empty finding and a non-empty source.',
  chk_adtrp_recommendation_is_known:
    'A recommendation has to be A, B, C or nothing.',
};

function constraintSentence(err: unknown): string | null {
  const text = String((err as { message?: string })?.message ?? '');
  for (const [name, sentence] of Object.entries(CONSTRAINT_SENTENCES)) {
    if (text.includes(name)) return sentence;
  }
  return null;
}

/** PUT — write or rewrite the package. 200 whether it is complete or bounced. */
export async function handlePutToolRequestPackage(req: Request, res: Response): Promise<void> {
  const started = Date.now();
  const params = IdParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.issues[0]?.message ?? 'Bad id.' });
    return;
  }
  const body = ToolRequestPackagePayloadSchema.safeParse(req.body);
  if (!body.success) {
    // Shape, not completeness. The contract decides completeness and answers with a bounce.
    res.status(400).json({
      error: 'That package is not the right shape.',
      issues: body.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  try {
    const result = await attachPackage({
      sequelize,
      changeRequestId: params.data.id,
      input: body.data,
    });
    log({
      outcome: 'success',
      action: 'put_package',
      change_request_id: params.data.id,
      ready_for_a_human: result.readiness.ready_for_a_human,
      bounced_blocks: result.readiness.bounced_blocks,
      duration_ms: Date.now() - started,
    });
    res.json(result);
  } catch (err: unknown) {
    const error_class = classify(err);
    log({
      outcome: 'failure',
      action: 'put_package',
      change_request_id: params.data.id,
      error_class,
      context: { message: (err as { message?: string })?.message },
      duration_ms: Date.now() - started,
    });

    if (err instanceof PackageRequestNotFoundError) {
      res.status(404).json({ error: 'No such request.' });
      return;
    }
    if (err instanceof PackageOnAChangeRequestError
        || err instanceof PackageOnADecidedRequestError) {
      res.status(409).json({ error: (err as Error).message });
      return;
    }
    const sentence = constraintSentence(err);
    if (sentence) {
      res.status(400).json({ error: sentence });
      return;
    }
    res.status(500).json({ error: 'Could not save that package.' });
  }
}

/** GET — one request's package and its readiness. */
export async function handleGetToolRequestPackage(req: Request, res: Response): Promise<void> {
  const params = IdParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.issues[0]?.message ?? 'Bad id.' });
    return;
  }
  try {
    const decision_package = await loadPackage(params.data.id);
    res.json({
      change_request_id: params.data.id,
      decision_package,
      readiness: readinessOf(decision_package),
    });
  } catch (err: unknown) {
    log({
      outcome: 'failure',
      action: 'get_package',
      change_request_id: params.data.id,
      error_class: classify(err),
    });
    res.status(500).json({ error: 'Could not read that package.' });
  }
}
