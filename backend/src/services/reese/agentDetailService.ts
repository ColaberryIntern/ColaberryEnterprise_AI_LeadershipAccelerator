import { Op } from 'sequelize';
import AiAgent from '../../models/AiAgent';
import AdminUser from '../../models/AdminUser';
import Enrollment from '../../models/Enrollment';
import CommunityMember from '../../models/CommunityMember';
import OrgMember from '../../models/OrgMember';
import { Ticket } from '../../models';
import { derivePresence } from '../communityService';
import type { CommunityPresenceStatus } from '../../models/CommunityMember';
import { buildCreatorIdMatchList } from '../agentBlueprint/legacyCreatorAliases';
import { countOpenTicketsForAgent, getLastTicketActivityForAgent } from '../workforce/liveAgentsService';
import { deriveAgentCapabilities } from './agentToolCapabilities';
import { resolveReportsToChainWithTrail } from '../ticketCreatorReportsToResolver';

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
    /** AI Workforce Reset, Phase C (2026-08-24) — the Permitted dimension of
     * the Trust Contract: docs/ai-governance/abac-design.md's 4-level
     * ladder, `null` for an agent never yet reactivated through that flow.
     * Purely declarative — not enforced anywhere yet. */
    autonomy_level: 'observe' | 'suggest' | 'act_audited' | 'communicate' | null;
  };
  identity: {
    admin_user_id: string;
    email: string;
    display_name: string | null;
    is_ai_operated: boolean;
  } | null;
  live_status: CommunityPresenceStatus | 'unknown';
  /** The agent's TRUE open-ticket count (Ticket Count Sync fix, 2026-08-21, session
   * CC-20260818-x4nk continued) — computed via the shared `countOpenTicketsForAgent()`
   * (the SAME query `orgChartService.ts`'s Leadership/Staff card badges and
   * `liveAgentsService.ts`'s Live Agents grid use), NOT derived from the `tickets`
   * array below. `tickets` is capped at `MAX_TICKETS` (most-recent-first) for display,
   * so for any agent whose true ticket volume exceeds that cap, `tickets.filter(open
   * status).length` would undercount — this field is the honest, uncapped answer. `0`
   * when there's no linked `adminUser`, matching `tickets`' own fallback below. */
  open_ticket_count: number;
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
    /** Per-tool breakdown of the same reads/produces facts, in tools_granted
     * order — lets AgentDetailPage show which tool a given fact came from
     * instead of only the flattened union above (2026-08-23 drill-down ask). */
    by_tool: Array<{ tool: string; reads: string[]; produces: string[]; documented: boolean }>;
  };
  /** This agent's own real reports_to chain (org-chart hierarchy build,
   * 2026-08-19) — the "Reports to" section on AgentDetailPage. `null` only
   * when the agent has no `reports_to_type` configured at all (the common
   * case for the many non-ticket-creating AiAgent rows this endpoint can
   * still be called on); never fabricated. Reuses
   * ticketCreatorReportsToResolver.ts's resolveReportsToChainWithTrail() —
   * the SAME chain-walk ticketService.createTicket() gates on. */
  reports_to: {
    trail: string[];
    resolved_human: { id: string; name: string; email: string } | null;
    /** The DIRECT next hop, when it's another agent (AI Staff -> AI
     * Leadership) — real id + name so AgentDetailPage can link straight to
     * that agent's own detail page (Ali, 2026-08-23: "I'd like to have a
     * link to the agent they report to"). `null` when this agent reports
     * directly to a human (resolved_human already covers that case), or
     * when the configured reports_to_id doesn't resolve to a real agent row
     * (disclosed honestly, never a dead link). */
    immediate_agent: { id: string; name: string } | null;
  } | null;
  /** Trust Contract (2026-08-24) — Ali, live: "All Agents should have a trust
   * contract based on [Trust Before Intelligence]." Grounded in that book's
   * real INPACT(tm) framework, not an invented shape: this field is the
   * "Instant" dimension (is this agent actually running, on schedule,
   * reliably) — every value is a real, pre-existing `AiAgent` column that was
   * never surfaced anywhere before this. The Permitted (tools_granted),
   * Transparent (reports_to), and Contextual (capabilities.reads) dimensions
   * already exist as their own top-level fields above; the frontend groups
   * all four under one Trust Contract section rather than this endpoint
   * duplicating them here. Never fabricated: an agent invoked outside the
   * generic runAgent() scheduler wrapper (e.g. Reese, InboxCaseEngine — real,
   * high-volume identity-only registrations, not cron-tracked) honestly shows
   * null/zero rather than a guessed value. */
  trust_contract: {
    trigger_type: string | null;
    schedule: string | null;
    status: string;
    last_run_at: Date | null;
    run_count: number;
    error_count: number;
    avg_duration_ms: number | null;
    last_error: string | null;
    last_error_at: Date | null;
    /** Trust Contract fix (2026-08-24) — Ali, live: "Reese has several tickets
     * that have been opened... but this says it's never been run." For an
     * event-driven agent, `last_run_at` stays honestly null forever (it is
     * never invoked through the cron scheduler wrapper that stamps that
     * column) — that's correct, not a bug. The bug was the UI having no other
     * signal to show, so it read as "never run" next to a ticket table full of
     * recent activity. This is that other real signal: the most recent
     * `updated_at` across ALL of this agent's tickets (any status, unlimited —
     * not the capped `tickets` array), via `getLastTicketActivityForAgent()`.
     * `null` only when the agent genuinely has zero ticket history either. */
    last_activity_at: Date | null;
  };
}

const MAX_TICKETS = 50;

/** Real human display name for a resolved org_members.id — Enrollment.full_name
 * falling back to email, the same pattern orgService.ts::getRoster() and
 * orgChartService.ts already use for this exact data. */
async function resolveHumanIdentity(orgMemberId: string): Promise<{ id: string; name: string; email: string } | null> {
  const member = await OrgMember.findByPk(orgMemberId);
  if (!member) return null;
  let name = member.email;
  if (member.enrollment_id) {
    const enrollment = await Enrollment.findByPk(member.enrollment_id);
    if (enrollment?.full_name) name = enrollment.full_name;
  }
  return { id: member.id, name, email: member.email };
}

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

  // Ticket Count Sync fix (2026-08-21) — the TRUE open count, via the same
  // shared per-agent query the org chart's badges and the Live Agents grid
  // use, independent of the `tickets` array's MAX_TICKETS cap above.
  const openTicketCount = adminUser ? await countOpenTicketsForAgent(adminUser.id, agent) : 0;

  // Trust Contract fix (2026-08-24) — real, unlimited "last touched a ticket"
  // signal for agents `last_run_at` will never cover (see trust_contract's
  // last_activity_at doc comment above).
  const lastActivityAt = adminUser ? await getLastTicketActivityForAgent(adminUser.id, agent) : null;

  // reports_to (org-chart hierarchy build, 2026-08-19) — null when this agent
  // has no reports_to_type configured at all, never a fabricated empty shape.
  let reportsTo: AgentDetailResult['reports_to'] = null;
  if (agent.reports_to_type) {
    const { resolvedHumanId, trail } = await resolveReportsToChainWithTrail(agent);
    const resolvedHuman = resolvedHumanId ? await resolveHumanIdentity(resolvedHumanId) : null;
    // Immediate next hop, only when it's an agent (2026-08-23 "link to the
    // agent they report to" ask) — a single extra lookup, not a second copy
    // of the recursive chain-walk (that stays the one canonical
    // implementation in ticketCreatorReportsToResolver.ts).
    let immediateAgent: { id: string; name: string } | null = null;
    if (agent.reports_to_type === 'agent' && agent.reports_to_id) {
      const nextAgent = await AiAgent.findByPk(agent.reports_to_id);
      if (nextAgent) immediateAgent = { id: nextAgent.id, name: nextAgent.agent_name };
    }
    reportsTo = { trail, resolved_human: resolvedHuman, immediate_agent: immediateAgent };
  }

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
      autonomy_level: agent.autonomy_level ?? null,
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
    open_ticket_count: openTicketCount,
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
      by_tool: capabilities.byTool.map((t) => ({ tool: t.tool, reads: t.reads, produces: t.produces, documented: t.documented })),
    },
    reports_to: reportsTo,
    trust_contract: {
      trigger_type: agent.trigger_type ?? null,
      schedule: agent.schedule || null,
      status: agent.status,
      last_run_at: agent.last_run_at ?? null,
      run_count: agent.run_count ?? 0,
      error_count: agent.error_count ?? 0,
      avg_duration_ms: agent.avg_duration_ms ?? null,
      last_error: agent.last_error ?? null,
      last_error_at: agent.last_error_at ?? null,
      last_activity_at: lastActivityAt,
    },
  };
}
