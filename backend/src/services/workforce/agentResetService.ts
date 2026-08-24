import { Op } from 'sequelize';
import AiAgent from '../../models/AiAgent';
import AdminUser from '../../models/AdminUser';
import { Ticket } from '../../models';
import type { TicketActorType } from '../../models/Ticket';
import { buildCreatorIdMatchList } from '../agentBlueprint/legacyCreatorAliases';
import { OPEN_TICKET_STATUS_FILTER } from './liveAgentsService';
import { updateTicketStatus } from '../ticketService';

// AI Workforce Reset (2026-08-24) — Ali, live, on the AI Organization page:
// the AI-generated "Strategy Architect" agents create tickets nobody finds
// useful and don't visibly report to anyone; wants to clear their current
// work and deactivate them so he can rebuild the roster deliberately,
// starting from Reese, reactivating agents one at a time. This is the real,
// reversible mechanism: `enabled:false` (never a row DELETE — see
// AiAgent.ts's own `enabled` column, already used elsewhere via
// governanceController.ts::handleUpdateAgentToggle) plus real ticket
// cancellation through the SAME `updateTicketStatus()` every other caller in
// this repo goes through, so every cancelled ticket still gets a real
// `TicketActivity` row and — for a `strategic`-type ticket, since
// `evidenceExpectationService.ts` marks decisions:'expected' for that type —
// a real auto-decision note (`ticketDecisionAutoRecorder.ts`, this session)
// explaining why it closed. Never a raw bulk UPDATE, never a DELETE.
//
// Reuses `buildCreatorIdMatchList()` + `OPEN_TICKET_STATUS_FILTER` — the SAME
// match logic `countOpenTicketsForAgent()` (liveAgentsService.ts) already
// uses for the org chart's own per-card open-ticket count, so "how many
// tickets does this reset cancel" can never silently disagree with what the
// card showed before the reset ran.

export interface AgentResetResult {
  agentId: string;
  agentName: string;
  found: boolean;
  deactivated: boolean;
  ticketsCancelled: number;
  error: string | null;
}

/** Cancels every currently-open ticket belonging to one agent's real identity
 * (its AdminUser id + any legacy creator aliases), via the real
 * `updateTicketStatus()` — never a raw bulk UPDATE. An agent with no linked
 * AdminUser has no ticket identity to match against and correctly cancels 0
 * (matches `countOpenTicketsForAgent()`'s own "no identity -> nothing to
 * count" contract, not an error). Failure-isolated per ticket: one ticket
 * that can't transition (e.g. an invalid-transition race) is skipped, not a
 * fatal error for every other ticket in the batch. */
async function cancelOpenTicketsForAgent(agent: AiAgent, actorId: string): Promise<number> {
  const identity = await AdminUser.findOne({ where: { agent_id: agent.id } });
  if (!identity) return 0;

  const matchList = buildCreatorIdMatchList(identity.id, agent);
  const openTickets = await Ticket.findAll({
    where: {
      status: OPEN_TICKET_STATUS_FILTER,
      [Op.or]: [
        { assigned_to_type: 'ai_staff', assigned_to_id: { [Op.in]: matchList } },
        { created_by_id: { [Op.in]: matchList } },
      ],
    },
  });

  let cancelled = 0;
  for (const ticket of openTickets) {
    try {
      // eslint-disable-next-line no-await-in-loop -- sequential on purpose: each
      // cancellation writes real TicketActivity/ledger/decision-note rows and
      // this batch (a few hundred tickets across 17 agents at most) is a
      // one-time reset action, not a hot path worth parallelizing.
      await updateTicketStatus(ticket.id, 'cancelled', 'human', actorId);
      cancelled += 1;
    } catch (err: any) {
      console.warn(`[agentResetService] Failed to cancel ticket ${ticket.id} for agent ${agent.agent_name}:`, err.message);
    }
  }
  return cancelled;
}

/** Deactivates each given agent (`enabled:false`, reversible) and cancels its
 * currently-open tickets. Per-agent failure isolation: one agent id that
 * doesn't resolve, or one ticket-cancellation failure inside its batch, never
 * aborts the rest of the reset — every agent gets its own real result. */
export async function resetAgents(agentIds: string[], actorId: string): Promise<AgentResetResult[]> {
  const results: AgentResetResult[] = [];
  for (const agentId of agentIds) {
    try {
      // eslint-disable-next-line no-await-in-loop -- one-time admin action over
      // a small, explicit id list (17 agents today), not a hot path.
      const agent = await AiAgent.findByPk(agentId);
      if (!agent) {
        results.push({ agentId, agentName: agentId, found: false, deactivated: false, ticketsCancelled: 0, error: 'Agent not found' });
        continue;
      }

      await agent.update({ enabled: false });
      const ticketsCancelled = await cancelOpenTicketsForAgent(agent, actorId);
      results.push({ agentId, agentName: agent.agent_name, found: true, deactivated: true, ticketsCancelled, error: null });
    } catch (err: any) {
      results.push({ agentId, agentName: agentId, found: true, deactivated: false, ticketsCancelled: 0, error: err.message });
    }
  }
  return results;
}
