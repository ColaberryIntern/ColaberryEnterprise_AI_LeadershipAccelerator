import { Op } from 'sequelize';
import AiAgent from '../../models/AiAgent';
import { Ticket, TicketActivity } from '../../models';
import { buildCreatorIdMatchList } from '../agentBlueprint/legacyCreatorAliases';
import { resolveActorDisplayNamesBatch, actorRefKey } from '../actorIdentity/resolveActorDisplayName';
import { findBlueprintAdminUsers } from './liveAgentsService';

/**
 * liveAgentsTimelineService — Org Chart v4 (2026-08-20, session
 * CC-20260818-x4nk continued). Ali, live: "the Activity Timeline needs
 * pizzazz and coloring and capability... show stages... see when tickets
 * are created, updated, closed out... in real time." The existing
 * `liveAgentsService.ts::listLiveAgentActivity()` shows only a ticket's
 * CURRENT status, one row per ticket — never the actual lifecycle. This
 * module queries the real, append-only `TicketActivity` log instead, scoped
 * to the SAME "who counts as a live AI agent" roster
 * (`findBlueprintAdminUsers()`) that feature already uses, so the two
 * surfaces never disagree about which agents' work counts.
 *
 * v1 scope (execution-contract.md Assumption 2): `created` and
 * `status_changed` actions only — a `status_changed` to `done`/`cancelled`
 * is surfaced as the `closed` kind rather than a separate action value.
 * `commented`/`agent_output`/`updated`(field-edit) actions are a pure
 * additive extension of the same query shape, left for a future pass.
 *
 * Kept as its own module rather than added to `liveAgentsService.ts`
 * (239 lines, at CLAUDE.md's 300-line soft target already) for the same
 * reason `orgChartColorAssignment.ts` was split out of `orgChartService.ts`
 * — this query is realistically 60-90 lines by the shape of its sibling
 * functions, which would push that file past its soft target.
 */

export type LiveAgentTimelineEventKind = 'created' | 'status_change' | 'closed';

export interface LiveAgentTimelineEvent {
  id: string;
  ticket_id: string;
  ticket_number: number | null;
  ticket_title: string;
  kind: LiveAgentTimelineEventKind;
  action: string;
  from_value: string | null;
  to_value: string | null;
  actor_display_name: string;
  occurred_at: Date | null;
}

const DEFAULT_TIMELINE_LIMIT = 50;
/** Defense in depth (execution-contract.md T008 acceptance criteria) — the
 * route also Zod-validates `limit` (workforceController.ts), but this
 * function never trusts a caller-supplied value alone; a value outside this
 * range is clamped, never rejected (a read-only query has no reason to 400
 * on an out-of-range limit when clamping is strictly safer). */
const MAX_TIMELINE_LIMIT = 200;

const TIMELINE_ACTIONS = ['created', 'status_changed'] as const;
const CLOSED_STATUSES = new Set(['done', 'cancelled']);

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_TIMELINE_LIMIT;
  return Math.min(Math.trunc(limit), MAX_TIMELINE_LIMIT);
}

function deriveKind(action: string, toValue: string | null): LiveAgentTimelineEventKind {
  if (action === 'created') return 'created';
  if (toValue && CLOSED_STATUSES.has(toValue)) return 'closed';
  return 'status_change';
}

export async function listLiveAgentTimeline(limit: number = DEFAULT_TIMELINE_LIMIT): Promise<LiveAgentTimelineEvent[]> {
  const boundedLimit = clampLimit(limit);

  const adminUsers = await findBlueprintAdminUsers();
  if (adminUsers.length === 0) return [];

  const agentIds = adminUsers.map((u) => u.agent_id as string);
  const agents = await AiAgent.findAll({ where: { id: { [Op.in]: agentIds } } });
  const agentsById = new Map(agents.map((a) => [a.id, a]));

  // Same flat matchId -> nothing-needed-here shape liveAgentsService.ts's
  // listLiveAgentActivity() builds — only the FLAT LIST of every identifier
  // any of these agents' tickets could carry is needed here (the ticket-scoped
  // WHERE clause below), not a reverse lookup map.
  const allMatchIds: string[] = [];
  for (const adminUser of adminUsers) {
    const agent = agentsById.get(adminUser.agent_id as string);
    if (!agent) continue;
    allMatchIds.push(...buildCreatorIdMatchList(adminUser.id, agent));
  }
  if (allMatchIds.length === 0) return [];

  const rows = await TicketActivity.findAll({
    where: { action: { [Op.in]: [...TIMELINE_ACTIONS] } },
    include: [
      {
        model: Ticket,
        as: 'ticket',
        attributes: ['id', 'ticket_number', 'title'],
        where: {
          [Op.or]: [
            { assigned_to_type: 'ai_staff', assigned_to_id: { [Op.in]: allMatchIds } },
            { created_by_id: { [Op.in]: allMatchIds } },
          ],
        },
        required: true,
      },
    ],
    order: [['created_at', 'DESC']],
    limit: boundedLimit,
  });

  const actorRefs = rows.map((r: TicketActivity) => ({ actorType: r.actor_type, actorId: r.actor_id }));
  const displayNameByActor = await resolveActorDisplayNamesBatch(actorRefs);

  return rows.map((r: TicketActivity) => {
    // `any` justified: Sequelize's `include` attaches the associated `ticket`
    // row at runtime, but the base `TicketActivity` model type (models/
    // TicketActivity.ts) has no static knowledge of that association — the
    // same cast-and-narrow pattern this codebase already uses for included
    // associations elsewhere (no typed "TicketActivity with ticket" variant
    // exists to import). Narrowed immediately to the exact shape this
    // function actually reads, not left as a bare `any`.
    const ticket = (r as any).ticket as { id: string; ticket_number: number | null; title: string } | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    return {
      id: r.id,
      ticket_id: ticket?.id ?? r.ticket_id,
      ticket_number: ticket?.ticket_number ?? null,
      ticket_title: ticket?.title ?? 'Untitled ticket',
      kind: deriveKind(r.action, r.to_value),
      action: r.action,
      from_value: r.from_value ?? null,
      to_value: r.to_value ?? null,
      actor_display_name: displayNameByActor.get(actorRefKey(r.actor_type, r.actor_id)) ?? 'Unknown Agent',
      occurred_at: r.created_at ?? null,
    };
  });
}
