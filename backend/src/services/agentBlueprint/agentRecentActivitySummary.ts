import { Op } from 'sequelize';
import AdminUser from '../../models/AdminUser';
import AiAgent from '../../models/AiAgent';
import Ticket from '../../models/Ticket';
import { buildCreatorIdMatchList } from './legacyCreatorAliases';
import { getAgentExplainability } from '../agentExplainabilityService';

// AI Agent Dashboard redesign — Reese's own manager-conversation system
// prompt (agentManagerConversationPrompt.ts) previously carried no real
// data about the agent's own recent work, so "what have you worked on"
// could only be honestly answered "I don't know" — the model was
// explicitly instructed never to invent activity it doesn't know about,
// and it correctly didn't. This is the real, grounded fix: recent real
// tickets (the same match-list query agentDetailService.ts's own
// `tickets` field already uses — reused, not duplicated) and recent real
// ai_events cost/call history (via the already-live, already-curated
// getAgentExplainability(), no new query). An agent with no linked
// AdminUser or no history gets real empty arrays, never fabricated lines.

const RECENT_TICKET_LIMIT = 3;
const RECENT_EVENT_LIMIT = 3;

export interface RecentTicketSummary {
  title: string;
  status: string;
  updatedAt: Date | null;
}

export interface RecentActivitySummary {
  tickets: RecentTicketSummary[];
  events: Array<{ eventType: string; model: string | null; costUsd: number | null; createdAt: Date }>;
}

/** Never throws — a lookup failure here must not break the conversation
 * turn, same fail-safe posture as getActiveDirectiveTexts()/
 * getApprovedMemoryTexts(). Returns real empty arrays on any failure or
 * genuine absence of history, never fabricated activity. */
export async function getRecentActivitySummary(agentId: string): Promise<RecentActivitySummary> {
  try {
    const agent = await AiAgent.findByPk(agentId, { attributes: ['id', 'agent_name'] });
    if (!agent) return { tickets: [], events: [] };

    const adminUser = await AdminUser.findOne({ where: { agent_id: agentId } });
    const tickets = adminUser
      ? await Ticket.findAll({
          where: {
            [Op.or]: [
              { assigned_to_type: 'ai_staff', assigned_to_id: { [Op.in]: buildCreatorIdMatchList(adminUser.id, agent) } },
              { created_by_id: { [Op.in]: buildCreatorIdMatchList(adminUser.id, agent) } },
            ],
          },
          order: [['updated_at', 'DESC']],
          limit: RECENT_TICKET_LIMIT,
        })
      : [];

    const explainability = await getAgentExplainability(agentId);

    return {
      tickets: tickets.map((t: any) => ({ title: t.title, status: t.status, updatedAt: t.updated_at })),
      events: (explainability?.events ?? []).slice(0, RECENT_EVENT_LIMIT).map((e) => ({
        eventType: e.eventType, model: e.model, costUsd: e.costUsd, createdAt: e.createdAt,
      })),
    };
  } catch {
    return { tickets: [], events: [] };
  }
}
