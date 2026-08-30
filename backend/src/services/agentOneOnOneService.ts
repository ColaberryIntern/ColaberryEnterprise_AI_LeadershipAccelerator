import AiAgent from '../models/AiAgent';
import AgentOneOnOne from '../models/AgentOneOnOne';

// AI Workforce Management, Checkpoint D. Generic by construction — works
// off AiAgent.id, not hardcoded to any one agent.

export class AgentNotFoundError extends Error {
  readonly error_class = 'AgentNotFoundError' as const;
  readonly status = 404;

  constructor(agentId: string) {
    super(`Agent "${agentId}" does not exist.`);
    this.name = 'AgentNotFoundError';
  }
}

export class OneOnOneNotFoundError extends Error {
  readonly error_class = 'OneOnOneNotFoundError' as const;
  readonly status = 404;

  constructor(id: string) {
    super(`One-on-one "${id}" does not exist.`);
    this.name = 'OneOnOneNotFoundError';
  }
}

export class OneOnOneAlreadyCompletedError extends Error {
  readonly error_class = 'OneOnOneAlreadyCompletedError' as const;
  readonly status = 400;

  constructor(id: string) {
    super(`One-on-one "${id}" is already completed.`);
    this.name = 'OneOnOneAlreadyCompletedError';
  }
}

export interface AgentOneOnOneView {
  id: string;
  agenda: string;
  outcomeNotes: string | null;
  status: 'scheduled' | 'completed';
  createdByEmail: string;
  heldAt: Date | null;
  createdAt: Date;
}

function toView(row: AgentOneOnOne): AgentOneOnOneView {
  return {
    id: row.id,
    agenda: row.agenda,
    outcomeNotes: row.outcome_notes,
    status: row.status,
    createdByEmail: row.created_by_email,
    heldAt: row.held_at,
    createdAt: row.created_at,
  };
}

/** Authorization is the route layer's job (requireAgentManagerOrAdmin) —
 * same convention as every other service in this mission. Trusts it
 * already happened. */
export async function createOneOnOne(
  agentId: string,
  orgMemberId: string | null,
  createdByEmail: string,
  agenda: string,
): Promise<AgentOneOnOneView> {
  const agent = await AiAgent.findByPk(agentId, { attributes: ['id'] });
  if (!agent) throw new AgentNotFoundError(agentId);

  const row = await AgentOneOnOne.create({
    agent_id: agentId,
    org_member_id: orgMemberId,
    created_by_email: createdByEmail,
    agenda,
    status: 'scheduled',
  });
  return toView(row);
}

/** `null` return means the agent itself doesn't exist. A real agent with
 * zero 1:1s returns an empty array — the honest "none held yet" state, not
 * an error. */
export async function listOneOnOnes(agentId: string): Promise<AgentOneOnOneView[] | null> {
  const agent = await AiAgent.findByPk(agentId, { attributes: ['id'] });
  if (!agent) return null;

  const rows = await AgentOneOnOne.findAll({
    where: { agent_id: agentId },
    order: [['created_at', 'DESC']],
  });
  return rows.map(toView);
}

/** Idempotency: completing an already-completed 1:1 is rejected, not
 * silently overwritten — a real outcome record should never be clobbered
 * by a second call. */
export async function completeOneOnOne(id: string, outcomeNotes: string): Promise<AgentOneOnOneView> {
  const row = await AgentOneOnOne.findByPk(id);
  if (!row) throw new OneOnOneNotFoundError(id);
  if (row.status === 'completed') throw new OneOnOneAlreadyCompletedError(id);

  await row.update({ status: 'completed', outcome_notes: outcomeNotes, held_at: new Date() });
  return toView(row);
}
