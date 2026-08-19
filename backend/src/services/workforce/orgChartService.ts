import { Op } from 'sequelize';
import Organization from '../../models/Organization';
import OrgMember from '../../models/OrgMember';
import AdminUser from '../../models/AdminUser';
import Enrollment from '../../models/Enrollment';
import AiAgent from '../../models/AiAgent';
import { Ticket } from '../../models';
import { resolveReportsToChainWithTrail } from '../ticketCreatorReportsToResolver';
import { buildCreatorIdMatchList } from '../agentBlueprint/legacyCreatorAliases';
import { OPEN_TICKET_STATUS_FILTER } from './liveAgentsService';

/**
 * orgChartService — the real, drill-down org chart Ali asked for: Human
 * Employees (real org_members on the "Colaberry" org) -> AI Leadership (real
 * AiAgent rows with reports_to_type='human') -> AI Staff (reports_to_type=
 * 'agent', chained through Leadership). Every field traces to live data;
 * nothing here is hand-written prose. Powers the WorkforceOSPage org-chart
 * section (replacing the fictional AI_ORG director roster) and its Mermaid
 * overview. See directives/register-ticket-creating-agent.md Step 10 for the
 * authoritative hierarchy spec this reads.
 *
 * Reuses resolveReportsToChainWithTrail() (the SAME recursive walk
 * ticketService.createTicket() gates ticket creation on) rather than
 * re-deriving the chain — this is the read-only "who reports to whom" view of
 * the same data that write path already enforces.
 *
 * Zero N+1 by construction: every per-entity lookup below (display names,
 * open ticket counts, throttled human tasks) is ONE batched query across all
 * entities, not one query per row — see each section's comment.
 */

const COLABERRY_ORG_NAME = 'Colaberry';

/** Thrown when the "Colaberry" Organization row itself can't be found — a
 * distinct, named error class (not a generic Error) per this repo's error-
 * classification rule, since a missing seed row is a different failure mode
 * than "the org exists but has zero members" (which is not an error at all). */
export class ColaberryOrgNotFoundError extends Error {
  readonly error_class = 'ColaberryOrgNotFoundError' as const;

  constructor() {
    super('No Organization row named "Colaberry" was found — cannot build the org chart without it.');
    this.name = 'ColaberryOrgNotFoundError';
  }
}

export interface OrgChartTask {
  id: string;
  ticket_number: number | null;
  title: string;
  status: string;
  priority: string;
  type: string;
  created_at: Date | null;
}

export interface OrgChartHuman {
  id: string;
  name: string;
  email: string;
  team: string | null;
  role: 'manager' | 'member';
  /** AiAgent ids with reports_to_type='human' resolving directly to this human. */
  leadership_agent_ids: string[];
  /** Count of AI Staff agents whose FULL reports_to chain resolves to this
   * human, however many hops it takes — not just direct reports, so a future
   * 3rd tier still counts correctly with zero code change here. */
  staff_count: number;
  /** The one throttled, most-recent OPEN ticket assigned to this human, or
   * null when they genuinely have none yet — never a fabricated placeholder
   * (Ali, live: "start them off with just one task a piece for right now"). */
  task: OrgChartTask | null;
}

export interface OrgChartLeadershipAgent {
  id: string;
  agent_name: string;
  display_name: string;
  reports_to_human_id: string;
  staff_ids: string[];
  open_ticket_count: number;
}

export interface OrgChartStaffAgent {
  id: string;
  agent_name: string;
  display_name: string;
  reports_to_agent_id: string;
  open_ticket_count: number;
}

export interface OrgChartUnresolvedAgent {
  id: string;
  agent_name: string;
  /** The trail's final hop, e.g. "AgentName (agent) -> [dangling]" — an
   * honest disclosure of exactly where the chain breaks, not a bare boolean. */
  reason: string;
}

export interface OrgChartResponse {
  organization: { id: string; name: string };
  humans: OrgChartHuman[];
  leadership: OrgChartLeadershipAgent[];
  staff: OrgChartStaffAgent[];
  unresolved: OrgChartUnresolvedAgent[];
  generated_at: Date;
}

interface HumanRollup {
  leadershipIds: string[];
  staffCount: number;
}

/** All ticket-creating agents this hierarchy applies to (only rows with a
 * reports_to chain configured at all — the many other AiAgent rows in this
 * table, e.g. website-intelligence/openclaw agents, have no reports_to and
 * are correctly out of scope for this chart, not "unresolved"). */
async function fetchHierarchyAgents(): Promise<AiAgent[]> {
  return AiAgent.findAll({ where: { reports_to_type: { [Op.ne]: null } } });
}

/** Real display names for hierarchy agents, batched in one query (mirrors
 * liveAgentsService.ts's findBlueprintAdminUsers() + map-by-id pattern). */
async function fetchAgentIdentities(agentIds: string[]): Promise<Map<string, AdminUser>> {
  if (agentIds.length === 0) return new Map();
  const admins = await AdminUser.findAll({ where: { agent_id: { [Op.in]: agentIds } } });
  return new Map(admins.map((a) => [a.agent_id as string, a]));
}

/** Open ticket counts for every hierarchy agent in ONE query (not one per
 * agent) — builds a flat matchId -> agentId map first (mirrors
 * liveAgentsService.ts::listLiveAgentActivity()'s metaByMatchId pattern),
 * then a single Ticket.findAll with an IN clause across every agent's full
 * match-id list, then tallies in JS. */
async function fetchOpenTicketCountsByAgent(
  agents: AiAgent[],
  identityByAgentId: Map<string, AdminUser>,
): Promise<Map<string, number>> {
  const agentIdByMatchId = new Map<string, string>();
  const allMatchIds: string[] = [];
  for (const agent of agents) {
    const identity = identityByAgentId.get(agent.id);
    if (!identity) continue;
    for (const matchId of buildCreatorIdMatchList(identity.id, agent)) {
      agentIdByMatchId.set(matchId, agent.id);
      allMatchIds.push(matchId);
    }
  }
  if (allMatchIds.length === 0) return new Map();

  const rows = await Ticket.findAll({
    attributes: ['assigned_to_id', 'created_by_id'],
    where: {
      [Op.and]: [
        { status: OPEN_TICKET_STATUS_FILTER },
        {
          [Op.or]: [
            { assigned_to_type: 'ai_staff', assigned_to_id: { [Op.in]: allMatchIds } },
            { created_by_id: { [Op.in]: allMatchIds } },
          ],
        },
      ],
    },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    const matchId = row.assigned_to_id || row.created_by_id || '';
    const agentId = agentIdByMatchId.get(matchId);
    if (!agentId) continue;
    counts.set(agentId, (counts.get(agentId) ?? 0) + 1);
  }
  return counts;
}

/** Each human's single throttled most-recent OPEN task, in ONE query across
 * all humans (order DESC, keep only the first row seen per assigned_to_id —
 * matches liveAgentsService.ts's batch-then-map convention, zero N+1). */
async function fetchThrottledTaskByHuman(humanIds: string[]): Promise<Map<string, Ticket>> {
  if (humanIds.length === 0) return new Map();
  const rows = await Ticket.findAll({
    where: {
      assigned_to_type: 'org_member',
      assigned_to_id: { [Op.in]: humanIds },
      status: OPEN_TICKET_STATUS_FILTER,
    },
    order: [['created_at', 'DESC']],
  });
  const byHuman = new Map<string, Ticket>();
  for (const row of rows) {
    const humanId = row.assigned_to_id as string;
    if (!byHuman.has(humanId)) byHuman.set(humanId, row); // first-seen = most recent (DESC order)
  }
  return byHuman;
}

/** Real display names: Enrollment.full_name, falling back to email — the
 * exact pattern orgService.ts::getRoster() already uses for the same "Business
 * Account roster" data, reused rather than re-derived. */
async function fetchHumanNames(humanMembers: OrgMember[]): Promise<Map<string, string>> {
  const enrollmentIds = humanMembers.map((m) => m.enrollment_id).filter((id): id is string => !!id);
  if (enrollmentIds.length === 0) return new Map();
  const enrollments = await Enrollment.findAll({ where: { id: { [Op.in]: enrollmentIds } } });
  return new Map(enrollments.map((e) => [e.id, e.full_name]));
}

/** Excludes org_members whose email belongs to an AI-operated AdminUser
 * identity (e.g. reese@colaberry.com, the Reese agent's real free-account
 * email) — those are AI Staff wearing a human roster row, not real humans;
 * live-verified 2026-08-19 against the real Colaberry roster. */
async function excludeAiOperatedMembers(members: OrgMember[]): Promise<OrgMember[]> {
  const emails = members.map((m) => m.email);
  if (emails.length === 0) return members;
  const aiOperated = await AdminUser.findAll({
    where: { email: { [Op.in]: emails }, is_ai_operated: true },
    attributes: ['email'],
  });
  const aiOperatedEmails = new Set(aiOperated.map((a) => a.email));
  return members.filter((m) => !aiOperatedEmails.has(m.email));
}

export async function getOrgChart(): Promise<OrgChartResponse> {
  const org = await Organization.findOne({ where: { name: COLABERRY_ORG_NAME } });
  if (!org) throw new ColaberryOrgNotFoundError();

  const allMembers = await OrgMember.findAll({ where: { org_id: org.id }, order: [['created_at', 'ASC']] });
  const humanMembers = await excludeAiOperatedMembers(allMembers);
  const nameByEnrollmentId = await fetchHumanNames(humanMembers);
  const humanIds = humanMembers.map((m) => m.id);
  const taskByHuman = await fetchThrottledTaskByHuman(humanIds);

  const agents = await fetchHierarchyAgents();
  const identityByAgentId = await fetchAgentIdentities(agents.map((a) => a.id));
  const openCountByAgentId = await fetchOpenTicketCountsByAgent(agents, identityByAgentId);

  const leadership: OrgChartLeadershipAgent[] = [];
  const staff: OrgChartStaffAgent[] = [];
  const unresolved: OrgChartUnresolvedAgent[] = [];
  const humanRollup = new Map<string, HumanRollup>();

  const bumpRollup = (humanId: string, isLeadership: boolean, agentId: string) => {
    const entry = humanRollup.get(humanId) ?? { leadershipIds: [], staffCount: 0 };
    if (isLeadership) entry.leadershipIds.push(agentId);
    else entry.staffCount += 1;
    humanRollup.set(humanId, entry);
  };

  for (const agent of agents) {
    const displayName = identityByAgentId.get(agent.id)?.display_name || agent.agent_name;
    const openTicketCount = openCountByAgentId.get(agent.id) ?? 0;
    // eslint-disable-next-line no-await-in-loop -- only 23 agents today, each a
    // fast indexed findByPk per hop (1-2 hops); reuses the canonical resolver
    // rather than re-deriving the walk, per this run's execution contract.
    const { resolvedHumanId, trail } = await resolveReportsToChainWithTrail(agent);

    if (!resolvedHumanId) {
      unresolved.push({ id: agent.id, agent_name: agent.agent_name, reason: trail[trail.length - 1] ?? 'unresolved' });
      continue;
    }

    if (agent.reports_to_type === 'human') {
      leadership.push({
        id: agent.id,
        agent_name: agent.agent_name,
        display_name: displayName,
        reports_to_human_id: resolvedHumanId,
        staff_ids: [],
        open_ticket_count: openTicketCount,
      });
      bumpRollup(resolvedHumanId, true, agent.id);
    } else {
      staff.push({
        id: agent.id,
        agent_name: agent.agent_name,
        display_name: displayName,
        reports_to_agent_id: agent.reports_to_id as string,
        open_ticket_count: openTicketCount,
      });
      bumpRollup(resolvedHumanId, false, agent.id);
    }
  }

  const leadershipById = new Map(leadership.map((l) => [l.id, l]));
  for (const s of staff) {
    leadershipById.get(s.reports_to_agent_id)?.staff_ids.push(s.id);
  }

  const humans: OrgChartHuman[] = humanMembers.map((m) => {
    const rollup = humanRollup.get(m.id) ?? { leadershipIds: [], staffCount: 0 };
    const task = taskByHuman.get(m.id);
    return {
      id: m.id,
      name: (m.enrollment_id && nameByEnrollmentId.get(m.enrollment_id)) || m.email,
      email: m.email,
      team: m.team,
      role: m.role,
      leadership_agent_ids: rollup.leadershipIds,
      staff_count: rollup.staffCount,
      task: task
        ? {
            id: task.id,
            ticket_number: task.ticket_number ?? null,
            title: task.title,
            status: task.status,
            priority: task.priority,
            type: task.type,
            created_at: task.created_at ?? null,
          }
        : null,
    };
  });

  return {
    organization: { id: org.id, name: org.name },
    humans,
    leadership,
    staff,
    unresolved,
    generated_at: new Date(),
  };
}
