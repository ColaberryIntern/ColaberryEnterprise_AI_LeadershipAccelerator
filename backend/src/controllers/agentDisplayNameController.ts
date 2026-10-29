import type { Request, Response } from 'express';
import { z } from 'zod';
import { sequelize } from '../config/database';
import { AgentDisplayNameSchema } from '../schemas/agentDisplayNameSchema';
import {
  setAgentDisplayName,
  AgentNotYoursError,
  AgentDisplayNameTakenError,
} from '../services/agentDomain/agentDisplayNameService';

/**
 * AF10.6 — PATCH handler for naming your own agent.
 *
 * The four outcomes are kept distinct on purpose, because collapsing any two of them is how an
 * intern ends up unable to tell "I typed something invalid" from "somebody already has that name"
 * from "that is not my agent". Each gets its own status and its own sentence:
 *
 *   400  the name itself is not usable (empty, too long, no letters, unknown field)
 *   403  the agent is not one of yours
 *   409  the name is taken, and by what
 *   200  stored, with `unchanged` telling a replay from a change
 */

const ParamsSchema = z.object({ agentId: z.string().uuid('Not an agent id.') });

/** One structured line per attempt, success or failure. No secrets, no stack. */
function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'backend',
    event: 'agent_display_name_set',
    ...fields,
  }));
}

export async function handleSetAgentDisplayName(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();
  const actorEmail = (req as any).admin?.email ?? '';

  try {
    const { agentId } = ParamsSchema.parse(req.params);
    const { display_name: displayName } = AgentDisplayNameSchema.parse(req.body);

    const result = await setAgentDisplayName(sequelize, actorEmail, agentId, displayName);

    log({
      level: 'info',
      outcome: 'success',
      duration_ms: Date.now() - startedAt,
      actor_email: actorEmail,
      context: { agent_id: agentId, unchanged: result.unchanged },
    });
    res.json(result);
  } catch (err: any) {
    const errorClass = err?.name || err?.constructor?.name || 'Error';
    const duration = Date.now() - startedAt;

    if (err instanceof z.ZodError) {
      log({
        level: 'warn', outcome: 'failure', error_class: 'ValidationError', duration_ms: duration,
        actor_email: actorEmail, context: { issues: err.issues.length },
      });
      // Zod 4 exposes `issues`, not `errors`.
      res.status(400).json({ error: 'Invalid input', issues: err.issues });
      return;
    }

    if (err instanceof AgentNotYoursError) {
      log({
        level: 'warn', outcome: 'failure', error_class: errorClass, duration_ms: duration,
        actor_email: actorEmail, context: { agent_id: req.params.agentId },
      });
      res.status(403).json({ error: err.message });
      return;
    }

    if (err instanceof AgentDisplayNameTakenError) {
      log({
        level: 'info', outcome: 'failure', error_class: errorClass, duration_ms: duration,
        actor_email: actorEmail, context: { agent_id: req.params.agentId, source: err.source },
      });
      res.status(409).json({
        error: err.message,
        taken_name: err.takenName,
        source: err.source,
      });
      return;
    }

    log({
      level: 'error', outcome: 'failure', error_class: errorClass, duration_ms: duration,
      actor_email: actorEmail, context: { message: err?.message },
    });
    res.status(500).json({ error: 'Could not save that name.' });
  }
}
