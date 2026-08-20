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
