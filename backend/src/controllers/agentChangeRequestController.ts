import type { Request, Response } from 'express';
import { z } from 'zod';
import { sequelize } from '../config/database';
import {
  DecideChangeRequestSchema,
  FileChangeRequestSchema,
} from '../schemas/agentChangeRequestSchema';
import {
  ActorNotResolvedError,
  ChangeRequestNotFoundError,
  ChangeRequestRefusedError,
  DomainNotYoursError,
  decideChangeRequest,
  fileChangeRequest,
  listAllChangeRequests,
  listMyChangeRequests,
} from '../services/agentDomain/agentChangeRequestService';
import type { AgentChangeRequestStatus } from '../services/agentDomain/agentChangeRequest';

/**
 * AF4.2 — filing a change request, and deciding one.
 *
 * The outcomes are kept distinct for the same reason AF10.6's handler keeps its four apart:
 * collapsing any two of them leaves an intern unable to tell what to do next.
 *
 *   400  the body is not usable (missing title, too long, unknown field, decline with no reason)
 *   403  we cannot tell who you are, or that domain is not yours
 *   404  no such change request
 *   409  the decision itself is refused, with the reasons - the timer identity, self-approval,
 *        an already-decided request
 *   200  recorded
 *
 * 409 rather than 403 for a refused decision is deliberate: 403 says "you may not use this
 * endpoint", and the caller here is a legitimately authorized admin whose particular decision is
 * not allowed to stand. Those are different facts and the portal shows different things for them.
 *
 * ## The actor is resolved, never defaulted
 *
 * `actorEmail` is passed through as whatever the verified token carries, including empty, and the
 * service refuses when it cannot find a matching person. This controller never substitutes a
 * placeholder. `approvalRequestController.ts` writes `req.admin?.email || 'unknown'` into
 * `decided_by`, and `isNonHumanIdentity('unknown')` is false - so that row claims a human decided
 * something nobody did, permanently and undetectably.
 */

const IdParamSchema = z.object({ id: z.string().uuid('Not a change request id.') });

const ListQuerySchema = z.object({
  status: z.enum(['submitted', 'approved', 'declined', 'withdrawn']).optional(),
  kind: z.enum(['change', 'tool']).optional(),
}).strict();

/** The intern's own list takes the same filter, so one surface can show either. */
const MineQuerySchema = z.object({
  kind: z.enum(['change', 'tool']).optional(),
}).strict();

/** One structured line per attempt, success or failure. No bodies, no stacks. */
function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'backend',
    event: 'agent_change_request',
    ...fields,
  }));
}

function actorOf(req: Request): string {
  return (req as any).admin?.email ?? '';
}

/**
 * Classify an error for the log, preferring the CONSTRUCTOR over `name`.
 *
 * The house idiom elsewhere is `err?.name || err?.constructor?.name || 'Error'`, and it has a hole:
 * `name` is inherited from `Error.prototype`, so it is the string `'Error'` for any subclass that
 * does not set `this.name` explicitly. Being truthy, it short-circuits and the real class never
 * gets a chance — so one forgotten line in an error class turns every log line for it into the
 * generic `Error` that CLAUDE.md rules out in a production path. A test caught exactly that here.
 *
 * `'UnknownError'` rather than `'Error'` for a bare `Error` is deliberate for the same reason: if
 * it shows up in the logs it means the surrounding code needs a more specific catch, and a word
 * that says so is more useful than one that looks like a classification.
 */
function classify(err: unknown): string {
  const ctor = (err as any)?.constructor?.name as string | undefined;
  const name = (err as any)?.name as string | undefined;
  if (ctor && ctor !== 'Error' && ctor !== 'Object') return ctor;
  if (name && name !== 'Error') return name;
  return 'UnknownError';
}

/**
 * Map an error to a status and a sentence. Shared by all four handlers so the mapping cannot drift
 * between them - a refused decision answering 409 on one route and 403 on another would be a
 * contract difference nobody declared.
 */
function respondToError(
  err: unknown,
  res: Response,
  ctx: { actorEmail: string; action: string; duration: number },
): void {
  const errorClass = classify(err);
  const base = {
    outcome: 'failure' as const,
    error_class: errorClass,
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
  if (err instanceof ActorNotResolvedError || err instanceof DomainNotYoursError) {
    log({ ...base, level: 'warn' });
    res.status(403).json({ error: (err as Error).message });
    return;
  }
  if (err instanceof ChangeRequestNotFoundError) {
    log({ ...base, level: 'warn' });
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ChangeRequestRefusedError) {
    log({
      ...base,
      level: 'info',
      context: { action: ctx.action, rules: err.issues.map((i) => i.rule) },
    });
    res.status(409).json({ error: err.message, issues: err.issues });
    return;
  }
  log({ ...base, level: 'error', context: { action: ctx.action, message: (err as any)?.message } });
  res.status(500).json({ error: 'Could not record that.' });
}

export async function handleFileChangeRequest(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();
  const actorEmail = actorOf(req);
  try {
    const body = FileChangeRequestSchema.parse(req.body);
    const created = await fileChangeRequest({
      sequelize,
      email: actorEmail,
      kind: body.kind,
      domainKey: body.domain_key,
      title: body.title,
      description: body.description ?? null,
    });
    log({
      level: 'info', outcome: 'success', duration_ms: Date.now() - startedAt,
      actor_email: actorEmail,
      context: {
        action: 'file', change_request_id: created.id,
        domain_key: created.domain_key, kind: created.kind,
      },
    });
    res.status(201).json(created);
  } catch (err: unknown) {
    respondToError(err, res, { actorEmail, action: 'file', duration: Date.now() - startedAt });
  }
}

export async function handleDecideChangeRequest(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();
  const actorEmail = actorOf(req);
  try {
    const { id } = IdParamSchema.parse(req.params);
    const body = DecideChangeRequestSchema.parse(req.body);
    const decided = await decideChangeRequest({
      sequelize,
      email: actorEmail,
      id,
      decision: body.decision,
      declinedReason: body.declined_reason ?? null,
    });
    log({
      level: 'info', outcome: 'success', duration_ms: Date.now() - startedAt,
      actor_email: actorEmail,
      // The decider is the actor on this line already, so there is no second identity to log.
      context: { action: 'decide', change_request_id: decided.id, decision: decided.status },
    });
    res.json(decided);
  } catch (err: unknown) {
    respondToError(err, res, { actorEmail, action: 'decide', duration: Date.now() - startedAt });
  }
}

export async function handleListMyChangeRequests(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();
  const actorEmail = actorOf(req);
  try {
    const { kind } = MineQuerySchema.parse(req.query);
    const rows = await listMyChangeRequests(sequelize, actorEmail, kind);
    res.json({ change_requests: rows });
  } catch (err: unknown) {
    respondToError(err, res, { actorEmail, action: 'list_mine', duration: Date.now() - startedAt });
  }
}

export async function handleListAllChangeRequests(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();
  const actorEmail = actorOf(req);
  try {
    const { status, kind } = ListQuerySchema.parse(req.query);
    const rows = await listAllChangeRequests(
      sequelize, status as AgentChangeRequestStatus | undefined, kind,
    );
    res.json({ change_requests: rows });
  } catch (err: unknown) {
    respondToError(err, res, { actorEmail, action: 'list_all', duration: Date.now() - startedAt });
  }
}
