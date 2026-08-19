import AdminUser from '../models/AdminUser';
import AiAgent from '../models/AiAgent';
import type { TicketActorType } from '../models/Ticket';
import { TicketCreatorNotReportableError } from './errors/ticketCreatorErrors';

// Agent Ticket Standard — "every ticket must have a home" (Ali, live, 2026-08-18,
// session CC-20260818-x4nk). Resolves a ticket creator (created_by_type,
// created_by_id) to the real AiAgent row it corresponds to, so callers can read
// `reports_to_org_member_id` off it.
//
// Extracted into its own module (not inlined in ticketService.ts, which is
// already near CLAUDE.md's 500-line file ceiling — see getTicketStats()'s own
// extraction into ticketStatsService.ts for the exact same precedent) so
// backend/src/scripts/backfillTicketReportsToAssignee.ts can reuse the IDENTICAL
// resolution logic `createTicket()` enforces, rather than re-implementing it and
// risking the two drifting apart.
//
// Repository grounding (plan-audit cycle 1's finding, re-verified against real
// call sites, not assumed): the resolution path is NOT uniform across actor
// types.
//   - 'agent' / 'cory': created_by_id IS the real, registered AiAgent.agent_name
//     string directly (confirmed against autonomousEngine.ts,
//     departmentInitiativeEngine.ts, and every live 'agent'/'cory' creator seen
//     in production — CoryBrain, cory-engine, AlumniNetworkArchitect, etc).
//   - 'ai_staff': created_by_id is an AdminUser id, NOT an agent_name (confirmed
//     against agentBlueprint/agentTicketLinkService.ts's ensureAgentTicketForRoom()
//     and reese/reeseAutonomousOutreachService.ts — both pass
//     getReeseAdminUserId()'s result). Resolve via AdminUser.agent_id.
//   - 'human': never resolved here — createTicket() bypasses this resolver
//     entirely for human-created tickets (a human filing a ticket via the admin
//     UI does not need a reports_to chain; only AI creators do).

export async function resolveCreatorAiAgent(
  createdByType: TicketActorType,
  createdById: string,
): Promise<AiAgent | null> {
  if (createdByType === 'agent' || createdByType === 'cory') {
    return AiAgent.findOne({ where: { agent_name: createdById } });
  }

  if (createdByType === 'ai_staff') {
    const admin = await AdminUser.findByPk(createdById, { attributes: ['agent_id'] });
    if (!admin?.agent_id) return null;
    return AiAgent.findByPk(admin.agent_id);
  }

  // 'human' (and any future actor type) — this resolver has nothing to resolve;
  // callers must gate on createdByType === 'human' themselves before calling in,
  // per the Agent Ticket Standard's "every AGENT must report to a human" scope
  // (a human creating their own ticket is not in scope for this chain).
  return null;
}

// AI Leadership / AI Staff hierarchy (Ali, live, 2026-08-19). An agent's
// reports_to now resolves to EITHER a human directly (AI Leadership) OR
// another agent (AI Staff, reporting through a leadership agent) — see
// reports_to_type/reports_to_id on AiAgent.ts. A ticket's real assignee must
// always be a human, however many hops the chain takes to get there, so this
// walks reports_to_type='agent' links until it lands on reports_to_type='human'.
//
// MAX_CHAIN_DEPTH is a cycle/misconfiguration guard, not a design assumption —
// today's real data is only ever 2 hops (Staff -> Leadership -> Human) but
// nothing here hardcodes "exactly 2"; a future 3rd tier works without a code
// change. 5 is a generous ceiling for a structure with 23 real agents; hitting
// it means a cycle or a broken chain, and this resolver fails closed (returns
// null) rather than looping forever or guessing.
const MAX_CHAIN_DEPTH = 5;

/** Result of a full reports_to chain walk: the resolved human (if any) plus a
 * human-readable trail of every hop taken, ending in '[human]', '[dangling]',
 * '[unset]', or being truncated by the depth guard (see MAX_CHAIN_DEPTH). Used
 * by AgentDetailPage's "Reports to" section (org-chart hierarchy build,
 * 2026-08-19) to show an agent's own real chain, not just the resolved id. */
export interface ReportsToChainResult {
  resolvedHumanId: string | null;
  trail: string[];
}

/**
 * Walks an AiAgent's reports_to chain to the real human at the end of it,
 * returning both the resolved id AND the human-readable trail of hops taken.
 * This is the ONE canonical recursive implementation of the walk —
 * resolveReportsToHuman() below is a thin wrapper over this, so there is
 * exactly one place this recursion is written (org-chart hierarchy build,
 * 2026-08-19 — previously `resolveReportsToHuman()` had the only copy of this
 * logic and `validateAgentTicketStandard.ts` had a separate, parallel
 * `walkReportsToChain()` duplicate for trail output; unifying THAT second
 * duplicate into this one is a logged follow-up, not done in this change —
 * see the org-chart run's execution-contract.md Out-of-scope section).
 */
export async function resolveReportsToChainWithTrail(
  agent: AiAgent,
  trail: string[] = [],
  depth = 0,
): Promise<ReportsToChainResult> {
  if (depth >= MAX_CHAIN_DEPTH) return { resolvedHumanId: null, trail };

  if (agent.reports_to_type === 'human' && agent.reports_to_id) {
    return { resolvedHumanId: agent.reports_to_id, trail: [...trail, `${agent.agent_name} (agent) -> [human]`] };
  }

  if (agent.reports_to_type === 'agent' && agent.reports_to_id) {
    const nextAgent = await AiAgent.findByPk(agent.reports_to_id);
    if (!nextAgent) {
      return { resolvedHumanId: null, trail: [...trail, `${agent.agent_name} (agent) -> [dangling]`] };
    }
    return resolveReportsToChainWithTrail(nextAgent, [...trail, `${agent.agent_name} (agent)`], depth + 1);
  }

  return { resolvedHumanId: null, trail: [...trail, `${agent.agent_name} (agent) -> [unset]`] };
}

/**
 * Walks an AiAgent's reports_to chain to the real human at the end of it.
 * Returns the resolved org_members.id, or null if the chain is broken,
 * unset, or exceeds MAX_CHAIN_DEPTH (treated the same as "no reports_to" by
 * the caller — see enforceReportsToGate() below, which rejects either way).
 * Thin wrapper over resolveReportsToChainWithTrail() — see its comment for
 * why the trail-returning version is the one canonical implementation.
 */
export async function resolveReportsToHuman(
  agent: AiAgent,
  depth = 0,
): Promise<string | null> {
  const { resolvedHumanId } = await resolveReportsToChainWithTrail(agent, [], depth);
  return resolvedHumanId;
}

/**
 * The full "every ticket must have a home" gate, extracted out of
 * ticketService.createTicket() (which was already over CLAUDE.md's 500-line
 * hard ceiling before this change — this extraction is the required split, not
 * an optional refactor) so createTicket() itself stays a thin caller. Returns
 * the resolved human org_members.id to stamp as the ticket's assignee (walking
 * the AI Leadership / AI Staff chain via resolveReportsToHuman() above — this
 * may be the creator's own direct human target, or a human several hops up
 * through one or more leadership agents), or null when createdByType is
 * 'human' (no gate applies — see resolveCreatorAiAgent()'s own header comment
 * for why). Throws TicketCreatorNotReportableError BEFORE any DB write for
 * every other unresolved case — never a silent no-op.
 */
export async function enforceReportsToGate(
  createdByType: TicketActorType,
  createdById: string,
): Promise<string | null> {
  if (createdByType === 'human') return null;

  const creatorAgent = await resolveCreatorAiAgent(createdByType, createdById);
  if (!creatorAgent) {
    throw new TicketCreatorNotReportableError({ createdByType, createdById, reason: 'unregistered' });
  }
  const resolvedHumanId = await resolveReportsToHuman(creatorAgent);
  if (!resolvedHumanId) {
    throw new TicketCreatorNotReportableError({ createdByType, createdById, reason: 'no_reports_to' });
  }
  return resolvedHumanId;
}
