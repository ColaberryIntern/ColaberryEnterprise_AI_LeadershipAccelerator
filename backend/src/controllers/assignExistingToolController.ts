import type { Request, Response } from 'express';
import { z } from 'zod';
import { sequelize } from '../config/database';
import { AssignExistingToolSchema } from '../schemas/assignExistingToolSchema';
// All four failures come from the AF11.4 service, including the two it merely passes on. It
// re-exports them for a stated reason: the decision service and the grant service each have a
// structural test pinning who may import them, and importing either from here would widen that
// pin to say something weaker than the truth. See that file's own note.
import {
  AssignmentRefusedError,
  ToolGrantRefusedError,
  ToolGrantTouchedMoreThanToolsError,
  ToolRequestNotFoundError,
  assignExistingTool,
} from '../services/agentDomain/assignExistingToolService';

/**
 * AF11.4 — carry out the "assign an existing tool" decision that was already recorded.
 *
 * The outcome ladder is AF3.5's and AF11.3's, for the reason both of those files record:
 * collapsing any two of these leaves the person unable to tell what to do next.
 *
 *   400  the body carries a field this route refuses, or the id is not an id
 *   404  no such request
 *   409  the assignment cannot be carried out, with every reason — no decision was made, the
 *        caller is not the person who made it, the request names no agent — OR the grant itself
 *        is refused, in the GRANT's own vocabulary: an unconfirmed capability, a tool nothing
 *        implements, an approver who is also the proposer
 *   500  the grant wrote something it must not have, and was rolled back
 *   200  granted, or already held
 *
 * **Two kinds of 409, told apart by `code`.** `assignment_refused` is "there is nothing here to
 * carry out"; `grant_refused` is "the grant itself may not stand". They are different problems
 * with different fixes — the first is answered by making a decision, the second by confirming a
 * capability — and a console that showed one sentence for both would send Ali to the wrong
 * screen. Neither is a 403: the caller is authorized to use the endpoint.
 *
 * ## The actor comes from the verified token and nowhere else
 *
 * No `|| 'unknown'`. `approvalRequestController` has one, and because `isNonHumanIdentity`
 * returns false for `'unknown'`, every row it writes claims a human decided something nobody
 * did. An identity this route cannot resolve is passed through empty and refused by name.
 */

const IdParamSchema = z.object({ id: z.string().uuid('Not a change request id.') });

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'backend',
    event: 'tool_request_assignment',
    ...fields,
  }));
}

/** Prefer the constructor: a subclass that forgot to set `.name` still classifies correctly. */
function classify(err: unknown): string {
  const ctor = (err as { constructor?: { name?: string } })?.constructor?.name;
  const name = (err as { name?: string })?.name;
  if (ctor && ctor !== 'Error' && ctor !== 'Object') return ctor;
  if (name && name !== 'Error') return name;
  return 'UnknownError';
}

/** POST — grant the tool the recorded decision chose. 200, or 400/404/409/500. */
export async function handleAssignExistingTool(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();
  const actorEmail = (req as unknown as { admin?: { email?: string } }).admin?.email ?? '';

  const params = IdParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: 'Not a change request id.', code: 'invalid_request_id' });
    return;
  }

  // An empty object, strictly. A body carrying a tool name, an autonomy level or an `enabled`
  // flag is refused by name rather than ignored — see the schema's own header for why that
  // distinction is the whole point of this route having a schema at all.
  const body = AssignExistingToolSchema.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({
      error: 'This route takes no fields. The tool, the agent and the capability all come from '
        + 'the decision and the request that were already recorded.',
      code: 'unexpected_fields',
      issues: body.error.issues.map((i) => ({
        rule: i.path.join('.') || 'body',
        detail: i.message,
      })),
    });
    return;
  }

  try {
    const result = await assignExistingTool({
      sequelize,
      changeRequestId: params.data.id,
      calledBy: actorEmail,
    });
    log({
      level: 'info',
      outcome: 'success',
      duration_ms: Date.now() - startedAt,
      actor_email: actorEmail,
      context: {
        change_request_id: result.changeRequestId,
        agent_name: result.grant.agentName,
        tool_name: result.grant.toolName,
        unchanged: result.grant.unchanged,
        usable_after: result.access?.usable ?? null,
      },
    });
    res.json(result);
  } catch (err: unknown) {
    const base = {
      outcome: 'failure' as const,
      error_class: classify(err),
      duration_ms: Date.now() - startedAt,
      actor_email: actorEmail,
    };

    if (err instanceof ToolRequestNotFoundError) {
      log({ ...base, level: 'warn' });
      res.status(404).json({ error: err.message, code: 'request_not_found' });
      return;
    }
    if (err instanceof AssignmentRefusedError) {
      log({ ...base, level: 'info', context: { rules: err.issues.map((i) => i.rule) } });
      res.status(409).json({
        error: 'That assignment cannot be carried out.',
        code: 'assignment_refused',
        issues: err.issues,
      });
      return;
    }
    if (err instanceof ToolGrantRefusedError) {
      log({ ...base, level: 'warn', context: { rules: err.issues.map((i) => i.rule) } });
      res.status(409).json({
        error: 'The decision stands, but the grant it asks for cannot.',
        code: 'grant_refused',
        issues: err.issues,
      });
      return;
    }
    if (err instanceof ToolGrantTouchedMoreThanToolsError) {
      // A contract violation, not a user error. Loud on purpose: it means a later edit widened
      // what a grant does, and the transaction was rolled back rather than committed.
      log({ ...base, level: 'error', context: { changed: err.changed } });
      res.status(500).json({
        error: 'The grant was rolled back because it would have changed more than the tool list.',
        code: 'grant_touched_more_than_tools',
        changed: err.changed,
      });
      return;
    }
    log({ ...base, level: 'error', context: { message: (err as { message?: string })?.message } });
    res.status(500).json({ error: 'Could not carry out that assignment.', code: 'assign_failed' });
  }
}
