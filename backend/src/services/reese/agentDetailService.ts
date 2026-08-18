import { Op } from 'sequelize';
import AiAgent from '../../models/AiAgent';
import AdminUser from '../../models/AdminUser';
import Enrollment from '../../models/Enrollment';
import CommunityMember from '../../models/CommunityMember';
import { Ticket } from '../../models';
import { derivePresence } from '../communityService';
import type { CommunityPresenceStatus } from '../../models/CommunityMember';
import { buildCreatorIdMatchList } from '../agentBlueprint/legacyCreatorAliases';
import { deriveAgentCapabilities } from './agentToolCapabilities';

// Agent Detail — the transparency page Ali asked for: real identity, real
// system prompt, real tools, live status, real linked ticket activity. Written
// generically (any AiAgent id, not hardcoded to Reese) so this is genuinely the
// reusable blueprint for every future agent, not a one-off Reese page.
//
// Reuses derivePresence() (communityService.ts) — the SAME function the real
// People panel uses — rather than reinventing presence logic here.
export interface AgentDetailResult {
  agent: {
    id: string;
    agent_name: string;
    agent_type: string;
    category: string | null;
    description: string | null;
    system_prompt: string | null;
    tools_granted: string[] | null;
    persona_version: string | null;
    enabled: boolean;
    created_at: Date | null;
  };
  identity: {
    admin_user_id: string;
    email: string;
    display_name: string | null;
    is_ai_operated: boolean;
  } | null;
  live_status: CommunityPresenceStatus | 'unknown';
  tickets: Array<{
    id: string;
    ticket_number: number | null;
    title: string;
    status: string;
    priority: string;
    type: string;
    created_at: Date | null;
    updated_at: Date | null;
  }>;
  /** What this agent reads / produces — Agent Detail transparency, part 2
   * (2026-08-18). Derived from the agent's real, live `tools_granted` (declared
   * capability, via deriveAgentCapabilities()) UNIONED with the real, live
   * DISTINCT ticket types it has actually created (observed behavior, via an
   * unlimited grouped query — not the capped/ordered `tickets` list above).
   * Doubly grounded, never hand-written prose: change tools_granted or what the
   * agent actually creates, and this self-corrects with zero code change. */
  capabilities: {
    reads: string[];
    produces: string[];
    undocumented_tools: string[];
    produced_ticket_types: string[];
  };
}

const MAX_TICKETS = 50;

export async function getAgentDetail(agentId: string): Promise<AgentDetailResult | null> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) return null;

  const adminUser = await AdminUser.findOne({ where: { agent_id: agent.id } });

  let liveStatus: CommunityPresenceStatus | 'unknown' = 'unknown';
  if (adminUser) {
    const enrollment = await Enrollment.findOne({ where: { email: adminUser.email } });
    if (enrollment) {
      const member = await CommunityMember.findOne({ where: { enrollment_id: enrollment.id } });
      if (member) liveStatus = derivePresence(member.last_active_at);
    }
  }

  // The core "who is this agent targeting, why, and follow up over time" view —
  // only tickets actually belonging to THIS agent's real staff identity, never
  // every ticket in the system. Agent Alias & Identity Fix: matches EITHER the
  // real AdminUser.id (assigned_to_id, going forward) OR any of this agent's
  // known legacy raw creator strings (created_by_id — the only field this
  // agent's historical tickets may have ever populated, e.g. cory-engine's
  // 9,606 tickets). An agent with zero legacy aliases (Reese) gets a match list
  // of exactly its own id, so this is unchanged for Reese.
  const tickets = adminUser
    ? await Ticket.findAll({
        where: {
          [Op.or]: [
            { assigned_to_type: 'ai_staff', assigned_to_id: { [Op.in]: buildCreatorIdMatchList(adminUser.id, agent) } },
            { created_by_id: { [Op.in]: buildCreatorIdMatchList(adminUser.id, agent) } },
          ],
        },
        order: [['created_at', 'DESC']],
        limit: MAX_TICKETS,
      })
    : [];

  // Agent Detail transparency, part 2 (2026-08-18) — the real, live, DISTINCT
  // ticket types this agent has ever created/been assigned, UNLIMITED (not the
  // capped-50/DESC `tickets` list above, which can miss older types entirely).
  // Same match-list where-clause as the tickets query, so "produces" is grounded
  // in the exact same real data the Ticket activity table already shows.
  const producedTicketTypeRows = adminUser
    ? await Ticket.findAll({
        attributes: ['type'],
        where: {
          [Op.or]: [
            { assigned_to_type: 'ai_staff', assigned_to_id: { [Op.in]: buildCreatorIdMatchList(adminUser.id, agent) } },
            { created_by_id: { [Op.in]: buildCreatorIdMatchList(adminUser.id, agent) } },
          ],
        },
        group: ['type'],
      })
    : [];
  const capabilities = deriveAgentCapabilities(agent.tools_granted);

  return {
    agent: {
      id: agent.id,
      agent_name: agent.agent_name,
      agent_type: agent.agent_type,
      category: agent.category ?? null,
      description: agent.description ?? null,
      system_prompt: agent.system_prompt ?? null,
      tools_granted: agent.tools_granted ?? null,
      persona_version: agent.persona_version ?? null,
      enabled: agent.enabled,
      created_at: agent.created_at ?? null,
    },
    identity: adminUser
      ? {
          admin_user_id: adminUser.id,
          email: adminUser.email,
          display_name: adminUser.display_name ?? null,
          is_ai_operated: adminUser.is_ai_operated,
        }
      : null,
    live_status: liveStatus,
    tickets: tickets.map((t: any) => ({
      id: t.id,
      ticket_number: t.ticket_number ?? null,
      title: t.title,
      status: t.status,
      priority: t.priority,
      type: t.type,
      created_at: t.created_at ?? null,
      updated_at: t.updated_at ?? null,
    })),
    capabilities: {
      reads: capabilities.reads,
      produces: capabilities.produces,
      undocumented_tools: capabilities.undocumentedTools,
      produced_ticket_types: producedTicketTypeRows.map((t: any) => t.type),
    },
  };
}
