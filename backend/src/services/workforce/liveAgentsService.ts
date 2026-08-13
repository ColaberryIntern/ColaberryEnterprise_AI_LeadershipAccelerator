import { Op } from 'sequelize';
import AdminUser from '../../models/AdminUser';
import AiAgent from '../../models/AiAgent';
import Enrollment from '../../models/Enrollment';
import CommunityMember from '../../models/CommunityMember';
import { Ticket } from '../../models';
import { derivePresence } from '../communityService';
import type { CommunityPresenceStatus } from '../../models/CommunityMember';

// liveAgentsService — powers the Workforce OS page's "Live Agents" section and
// Activity Timeline (Ali: "I want to see Reese there... a timeline of all the
// agents' work"). Generic by construction, never Reese-hardcoded: a real AiAgent
// row counts as "live" here if and only if it has a linked AdminUser with
// is_ai_operated=true and a non-null agent_id — the exact marker
// agentBlueprint/agentIdentitySeed.ts's seedAgentIdentity() sets for every agent it
// builds (see AdminUser.ts's "Reese Phase 1 — additive staff-identity columns"
// comment). Reese is the first and, as of this writing, only row that matches —
// any future agent built the same way appears here automatically, zero code change.
//
// This file must NEVER import backend/src/services/workforce/orgRegistry.ts (the
// static AI_ORG conceptual-director roster) or attribute any activity to it — the
// static Directors have no real ProofDesk data, so an honest empty/Reese-only
// result is correct, not a bug. See __tests__/liveAgentsService.test.ts for the
// test that enforces this via a source-grep, not just a comment.

export interface LiveAgent {
  id: string;
  agent_name: string;
  agent_type: string;
  category: string | null;
  description: string | null;
  enabled: boolean;
  live_status: CommunityPresenceStatus | 'unknown';
  ticket_count: number;
}

export interface LiveAgentActivityEvent {
  agent_id: string;
  agent_name: string;
  ticket_id: string;
  ticket_number: number | null;
  title: string;
  type: string;
  status: string;
  priority: string;
  occurred_at: Date | null;
}

const DEFAULT_ACTIVITY_LIMIT = 30;

/** Every real AdminUser row built via the blueprint pattern (see header comment). */
async function findBlueprintAdminUsers() {
  return AdminUser.findAll({ where: { is_ai_operated: true, agent_id: { [Op.ne]: null } } });
}

export async function listLiveAgents(): Promise<LiveAgent[]> {
  const adminUsers = await findBlueprintAdminUsers();
  if (adminUsers.length === 0) return [];

  const agentIds = adminUsers.map((u) => u.agent_id as string);
  const agents = await AiAgent.findAll({ where: { id: { [Op.in]: agentIds } } });
  const agentsById = new Map(agents.map((a) => [a.id, a]));

  const results: LiveAgent[] = [];
  for (const adminUser of adminUsers) {
    const agent = agentsById.get(adminUser.agent_id as string);
    // An AdminUser whose agent_id points at a since-deleted AiAgent row is a data
    // inconsistency this service should skip, not fabricate a card for.
    if (!agent) continue;

    let liveStatus: CommunityPresenceStatus | 'unknown' = 'unknown';
    const enrollment = await Enrollment.findOne({ where: { email: adminUser.email } });
    if (enrollment) {
      const member = await CommunityMember.findOne({ where: { enrollment_id: enrollment.id } });
      if (member) liveStatus = derivePresence(member.last_active_at);
    }

    const ticketCount = await Ticket.count({
      where: { assigned_to_type: 'ai_staff', assigned_to_id: adminUser.id },
    });

    results.push({
      id: agent.id,
      agent_name: agent.agent_name,
      agent_type: agent.agent_type,
      category: agent.category ?? null,
      description: agent.description ?? null,
      enabled: agent.enabled,
      live_status: liveStatus,
      ticket_count: ticketCount,
    });
  }
  return results;
}

export async function listLiveAgentActivity(limit: number = DEFAULT_ACTIVITY_LIMIT): Promise<LiveAgentActivityEvent[]> {
  const adminUsers = await findBlueprintAdminUsers();
  if (adminUsers.length === 0) return [];

  const agentIds = adminUsers.map((u) => u.agent_id as string);
  const agents = await AiAgent.findAll({ where: { id: { [Op.in]: agentIds } } });
  const agentNameById = new Map(agents.map((a) => [a.id, a.agent_name]));
  const adminUserMeta = new Map(
    adminUsers.map((u) => [
      u.id,
      { agent_id: u.agent_id as string, agent_name: agentNameById.get(u.agent_id as string) || 'Unknown Agent' },
    ])
  );

  // Reuses the exact query shape backend/src/services/reese/agentDetailService.ts
  // already uses for one agent's ticket list (assigned_to_type='ai_staff',
  // assigned_to_id=<AdminUser.id>), generalized to an IN-list across every
  // blueprint agent's AdminUser id rather than reinvented.
  const adminUserIds = adminUsers.map((u) => u.id);
  const tickets = await Ticket.findAll({
    where: { assigned_to_type: 'ai_staff', assigned_to_id: { [Op.in]: adminUserIds } },
    order: [['updated_at', 'DESC']],
    limit,
  });

  return tickets.map((t: Ticket) => {
    // The query above filters assigned_to_id to the resolved blueprint AdminUser id
    // list, so it's never actually null here — but the Ticket model types the
    // column string | null, so the `|| ''` keeps this a safe Map.get() key lookup
    // (a no-op fallback to the "Unknown Agent" default below) rather than an
    // unjustified `as string` cast.
    const meta = adminUserMeta.get(t.assigned_to_id || '') || { agent_id: '', agent_name: 'Unknown Agent' };
    return {
      agent_id: meta.agent_id,
      agent_name: meta.agent_name,
      ticket_id: t.id,
      ticket_number: t.ticket_number ?? null,
      title: t.title,
      type: t.type,
      status: t.status,
      priority: t.priority,
      occurred_at: t.updated_at ?? null,
    };
  });
}
