import type { Request, Response } from 'express';
import { z } from 'zod';
import { sequelize } from '../config/database';
import {
  InstructionRefusedError,
  loadInstructionHistory,
  recordInstruction,
} from '../services/agentDomain/capabilityInstructionService';
import {
  INSTRUCTIONS_CLEARED,
  INSTRUCTIONS_MAX,
  NO_INSTRUCTIONS_RECORDED,
  inForce,
  isCleared,
} from '../services/agentDomain/capabilityInstructionContract';

/**
 * AF11.14 — read and set the standing instructions for one capability on one agent.
 *
 * ## THE ACTOR IS THE VERIFIED CALLER, NEVER THE BODY
 *
 * The whole value of this record is that it says who changed how an agent behaves in production.
 * A body-supplied author would make that field worth nothing, and it is the same rule
 * `toolRequestConversationRoutes.ts` states about message authorship.
 *
 * ## POSTING AN EMPTY STRING IS A REAL ACTION
 *
 * It clears the instructions and records that somebody did so. It is not the same as never having
 * set any, and the GET distinguishes the two in its response rather than returning an empty string
 * for both.
 */

const Body = z.object({
  instructions: z.string().max(INSTRUCTIONS_MAX + 1).nullish(),
});

function ids(req: Request): { agentId: string; capabilityId: string } {
  return {
    agentId: String(req.params.id ?? '').trim(),
    capabilityId: String(req.params.capabilityId ?? '').trim(),
  };
}

export async function handleGetCapabilityInstructions(
  req: Request,
  res: Response,
): Promise<void> {
  const { agentId, capabilityId } = ids(req);
  const history = await loadInstructionHistory(sequelize, agentId, capabilityId);
  const current = inForce(history);

  res.json({
    agent_id: agentId,
    capability_id: capabilityId,
    /** Null when nobody ever set any, and null when they were cleared — `state` tells them apart. */
    instructions: current && !isCleared(current) ? current.instructions : null,
    /**
     * Three states, never two. A cleared instruction and an unset one look identical in the text
     * and are different facts about a production agent.
     */
    state: current === null ? 'never_set' : (isCleared(current) ? 'cleared' : 'in_force'),
    set_by_identity: current?.set_by_identity ?? null,
    set_at: current?.created_at ?? null,
    note: current === null
      ? NO_INSTRUCTIONS_RECORDED
      : (isCleared(current) ? INSTRUCTIONS_CLEARED : ''),
    /** Every edit, newest first, each with who and when. */
    history: history.map((h) => ({
      instructions: h.instructions,
      set_by_identity: h.set_by_identity,
      set_at: h.created_at,
      cleared: h.instructions.trim().length === 0,
    })),
  });
}

export async function handleSetCapabilityInstructions(
  req: Request,
  res: Response,
): Promise<void> {
  const started = Date.now();
  const actor = (req as any).admin?.email ?? '';
  const { agentId, capabilityId } = ids(req);

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: `Keep standing instructions under ${INSTRUCTIONS_MAX} characters.`,
      code: 'bad_request',
    });
    return;
  }

  try {
    const entry = await recordInstruction(sequelize, {
      agentId,
      capabilityId,
      instructions: parsed.data.instructions ?? '',
      setByIdentity: actor,
    });

    const cleared = entry.instructions.trim().length === 0;
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'backend',
      event: 'capability_instructions_set',
      outcome: 'success',
      duration_ms: Date.now() - started,
      actor_email: actor,
      // The TEXT is not logged. It is operating instructions for an agent, and the log is not
      // where a reader should be going to find out what is in force.
      context: { agent_id: agentId, capability_id: capabilityId, cleared, length: entry.instructions.length },
    }));

    res.status(201).json({
      agent_id: agentId,
      capability_id: capabilityId,
      instructions: cleared ? null : entry.instructions,
      state: cleared ? 'cleared' : 'in_force',
      set_by_identity: entry.set_by_identity,
      set_at: entry.created_at,
      note: cleared
        ? INSTRUCTIONS_CLEARED
        : 'In force from now on. The agent is handed these with the grant every time it runs.',
    });
  } catch (e) {
    if (e instanceof InstructionRefusedError) {
      res.status(400).json({ error: 'Those instructions were not recorded.', issues: e.issues });
      return;
    }
    throw e;
  }
}
