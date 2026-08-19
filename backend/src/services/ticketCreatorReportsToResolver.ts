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

/**
 * The full "every ticket must have a home" gate, extracted out of
 * ticketService.createTicket() (which was already over CLAUDE.md's 500-line
 * hard ceiling before this change — this extraction is the required split, not
 * an optional refactor) so createTicket() itself stays a thin caller. Returns
 * the resolved reports_to_org_member_id to stamp as the ticket's assignee, or
 * null when createdByType is 'human' (no gate applies — see
 * resolveCreatorAiAgent()'s own header comment for why). Throws
 * TicketCreatorNotReportableError BEFORE any DB write for every other
 * unresolved case — never a silent no-op.
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
  if (!creatorAgent.reports_to_org_member_id) {
    throw new TicketCreatorNotReportableError({ createdByType, createdById, reason: 'no_reports_to' });
  }
  return creatorAgent.reports_to_org_member_id;
}
