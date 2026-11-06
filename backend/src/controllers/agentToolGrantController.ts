import type { Request, Response } from 'express';
import { z } from 'zod';
import { sequelize } from '../config/database';
import { GrantToolSchema } from '../schemas/agentToolGrantSchema';
import {
  ToolGrantRefusedError,
  ToolGrantTouchedMoreThanToolsError,
  grantToolToAgent,
  listGrantsForAgent,
} from '../services/agentDomain/agentToolGrantService';

/**
 * AF3.5 — grant an existing tool to an agent, and read what an agent has been granted.
 *
 * The outcome ladder matches AF11.3's, for the reason that file records: collapsing any two of
 * these leaves the person unable to tell what to do next.
 *
 *   400  the body is not usable — a missing tool or capability, or a key this route refuses
 *   409  the grant itself is refused, with every reason — not an approver, the proposer, a
 *        capability that is not confirmed, a tool nothing implements
 *   500  the grant wrote something it must not have, and was rolled back
 *   200  granted, or already held
 *
 * **409 and not 403**, same as the decision route: the caller IS authorized to use the endpoint,
 * and what is refused is this particular grant standing. A 403 would send them looking for a
 * permissions problem that does not exist.
 *
 * ## The actor comes from the verified token and nowhere else
 *
 * No `|| 'unknown'`. `approvalRequestController` has one, and because `isNonHumanIdentity`
 * returns false for `'unknown'`, every row it wrote claims a human decided something nobody did.
 * An identity this route cannot resolve is passed through empty and refused by name.
 */

const AgentIdParamSchema = z.object({ agentId: z.string().uuid('Not an agent id.') });

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'backend',
    event: 'agent_tool_grant',
    ...fields,
  }));
}

function actorOf(req: Request): string {
  return (req as any).admin?.email ?? '';
}

/** Prefer the constructor name: a subclass that forgot to set `.name` still classifies right. */
function classify(err: unknown): string {
  if (err instanceof Error) return err.constructor?.name || err.name || 'Error';
  return 'UnknownError';
}

export async function handleGrantTool(req: Request, res: Response): Promise<void> {
  const parsed = GrantToolSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'That grant request cannot be read.',
      code: 'invalid_grant_body',
      issues: parsed.error.issues.map((i) => ({
        rule: i.path.join('.') || 'body',
        detail: i.message,
      })),
    });
    return;
  }

  const actor = actorOf(req);
  try {
    const result = await grantToolToAgent(sequelize, {
      agentId: parsed.data.agent_id,
      toolName: parsed.data.tool_name,
      capabilityId: parsed.data.capability_id,
      approvedBy: actor,
      proposedBy: parsed.data.proposed_by ?? null,
    });
    log({
      level: 'info',
      outcome: 'success',
      agent_name: result.agentName,
      tool_name: result.toolName,
      unchanged: result.unchanged,
    });
    res.json({ grant: result });
  } catch (err: unknown) {
    if (err instanceof ToolGrantRefusedError) {
      log({ level: 'warn', outcome: 'refused', error_class: classify(err),
        rules: err.issues.map((i) => i.rule) });
      res.status(409).json({
        error: 'That grant cannot stand.',
        code: 'grant_refused',
        issues: err.issues,
      });
      return;
    }
    if (err instanceof ToolGrantTouchedMoreThanToolsError) {
      // A contract violation, not a user error. Loud on purpose: it means a later edit widened
      // what a grant does, and the transaction was rolled back rather than committed.
      log({ level: 'error', outcome: 'failure', error_class: classify(err),
        changed: err.changed });
      res.status(500).json({
        error: 'The grant was rolled back because it would have changed more than the tool list.',
        code: 'grant_touched_more_than_tools',
        changed: err.changed,
      });
      return;
    }
    log({ level: 'error', outcome: 'failure', error_class: classify(err) });
    res.status(500).json({ error: 'Could not record that grant.', code: 'grant_failed' });
  }
}

export async function handleListAgentGrants(req: Request, res: Response): Promise<void> {
  const parsed = AgentIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: 'Not an agent id.', code: 'invalid_agent_id' });
    return;
  }
  try {
    const rows = await listGrantsForAgent(parsed.data.agentId);
    res.json({
      grants: rows.map((r) => ({
        id: r.id,
        agent_id: r.agent_id,
        agent_name: r.agent_name,
        tool_name: r.tool_name,
        capability_id: r.capability_id,
        approved_by_identity: r.approved_by_identity,
        approved_at: r.approved_at,
      })),
    });
  } catch (err: unknown) {
    log({ level: 'error', outcome: 'failure', error_class: classify(err) });
    res.status(500).json({ error: 'Could not read the grants.', code: 'grants_unreadable' });
  }
}
