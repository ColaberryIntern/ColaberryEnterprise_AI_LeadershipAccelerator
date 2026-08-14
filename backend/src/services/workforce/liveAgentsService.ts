import { Op } from 'sequelize';
import AdminUser from '../../models/AdminUser';
import AiAgent from '../../models/AiAgent';
import Enrollment from '../../models/Enrollment';
import CommunityMember from '../../models/CommunityMember';
import { Ticket } from '../../models';
import { derivePresence } from '../communityService';
import type { CommunityPresenceStatus } from '../../models/CommunityMember';
import { buildCreatorIdMatchList } from '../agentBlueprint/legacyCreatorAliases';

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
  /** Human-readable name for display (AdminUser.display_name, falling back to
   * agent_name only if display_name is somehow unset). agent_name stays the raw
   * technical identifier — the two are genuinely different concepts; conflating
   * them was the original bug (Ali: raw "cory-engine" shown instead of "Cory
   * Engine — Autonomous Operations"). */
  display_name: string;
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
  agent_display_name: string;
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

    // Agent Alias & Identity Fix — matches EITHER this agent's real AdminUser.id
    // (assigned_to_id, the path every ticket uses going forward) OR any of its
    // known legacy raw creator strings (created_by_id — the ONLY field 100% of
    // this agent's historical tickets ever populated, verified live against
    // production). An agent with zero legacy aliases (e.g. Reese) gets a match
    // list of exactly its own id, so this query is byte-for-byte equivalent to
    // the original for agents that never needed the alias fallback.
    const matchList = buildCreatorIdMatchList(adminUser.id, agent);
    const ticketCount = await Ticket.count({
      where: {
        [Op.or]: [
          { assigned_to_type: 'ai_staff', assigned_to_id: { [Op.in]: matchList } },
          { created_by_id: { [Op.in]: matchList } },
        ],
      },
    });

    results.push({
      id: agent.id,
      agent_name: agent.agent_name,
      display_name: adminUser.display_name || agent.agent_name,
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
  const agentsById = new Map(agents.map((a) => [a.id, a]));

  // Agent Alias & Identity Fix — one flat lookup map from EVERY identifier a
  // ticket could carry (a real AdminUser.id, used going forward, OR any legacy
  // raw creator string, used historically) to that agent's meta. The two id
  // spaces never collide in practice (UUIDs vs. short process names), so a flat
  // map is safe and avoids a per-agent query. An agent with zero legacy aliases
  // (Reese) contributes exactly one entry — itself — so this is a pure superset
  // of the original assigned_to_id-only behavior.
  const metaByMatchId = new Map<string, { agent_id: string; agent_name: string; agent_display_name: string }>();
  const allMatchIds: string[] = [];
  for (const adminUser of adminUsers) {
    const agent = agentsById.get(adminUser.agent_id as string);
    if (!agent) continue;
    const meta = {
      agent_id: agent.id,
      agent_name: agent.agent_name,
      agent_display_name: adminUser.display_name || agent.agent_name,
    };
    for (const matchId of buildCreatorIdMatchList(adminUser.id, agent)) {
      metaByMatchId.set(matchId, meta);
      allMatchIds.push(matchId);
    }
  }

  const tickets = await Ticket.findAll({
    where: {
      [Op.or]: [
        { assigned_to_type: 'ai_staff', assigned_to_id: { [Op.in]: allMatchIds } },
        { created_by_id: { [Op.in]: allMatchIds } },
      ],
    },
    order: [['updated_at', 'DESC']],
    limit,
  });

  const unknownMeta = { agent_id: '', agent_name: 'Unknown Agent', agent_display_name: 'Unknown Agent' };
  return tickets.map((t: Ticket) => {
    // A ticket matched the query above via EITHER assigned_to_id OR created_by_id
    // (never both meaningfully — legacy tickets never populate assigned_to_id, and
    // forward-fixed tickets populate both to the same real id) — check assigned_to_id
    // first (the going-forward path), then created_by_id (the historical path).
    const meta = metaByMatchId.get(t.assigned_to_id || '') || metaByMatchId.get(t.created_by_id || '') || unknownMeta;
    return {
      agent_id: meta.agent_id,
      agent_name: meta.agent_name,
      agent_display_name: meta.agent_display_name,
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
