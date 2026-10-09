import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import AiAgent from '../models/AiAgent';
import AdminUser from '../models/AdminUser';
import Ticket from '../models/Ticket';
import TicketActivity from '../models/TicketActivity';
import OrgMember from '../models/OrgMember';
import Enrollment from '../models/Enrollment';
import { buildCreatorIdMatchList } from './agentBlueprint/legacyCreatorAliases';
import { OPEN_TICKET_STATUS_FILTER } from './workforce/liveAgentsService';
import { computeNeedsReply, computeStatusBucket } from './reese/ticketStatusBucket';

// Report redesign (2026-10-02) — small, report-specific queries that don't exist
// anywhere else in this codebase yet. Deliberately kept OUT of
// agentDetailService.ts/liveAgentsService.ts/trustMetricsService.ts rather than
// widening those shared functions' return shapes — this file's only consumer is
// agentReportRunService.ts's renderReportContent(), so a report-only need stays
// report-only, lowest blast radius. Every query reuses the SAME real match-list/
// status-filter primitives those shared files already established
// (buildCreatorIdMatchList, OPEN_TICKET_STATUS_FILTER) rather than re-deriving them.

/** Resolves the real AdminUser row for an agent, the same lookup
 * agentDetailService.ts's own getAgentDetail() does internally — needed here
 * because that function doesn't expose the raw AdminUser/AiAgent rows a
 * caller would need to build its own further queries. */
export async function resolveAgentIdentity(agentId: string): Promise<{ agent: AiAgent; adminUser: AdminUser | null } | null> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) return null;
  const adminUser = await AdminUser.findOne({ where: { agent_id: agent.id } });
  return { agent, adminUser };
}

export interface TicketTypeCount {
  type: string;
  count: number;
}

/** Open-only ticket counts by type — does not exist anywhere else; the real
 * ticket_breakdown on AgentDetail is all-time, unfiltered by status. Same
 * "fetch once, group in JS" shape agentDetailService.ts's own ticket_breakdown
 * already uses, with OPEN_TICKET_STATUS_FILTER added to the WHERE clause. */
export async function getOpenTicketBreakdownByType(adminUserId: string, agent: AiAgent): Promise<TicketTypeCount[]> {
  const matchList = buildCreatorIdMatchList(adminUserId, agent);
  const rows = await Ticket.findAll({
    where: {
      [Op.and]: [
        { status: OPEN_TICKET_STATUS_FILTER },
        {
          [Op.or]: [
            { assigned_to_type: 'ai_staff', assigned_to_id: { [Op.in]: matchList } },
            { created_by_id: { [Op.in]: matchList } },
          ],
        },
      ],
    },
    attributes: ['type'],
  });
  const counts = new Map<string, number>();
  for (const row of rows as any[]) {
    counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([type, count]) => ({ type, count }));
}

export interface TicketFollowUpCounts {
  needsReply: number;
  pastDue: number;
}

/** A TRUE, unbounded count of "needs a reply" / "past due" tickets — the same
 * real ticketStatusBucket.ts derivation the Work tab already uses, but NOT
 * capped at agentDetailService.ts's own MAX_TICKETS=50 (that cap is correct
 * for a UI list; it silently undercounts a true aggregate for an agent with
 * more than 50 tickets, so this report needs its own unbounded version). */
export async function getTicketFollowUpCounts(adminUserId: string, agent: AiAgent): Promise<TicketFollowUpCounts> {
  const matchList = buildCreatorIdMatchList(adminUserId, agent);
  const tickets = await Ticket.findAll({
    where: {
      [Op.and]: [
        { status: OPEN_TICKET_STATUS_FILTER },
        {
          [Op.or]: [
            { assigned_to_type: 'ai_staff', assigned_to_id: { [Op.in]: matchList } },
            { created_by_id: { [Op.in]: matchList } },
          ],
        },
      ],
    },
    attributes: ['id', 'status', 'due_date'],
  });

  const ticketIds = (tickets as any[]).map((t) => t.id);
  const latestActivityByTicketId = new Map<string, { actor_id: string }>();
  if (ticketIds.length > 0) {
    const activityRows = await TicketActivity.findAll({
      where: { ticket_id: { [Op.in]: ticketIds } },
      attributes: ['ticket_id', 'actor_id', 'created_at'],
      order: [['ticket_id', 'ASC'], ['created_at', 'DESC']],
    });
    for (const row of activityRows as any[]) {
      if (!latestActivityByTicketId.has(row.ticket_id)) {
        latestActivityByTicketId.set(row.ticket_id, { actor_id: row.actor_id });
      }
    }
  }

  let needsReply = 0;
  let pastDue = 0;
  for (const ticket of tickets as any[]) {
    const latestActorId = latestActivityByTicketId.get(ticket.id)?.actor_id ?? null;
    const bucket = computeStatusBucket({
      status: ticket.status,
      dueDate: ticket.due_date ? new Date(ticket.due_date) : null,
      needsReply: computeNeedsReply(latestActorId, matchList),
    });
    if (bucket === 'needs_reply') needsReply++;
    if (bucket === 'overdue') pastDue++;
  }
  return { needsReply, pastDue };
}

export interface TopAuthorizationReason {
  action: string;
  reason: string;
  count: number;
}

/** The most common (action, reason) pairs among this agent's real authorization
 * decisions — same dual agent-id/agent-name match getAgentAuthorizationSummary()
 * already uses (agentAuthorizationService.ts), since Reese's real ai_events rows
 * are keyed by her literal name, not her AiAgent.id. */
export async function getTopAuthorizationReasons(
  agentId: string, agentName: string, days: number, limit = 2,
): Promise<TopAuthorizationReason[]> {
  const rows = (await sequelize.query(
    `SELECT metadata->>'action' AS action, metadata->>'reason' AS reason, COUNT(*)::int AS n
     FROM ai_events
     WHERE event_type = 'agent.authorization' AND agent_id IN (:agentId, :agentName)
       AND created_at >= NOW() - (:days || ' days')::interval
     GROUP BY 1, 2 ORDER BY n DESC LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements: { agentId, agentName, days, limit } },
  )) as Array<{ action: string | null; reason: string | null; n: number }>;
  return rows
    .filter((r) => r.action && r.reason)
    .map((r) => ({ action: r.action as string, reason: r.reason as string, count: r.n }));
}

export interface TokensAndModel {
  totalTokens: number;
  topModel: string | null;
}

/** Tokens + the most-used model — deliberately NOT cost/runs too (those
 * already exist, null-safe, on AgentDetail.cost_summary via trustMetricsService.ts's
 * agentCostRows() — re-querying them here would be redundant AND risk the two
 * paths drifting). "Most-used model" is its own query: an agent can
 * legitimately call more than one model in a window, so a single
 * `GROUP BY agent_id` can't also answer "which model". Kept local to this
 * report rather than widening agentCostRows() itself, which has other real
 * callers; this stays report-only. */
export async function getTokensAndModel(agentId: string, agentName: string, days: number): Promise<TokensAndModel> {
  const [totals] = (await sequelize.query(
    `SELECT COALESCE(SUM(total_tokens), 0)::int AS total_tokens
     FROM ai_events
     WHERE agent_id IN (:agentId, :agentName) AND created_at >= NOW() - (:days || ' days')::interval`,
    { type: QueryTypes.SELECT, replacements: { agentId, agentName, days } },
  )) as Array<{ total_tokens: number }>;

  const [topModelRow] = (await sequelize.query(
    `SELECT model, COUNT(*)::int AS n
     FROM ai_events
     WHERE agent_id IN (:agentId, :agentName) AND created_at >= NOW() - (:days || ' days')::interval
       AND model IS NOT NULL
     GROUP BY model ORDER BY n DESC LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { agentId, agentName, days } },
  )) as Array<{ model: string; n: number }>;

  return {
    totalTokens: totals?.total_tokens ?? 0,
    topModel: topModelRow?.model ?? null,
  };
}

/** 30-day-SCOPED error count — distinct from AiAgent.error_count, which is an
 * all-time counter bumped by the cron-scheduler wrapper, not windowed and not
 * an ai_events count at all. */
export async function getErrorCount(agentId: string, agentName: string, days: number): Promise<number> {
  const rows = (await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM ai_events
     WHERE agent_id IN (:agentId, :agentName) AND created_at >= NOW() - (:days || ' days')::interval
       AND outcome = 'failure'`,
    { type: QueryTypes.SELECT, replacements: { agentId, agentName, days } },
  )) as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

/** Real human display name for a report recipient — same Enrollment.full_name-
 * falling-back-to-email pattern agentDetailService.ts's own (unexported)
 * resolveHumanIdentity() already uses for this exact purpose. */
export async function resolveRecipientDisplayName(email: string): Promise<string> {
  const member = await OrgMember.findOne({ where: { email } });
  if (member?.enrollment_id) {
    const enrollment = await Enrollment.findByPk(member.enrollment_id);
    if (enrollment?.full_name) return enrollment.full_name;
  }
  return email;
}
