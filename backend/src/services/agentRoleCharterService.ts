import AiAgent from '../models/AiAgent';
import AgentRoleCharter from '../models/AgentRoleCharter';
import type { AgentRoleCharterInput } from '../schemas/agentRoleCharterSchema';

// AI Workforce Management, Checkpoint B. Generic by construction — works off
// AiAgent.id, not hardcoded to any one agent (Reese or otherwise), per the
// mission's non-negotiable that new capabilities must be generic.

export interface RoleCharterView {
  agentId: string;
  charter: {
    roleTitle: string;
    mission: string;
    responsibilities: string[];
    kpis: string[];
    updatedByEmail: string;
    updatedAt: Date;
  } | null;
}

/** null return means the agent itself doesn't exist. A real agent with no
 * charter written yet returns { agentId, charter: null } — the honest
 * "not set" state, never a fabricated default title/mission. */
export async function getRoleCharter(agentId: string): Promise<RoleCharterView | null> {
  const agent = await AiAgent.findByPk(agentId, { attributes: ['id'] });
  if (!agent) return null;

  const row = await AgentRoleCharter.findOne({ where: { agent_id: agentId } });
  if (!row) return { agentId, charter: null };

  return {
    agentId,
    charter: {
      roleTitle: row.role_title,
      mission: row.mission,
      responsibilities: row.responsibilities,
      kpis: row.kpis,
      updatedByEmail: row.updated_by_email,
      updatedAt: row.updated_at,
    },
  };
}

export class AgentNotFoundError extends Error {
  readonly error_class = 'AgentNotFoundError' as const;
  readonly status = 404;

  constructor(agentId: string) {
    super(`Agent "${agentId}" does not exist.`);
    this.name = 'AgentNotFoundError';
  }
}

/** Creates or updates the one charter row for this agent. Authorization
 * (is the caller actually allowed to edit this agent's charter) is the
 * route layer's job (requireAgentManagerOrAdmin) — this function trusts
 * that it has already been checked, matching assignTaskToAgent()'s own
 * "auth first, at the route/middleware layer" convention. */
export async function upsertRoleCharter(
  agentId: string,
  input: AgentRoleCharterInput,
  updatedByEmail: string,
): Promise<RoleCharterView> {
  const agent = await AiAgent.findByPk(agentId, { attributes: ['id'] });
  if (!agent) throw new AgentNotFoundError(agentId);

  const [row] = await AgentRoleCharter.upsert({
    agent_id: agentId,
    role_title: input.roleTitle,
    mission: input.mission,
    responsibilities: input.responsibilities,
    kpis: input.kpis,
    updated_by_email: updatedByEmail,
  });

  return {
    agentId,
    charter: {
      roleTitle: row.role_title,
      mission: row.mission,
      responsibilities: row.responsibilities,
      kpis: row.kpis,
      updatedByEmail: row.updated_by_email,
      updatedAt: row.updated_at,
    },
  };
}
