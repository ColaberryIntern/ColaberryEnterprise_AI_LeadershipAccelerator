import type { Request, Response } from 'express';
import { z } from 'zod';
import { sequelize } from '../config/database';
import { DecideToolRequestSchema } from '../schemas/toolRequestDecisionSchema';
import {
  ToolRequestDecisionRefusedError,
  ToolRequestNotFoundError,
  decideToolRequest,
  loadDecisions,
} from '../services/agentDomain/toolRequestDecisionService';

/**
 * AF11.3 — the review console's two calls: read the decisions on a request, and make one.
 *
 * The outcome ladder is the one `agentChangeRequestController` already uses, for the reason it
 * records: collapsing any two of these leaves the person unable to tell what to do next.
 *
 *   400  the body is not usable — an unknown verb, a denial with no reason, a send-back naming
 *        nothing, or a field that belongs to a different decision
 *   404  no such request
 *   409  the decision itself is refused, with every reason — not an approver, the proposer,
 *        already decided, a machine identity, an absent roster
 *   200  recorded
 *
 * **409 and not 403.** The route is `requireAdmin`, so a caller who reaches this code is
 * authorized to use the endpoint. What is refused is this particular decision standing, which is
 * a different fact, and the console renders it differently: a 403 reads as "this screen is not
 * for you" and would send Ali looking for a permissions problem that does not exist.
 *
 * ## Every refusal is returned, not just the first
 *
 * `issues` carries the whole list. A console that reports one reason per round trip teaches the
 * person to click again rather than to read, and the refusals here are exactly the ones that
 * should be read: "you filed this request" and "you are not a configured approver" are different
 * problems with different fixes.
 *
 * ## The actor comes from the token and nowhere else
 *
 * `actorOf` reads the verified token and passes it through as-is, INCLUDING empty. There is no
 * `|| 'unknown'` here on purpose: `approvalRequestController` has one, and because
 * `isNonHumanIdentity('unknown')` is false, that row claims a human decided something nobody did.
 * The service refuses an identity it cannot resolve; this file never invents one for it.
 */

const IdParamSchema = z.object({ id: z.string().uuid('Not a change request id.') });

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'backend',
    event: 'tool_request_decision',
    ...fields,
  }));
}

function actorOf(req: Request): string {
  return (req as any).admin?.email ?? '';
}

/**
 * Classify for the log, preferring the CONSTRUCTOR over `name`.
 *
 * Same shape, same reason, as `agentChangeRequestController.classify`: `name` is inherited from
 * `Error.prototype`, so it is the string `'Error'` for any subclass that forgets to set it, and
 * being truthy it short-circuits the real class out of the log. CLAUDE.md rules out a generic
 * `Error` classification in a production path, and one forgotten line should not produce one.
 */
function classify(err: unknown): string {
  const ctor = (err as any)?.constructor?.name as string | undefined;
  const name = (err as any)?.name as string | undefined;
  if (ctor && ctor !== 'Error' && ctor !== 'Object') return ctor;
  if (name && name !== 'Error') return name;
  return 'UnknownError';
}

function respondToError(
  err: unknown,
  res: Response,
  ctx: { actorEmail: string; action: string; duration: number },
): void {
  const base = {
    outcome: 'failure' as const,
    error_class: classify(err),
    duration_ms: ctx.duration,
    actor_email: ctx.actorEmail,
    context: { action: ctx.action },
  };

  if (err instanceof z.ZodError) {
    log({ ...base, level: 'warn', error_class: 'ValidationError' });
    // Zod 4 exposes `issues`, not `errors`.
    res.status(400).json({ error: 'Invalid input', issues: err.issues });
    return;
  }
  if (err instanceof ToolRequestNotFoundError) {
    log({ ...base, level: 'warn' });
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ToolRequestDecisionRefusedError) {
    log({
      ...base,
      level: 'info',
      context: { action: ctx.action, rules: err.issues.map((i) => i.rule) },
    });
    res.status(409).json({ error: err.message, issues: err.issues });
    return;
  }
  log({ ...base, level: 'error', context: { action: ctx.action, message: (err as any)?.message } });
  res.status(500).json({ error: 'Could not record that decision.' });
}

/** POST — settle one tool request with one of the four verbs. 200, or 400/404/409. */
export async function handleDecideToolRequest(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();
  const actorEmail = actorOf(req);
  try {
    const { id } = IdParamSchema.parse(req.params);
    const body = DecideToolRequestSchema.parse(req.body);
    const decided = await decideToolRequest({
      sequelize,
      email: actorEmail,
      id,
      proposed: {
        verb: body.verb,
        reason: body.reason ?? null,
        missing_field: body.missing_field ?? null,
        assigned_tool_name: body.assigned_tool_name ?? null,
      },
    });
    log({
      level: 'info',
      outcome: 'success',
      duration_ms: Date.now() - startedAt,
      actor_email: actorEmail,
      context: {
        action: 'decide',
        change_request_id: decided.change_request_id,
        verb: decided.verb,
        request_status: decided.request_status,
      },
    });
    res.json(decided);
  } catch (err: unknown) {
    respondToError(err, res, { actorEmail, action: 'decide', duration: Date.now() - startedAt });
  }
}

/**
 * GET — every decision on one request, oldest first.
 *
 * Its own call rather than a field on the queue listing, because a send-back can happen more than
 * once and the history is what makes the queue readable: "this is the third time this has come
 * back" is the fact an approver needs, and it is not derivable from a request's single status.
 */
export async function handleListToolRequestDecisions(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();
  const actorEmail = actorOf(req);
  try {
    const { id } = IdParamSchema.parse(req.params);
    const decisions = await loadDecisions(id);
    res.json({ decisions });
  } catch (err: unknown) {
    respondToError(err, res, {
      actorEmail,
      action: 'list_decisions',
      duration: Date.now() - startedAt,
    });
  }
}
