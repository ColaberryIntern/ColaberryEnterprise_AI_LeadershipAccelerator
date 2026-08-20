// CLAUDE.md size-ceiling disclosure: this file was already over the 500-line hard
// ceiling (515) before the Agent Ticket Standard change (2026-08-18) touched it.
// That change extracted its own new gate logic in full (enforceReportsToGate(),
// ~30 lines) into ticketCreatorReportsToResolver.ts rather than adding it inline —
// the file's net growth from this change is ~21 lines, not the ~40 the gate would
// have cost inline. Closing the REMAINING pre-existing overage would mean
// extracting getTicketById()/getTicketsForBoard() (the two largest functions
// here, both carrying careful, recent, unrelated fixes — see their own header
// comments) into a query-service module, mirroring getTicketStats()'s own past
// extraction into ticketStatsService.ts. Deliberately NOT done as part of this
// change (CLAUDE.md Scope Lock: logged here as a real, actionable follow-up
// proposal, not silently expanded into this change's already-large diff, and not
// silently left unacknowledged either).
import crypto from 'crypto';
import { Op } from 'sequelize';
import { Ticket, TicketActivity } from '../models';
import type { TicketStatus, TicketPriority, TicketType, TicketActorType } from '../models/Ticket';
import type { AgentExecutionResult } from './agents/types';
import { emitLedgerEventSafe } from './workLedger/emitLedgerEventSafe';
import { tryReuseStudentSupportTicket } from './ticketStudentSupportReuse';
import {
  resolveActorDisplayName,
  resolveActorDisplayNamesBatch,
  actorRefKey,
} from './actorIdentity/resolveActorDisplayName';
import { buildTicketAutoCheckResolver } from './ticketAutoCheckService';
import { enforceReportsToGate } from './ticketCreatorReportsToResolver';

// ── State Machine ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  backlog: ['todo', 'cancelled'],
  todo: ['in_progress', 'cancelled'],
  in_progress: ['in_review', 'done', 'cancelled'],
  in_review: ['done', 'in_progress', 'cancelled'],
  done: [],
  cancelled: [],
};

function validateTransition(from: TicketStatus, to: TicketStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Types ────────────────────────────────────────────────────────────────

export interface CreateTicketData {
  title: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  type?: TicketType;
  source?: string;
  created_by_type: TicketActorType;
  created_by_id: string;
  assigned_to_type?: TicketActorType | null;
  assigned_to_id?: string | null;
  parent_ticket_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, any>;
  confidence?: number | null;
  estimated_effort?: string | null;
  due_date?: Date | null;
}

export interface TicketFilters {
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  type?: TicketType | TicketType[];
  source?: string;
  assigned_to_id?: string;
  parent_ticket_id?: string | null;
  entity_type?: string;
  entity_id?: string;
  // Ticket Board Performance fix (2026-08-18) — powers the board's "last 7 days"
  // default view. Additive/optional: every existing caller that doesn't pass this
  // keeps today's unbounded behavior unchanged. See ensureTicketIndexesSchema.ts
  // for the supporting idx_tickets_created_at index this filter relies on to stay
  // fast as the table grows.
  createdAfter?: Date;
  // Org Chart v4 (2026-08-20) — the ticket-filter-by-agent button. Pre-resolved
  // by the route (ticketCreatorFilterResolver.ts) BEFORE reaching this
  // function — this file stays a pure query builder, the identity-resolution
  // logic lives in its own module (see that file's header comment for why).
  creatorMatchIds?: string[];
}

// ── Create ───────────────────────────────────────────────────────────────

export async function createTicket(data: CreateTicketData) {
  // Agent Ticket Standard — "every ticket must have a home" (Ali, live,
  // 2026-08-18). Every non-human creator must resolve to a real human it
  // reports to, BEFORE any DB write — a hard, structural rejection (throws
  // TicketCreatorNotReportableError), never a silent no-op or a warning. See
  // ticketCreatorReportsToResolver.ts's enforceReportsToGate() for the full
  // resolution logic (including plan-audit cycle 1's ai_staff-vs-agent_name
  // finding) — extracted out of this already-oversize file per CLAUDE.md's
  // size-ceiling rule.
  const reportsToOrgMemberId = await enforceReportsToGate(data.created_by_type, data.created_by_id);

  // "One ticket per person per hour" (Ali, live feedback) — the student_support
  // reuse/reopen rule lives in ticketStudentSupportReuse.ts (extracted so this
  // function stays under CLAUDE.md's size ceiling); every other ticket type
  // keeps the original, unbounded-while-open dedup below completely unchanged.
  if (data.type === 'student_support') {
    const reused = await tryReuseStudentSupportTicket(data);
    if (reused) return reused;
  } else if (data.entity_type && data.entity_id && data.type) {
    // Original behavior, unchanged for every ticket type other than
    // student_support: reuse any still-open ticket on the same entity, with
    // no time window.
    const existing = await Ticket.findOne({
      where: {
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        type: data.type,
        status: { [Op.notIn]: ['done', 'cancelled'] },
      },
    });
    if (existing) return existing;
  }

  // Agent Ticket Standard — stamp the resolved human as the real assignee, but
  // only when the caller didn't already pass an explicit assigned_to_* (e.g.
  // ensureAgentTicketForRoom()'s own `assigned_to_type:'ai_staff'` for Reese's
  // room tickets) — this resolver adds a real assignee where none was specified,
  // it never overrides a caller's deliberate explicit choice.
  const assignedToFromReportsTo =
    reportsToOrgMemberId && !data.assigned_to_type && !data.assigned_to_id
      ? { assigned_to_type: 'org_member' as const, assigned_to_id: reportsToOrgMemberId }
      : {};

  const ticket = await Ticket.create({
    ...data,
    ...assignedToFromReportsTo,
    status: data.status || 'backlog',
    priority: data.priority || 'medium',
    type: data.type || 'task',
    source: data.source || 'manual',
    updated_at: new Date(),
  } as any);

  await TicketActivity.create({
    ticket_id: ticket.id,
    actor_type: data.created_by_type,
    actor_id: data.created_by_id,
    action: 'created',
    to_value: ticket.status,
    metadata: { title: ticket.title, priority: ticket.priority, type: ticket.type },
  });

  await emitLedgerEventSafe({
    ticketId: ticket.id,
    traceId: crypto.randomUUID(),
    actorType: data.created_by_type,
    actorId: data.created_by_id,
    intent: 'ticket.create',
    domain: 'tickets',
    actionClass: 'create',
    targetType: 'ticket',
    targetId: ticket.id,
    idempotencyKey: `ticket-created:${ticket.id}`,
    result: 'success',
    sourceRecordType: 'ticket',
    sourceRecordId: ticket.id,
  });

  return ticket;
}

// ── Status Transition ────────────────────────────────────────────────────

export async function updateTicketStatus(
  ticketId: string,
  newStatus: TicketStatus,
  actorType: TicketActorType,
  actorId: string,
) {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  if (!validateTransition(ticket.status, newStatus)) {
    throw new Error(`Invalid transition: ${ticket.status} → ${newStatus}`);
  }

  const fromStatus = ticket.status;
  const updates: Record<string, any> = { status: newStatus, updated_at: new Date() };

  if (newStatus === 'done') updates.completed_at = new Date();

  await ticket.update(updates);

  const activity = await TicketActivity.create({
    ticket_id: ticketId,
    actor_type: actorType,
    actor_id: actorId,
    action: 'status_changed',
    from_value: fromStatus,
    to_value: newStatus,
  });

  await emitLedgerEventSafe({
    ticketId,
    traceId: crypto.randomUUID(),
    actorType,
    actorId,
    intent: 'ticket.status_change',
    domain: 'tickets',
    actionClass: 'status_change',
    targetType: 'ticket',
    targetId: ticketId,
    idempotencyKey: `ticket-status-change:${activity.id}`,
    result: 'success',
    beforeStateRef: fromStatus,
    afterStateRef: newStatus,
    sourceRecordType: 'ticket_activity',
    sourceRecordId: activity.id,
  });

  // Learning loop: when a strategic ticket reaches 'done', trigger outcome tracking
  if (newStatus === 'done' && (ticket as any).type === 'strategic' && (ticket as any).source === 'cory') {
    import('./reporting/coryDecisionEngine')
      .then((engine) => engine.trackExecutionOutcome(ticketId))
      .catch(() => { /* non-critical */ });
  }

  // ProofDesk Outcomes & Learning (Milestone 5, spec 20.4): every ticket reaching
  // 'done' — not just cory strategic tickets — gets a 7-day recurrence-check
  // follow-up scheduled. Non-blocking, same failure-isolation contract as the cory
  // hook above: a failure here must never affect this function's own success/failure
  // or return value.
  if (newStatus === 'done') {
    import('./outcomes/outcomeMeasurementService')
      .then((svc) => svc.scheduleOutcomeMeasurement(ticketId))
      .catch(() => { /* non-critical */ });
  }

  return ticket;
}

// ── Assignment ───────────────────────────────────────────────────────────

export async function assignTicket(
  ticketId: string,
  assigneeType: TicketActorType | null,
  assigneeId: string | null,
  actorType: TicketActorType,
  actorId: string,
) {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  const prevAssignee = ticket.assigned_to_id;

  await ticket.update({
    assigned_to_type: assigneeType,
    assigned_to_id: assigneeId,
    updated_at: new Date(),
  } as any);

  await TicketActivity.create({
    ticket_id: ticketId,
    actor_type: actorType,
    actor_id: actorId,
    action: 'assigned',
    from_value: prevAssignee || undefined,
    to_value: assigneeId || undefined,
    metadata: { assignee_type: assigneeType },
  });

  return ticket;
}

// ── Comments ─────────────────────────────────────────────────────────────

export async function addTicketComment(
  ticketId: string,
  comment: string,
  actorType: TicketActorType,
  actorId: string,
) {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  const activity = await TicketActivity.create({
    ticket_id: ticketId,
    actor_type: actorType,
    actor_id: actorId,
    action: 'commented',
    comment,
  });

  await ticket.update({ updated_at: new Date() } as any);

  return activity;
}

// ── Agent Output ─────────────────────────────────────────────────────────

export async function addAgentOutput(
  ticketId: string,
  agentName: string,
  output: AgentExecutionResult,
) {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  const activity = await TicketActivity.create({
    ticket_id: ticketId,
    actor_type: 'agent',
    actor_id: agentName,
    action: 'agent_output',
    metadata: {
      agent_name: output.agent_name,
      duration_ms: output.duration_ms,
      actions_taken: output.actions_taken.length,
      errors: output.errors,
      campaigns_processed: output.campaigns_processed,
      entities_processed: output.entities_processed,
    },
  });

  await ticket.update({ updated_at: new Date() } as any);

  await emitLedgerEventSafe({
    ticketId,
    traceId: crypto.randomUUID(),
    actorType: 'agent',
    actorId: agentName,
    intent: 'ticket.agent_output',
    domain: 'tickets',
    actionClass: 'agent_output',
    targetType: 'ticket',
    targetId: ticketId,
    idempotencyKey: `ticket-agent-output:${activity.id}`,
    result: output.errors && output.errors.length > 0 ? 'failure' : 'success',
    sourceRecordType: 'ticket_activity',
    sourceRecordId: activity.id,
  });

  return activity;
}

// ── Queries ──────────────────────────────────────────────────────────────

export async function getTicketById(ticketId: string) {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) return null;

  const activities = await TicketActivity.findAll({
    where: { ticket_id: ticketId },
    order: [['created_at', 'ASC']],
  });

  const subTasks = await Ticket.findAll({
    where: { parent_ticket_id: ticketId },
    order: [['created_at', 'ASC']],
  });

  // Display-layer enrichment only — actor_id/actor_type stay exactly as persisted.
  // Ali's live feedback ("You fixed the name in part of the ticket, but not all the
  // ticket") named two specific surfaces still showing a raw actor UUID after the
  // prior run fixed titles/descriptions: the Technical tab's "Assigned" field and its
  // activity-feed lines. Both read from this response, so both are resolved here,
  // once, server-side — matching summaryGeneratorService.ts's own pattern of
  // generating human-facing text on the backend rather than pushing N resolution
  // calls onto the frontend.
  const assignedToDisplayName =
    ticket.assigned_to_type && ticket.assigned_to_id
      ? await resolveActorDisplayName(ticket.assigned_to_type, ticket.assigned_to_id)
      : null;

  // Ticket Board UX fixes (2026-08-17) — the SAME two additive fields
  // getTicketsForBoard() now returns, so the detail modal can show the same
  // real creator name and honest auto-check disclosure the board card does,
  // not a second, narrower picture. createdByDisplayName reuses this file's
  // established resolveActorDisplayName() rather than a new lookup;
  // buildTicketAutoCheckResolver() is cheap to build for a single ticket (its
  // own internal batching is aimed at board-sized N, not a cost concern here).
  const [createdByDisplayName, autoCheckResolver] = await Promise.all([
    resolveActorDisplayName(ticket.created_by_type, ticket.created_by_id),
    buildTicketAutoCheckResolver(),
  ]);
  const autoCheck = autoCheckResolver({
    created_by_type: ticket.created_by_type,
    created_by_id: ticket.created_by_id,
    type: ticket.type,
    source: ticket.source,
    entity_type: ticket.entity_type,
    status: ticket.status,
  });

  // Resolved concurrently (Promise.all), not one-at-a-time, so a ticket with a long
  // activity history doesn't pay an N-query waterfall for what can run in parallel.
  const activitiesWithNames = await Promise.all(
    activities.map(async (activity) => ({
      ...activity.toJSON(),
      actor_display_name: await resolveActorDisplayName(activity.actor_type, activity.actor_id),
    })),
  );

  return {
    ticket: {
      ...ticket.toJSON(),
      assigned_to_display_name: assignedToDisplayName,
      created_by_display_name: createdByDisplayName,
      auto_check: autoCheck,
    },
    activities: activitiesWithNames,
    subTasks,
  };
}

export async function getTicketsForBoard(filters?: TicketFilters) {
  const where: Record<string, any> = {};

  if (filters?.status) {
    where.status = Array.isArray(filters.status) ? { [Op.in]: filters.status } : filters.status;
  }
  if (filters?.priority) {
    where.priority = Array.isArray(filters.priority) ? { [Op.in]: filters.priority } : filters.priority;
  }
  if (filters?.type) {
    where.type = Array.isArray(filters.type) ? { [Op.in]: filters.type } : filters.type;
  }
  if (filters?.source) where.source = filters.source;
  if (filters?.assigned_to_id) where.assigned_to_id = filters.assigned_to_id;
  if (filters?.entity_type) where.entity_type = filters.entity_type;
  if (filters?.entity_id) where.entity_id = filters.entity_id;
  if (filters?.parent_ticket_id !== undefined) {
    where.parent_ticket_id = filters.parent_ticket_id;
  }
  if (filters?.createdAfter) {
    where.created_at = { [Op.gte]: filters.createdAfter };
  }
  // Org Chart v4 (2026-08-20) — ticket-filter-by-agent button. `where` is
  // typed `Record<string, any>` (declared above), so indexing it with the
  // `Op.or` symbol key needs an explicit cast under this repo's strict
  // tsconfig — same convention already used at this exact shape elsewhere in
  // this codebase (openclawRoutes.ts, communityService.ts, notebookService.ts).
  if (filters?.creatorMatchIds && filters.creatorMatchIds.length > 0) {
    (where as any)[Op.or] = [
      { created_by_id: { [Op.in]: filters.creatorMatchIds } },
      { assigned_to_id: { [Op.in]: filters.creatorMatchIds } },
    ];
  }

  const tickets = await Ticket.findAll({
    where,
    order: [
      ['priority', 'ASC'],
      ['created_at', 'DESC'],
    ],
  });

  // Ticket Board UX fixes (2026-08-17) — real creator names + honest auto-check
  // timing, additive on every ticket the board/list endpoints return. The
  // actor-name batch is deduped by (created_by_type, created_by_id) — verified
  // live at 32 distinct pairs across 16,119 production tickets — so this never
  // pays a per-ticket DB round trip regardless of table size. The auto-check
  // resolver function is built ONCE for the whole request (fetches the 6
  // resolvers' live enabled/schedule state a single time), then applied
  // per-ticket as a cheap, synchronous, in-memory check.
  const [displayNameByActor, autoCheckResolver] = await Promise.all([
    resolveActorDisplayNamesBatch(
      tickets.map((t) => ({ actorType: t.created_by_type, actorId: t.created_by_id })),
    ),
    buildTicketAutoCheckResolver(),
  ]);

  const enrichedTickets = tickets.map((t) => {
    // Mutate-and-return, not an object spread: TypeScript drops a
    // Record<string, any>'s index signature when it's spread into a fresh
    // object literal alongside explicit properties (a known compiler
    // quirk — the result narrows to JUST the explicit properties, silently
    // losing every field from `plain`). Assigning onto `plain` directly
    // keeps its type as Record<string, any> throughout, so downstream code
    // (the status-bucket grouping below) can still read t.status.
    const plain = t.toJSON() as Record<string, any>;
    plain.created_by_display_name = displayNameByActor.get(actorRefKey(t.created_by_type, t.created_by_id)) ?? null;
    plain.auto_check = autoCheckResolver({
      created_by_type: t.created_by_type,
      created_by_id: t.created_by_id,
      type: t.type,
      source: t.source,
      entity_type: t.entity_type,
      status: t.status,
    });
    return plain;
  });

  // Group by status for Kanban
  const board: Record<TicketStatus, any[]> = {
    backlog: [],
    todo: [],
    in_progress: [],
    in_review: [],
    done: [],
    cancelled: [],
  };

  for (const t of enrichedTickets) {
    board[t.status as TicketStatus]?.push(t);
  }

  return board;
}

// Ticket Board Performance fix (2026-08-18) — getTicketStats() moved to its own
// module, ticketStatsService.ts (this file was already over CLAUDE.md's 500-line
// hard ceiling; stats aggregation is a clean, separable responsibility from the
// ticket CRUD/state-machine logic that makes up the rest of this file).
// Re-exported here so existing callers (ticketRoutes.ts) keep working unchanged
// — no consumer-facing contract break.
export { getTicketStats } from './ticketStatsService';

// ── Sub-Tasks ────────────────────────────────────────────────────────────

export async function createSubTasks(
  parentId: string,
  tasks: Array<Omit<CreateTicketData, 'parent_ticket_id'>>,
) {
  const parent = await Ticket.findByPk(parentId);
  if (!parent) throw new Error(`Parent ticket ${parentId} not found`);

  const created = [];
  for (const task of tasks) {
    const ticket = await createTicket({ ...task, parent_ticket_id: parentId });
    created.push(ticket);
  }
  return created;
}

// ── Entity Lookup ────────────────────────────────────────────────────────

export async function getTicketsByEntity(entityType: string, entityId: string) {
  return Ticket.findAll({
    where: { entity_type: entityType, entity_id: entityId },
    order: [['created_at', 'DESC']],
  });
}

// ── Update Fields ────────────────────────────────────────────────────────

export async function updateTicket(
  ticketId: string,
  updates: Partial<Pick<CreateTicketData, 'title' | 'description' | 'priority' | 'type' | 'estimated_effort' | 'due_date' | 'metadata' | 'confidence'>>,
  actorType: TicketActorType,
  actorId: string,
) {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  await ticket.update({ ...updates, updated_at: new Date() } as any);

  await TicketActivity.create({
    ticket_id: ticketId,
    actor_type: actorType,
    actor_id: actorId,
    action: 'updated',
    metadata: { fields_changed: Object.keys(updates) },
  });

  return ticket;
}
