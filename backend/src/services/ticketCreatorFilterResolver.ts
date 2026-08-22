import { Op } from 'sequelize';
import AdminUser from '../models/AdminUser';
import AiAgent from '../models/AiAgent';
import { buildCreatorIdMatchList } from './agentBlueprint/legacyCreatorAliases';

/**
 * ticketCreatorFilterResolver — Org Chart v4 (2026-08-20, session
 * CC-20260818-x4nk continued). Ali: every AI Staff/AI Leadership card on the
 * org chart gets a button that opens the ticket board filtered to that
 * agent's tickets. This module resolves the org-chart card's `agent_name`
 * (already a real field on every `OrgChartLeadershipAgent`/
 * `OrgChartStaffAgent`) to the FULL set of ticket identifiers that agent
 * could appear under — `created_by_id` (the raw agent_name string, for
 * legacy/autonomous creators) AND `assigned_to_id` (a linked AdminUser's id,
 * for the `ai_staff`-type agents built via the blueprint pattern) — reusing
 * `buildCreatorIdMatchList()`, the SAME primitive `orgChartService.ts`'s
 * `fetchOpenTicketCountsByAgent()` and `liveAgentsService.ts` already use to
 * compute each card's "N open tickets" badge. Reusing it here keeps the
 * filtered board and that badge count consistent — the exact class of
 * "looked fixed in isolation, wasn't" gap this run's own instructions warn
 * against repeating.
 *
 * Kept as its own module rather than added to `ticketService.ts` (which is
 * already 549 lines, over CLAUDE.md's 500-line hard ceiling — see this run's
 * execution-contract.md) so this feature's real logic doesn't grow an
 * already-oversize file.
 */

/**
 * Resolves an org-chart card's `agent_name` to every ticket identifier that
 * agent could appear under. Never throws — a miss degrades to `[creator]`
 * (an exact-match fallback on the literal value given), matching this
 * codebase's existing "fail open to the literal value" posture for
 * unregistered/legacy creator strings (see `resolveActorDisplayName.ts`'s
 * identical non-UUID passthrough). Empty/whitespace-only input returns `[]`
 * — a deliberate boundary so an empty `creator` query param can never widen
 * into a wildcard match across every ticket on the board.
 */
export async function resolveCreatorMatchIds(creator: string): Promise<string[]> {
  const trimmed = creator.trim();
  if (!trimmed) return [];

  const agent = await AiAgent.findOne({ where: { agent_name: trimmed } });
  if (!agent) return [trimmed];

  const matchIds = new Set<string>([trimmed, agent.id]);

  const linkedAdmin = await AdminUser.findOne({ where: { agent_id: agent.id } });
  if (linkedAdmin) {
    for (const id of buildCreatorIdMatchList(linkedAdmin.id, agent)) matchIds.add(id);
  }

  return Array.from(matchIds);
}

/** One roster entry the Tickets page's Creator filter dropdown can select. */
export interface TicketCreatorOption {
  agent_name: string;
  display_name: string;
}

/**
 * listTicketCreatorOptions — Org Chart v5 (2026-08-21, session
 * CC-20260818-x4nk continued). Ali: "when we drill through from this page
 * to tickets, I want to be able to add a filter to the entire sheet
 * (tickets) by the selection." The `?creator=` plumbing already existed
 * (resolveCreatorMatchIds above, shipped in v4), but the Tickets page could
 * only DISPLAY the value the org chart handed it (the raw internal
 * `agent_name`, e.g. `cory-engine`) and could only CLEAR it, never change it
 * to a different agent from within the page. This function backs a real
 * `<select>` there.
 *
 * Deliberately mirrors `orgChartService.ts`'s `fetchHierarchyAgents()` query
 * (`AiAgent` rows with a configured `reports_to_type`) rather than inventing
 * new roster logic — this is the EXACT set of agents the org chart's
 * Leadership+Staff cards render as ticket-filter buttons, so the dropdown's
 * options and the org-chart button's `?creator=` value can never disagree.
 * Zero N+1: one `AiAgent.findAll` + one batched `AdminUser.findAll`, same
 * shape as `orgChartService.fetchAgentIdentities()`. Falls back to
 * `agent_name` when no linked AdminUser exists (a legacy/autonomous creator
 * with no blueprint identity row) rather than omitting the agent — every
 * card that can filter tickets must have a corresponding, selectable option
 * here, never a silent gap.
 */
export async function listTicketCreatorOptions(): Promise<TicketCreatorOption[]> {
  const agents = await AiAgent.findAll({ where: { reports_to_type: { [Op.ne]: null } } });
  if (agents.length === 0) return [];

  const admins = await AdminUser.findAll({ where: { agent_id: { [Op.in]: agents.map((a) => a.id) } } });
  const displayNameByAgentId = new Map(admins.map((a) => [a.agent_id as string, a.display_name]));

  return agents
    .map((agent) => ({
      agent_name: agent.agent_name,
      display_name: displayNameByAgentId.get(agent.id) || agent.agent_name,
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}
