import { Op } from 'sequelize';
import { Ticket, TicketActivity } from '../models';
import type { TicketStatus, TicketPriority, TicketType, TicketActorType } from '../models/Ticket';
import type { AgentExecutionResult } from './agents/types';

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
}

// ── Create ───────────────────────────────────────────────────────────────

export async function createTicket(data: CreateTicketData) {
  // Deduplication: check for existing open ticket on same entity
  if (data.entity_type && data.entity_id && data.type) {
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

  const ticket = await Ticket.create({
    ...data,
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

  await TicketActivity.create({
    ticket_id: ticketId,
    actor_type: actorType,
    actor_id: actorId,
    action: 'status_changed',
    from_value: fromStatus,
    to_value: newStatus,
  });

  // Learning loop: when a strategic ticket reaches 'done', trigger outcome tracking
  if (newStatus === 'done' && (ticket as any).type === 'strategic' && (ticket as any).source === 'cory') {
    import('./reporting/coryDecisionEngine')
      .then((engine) => engine.trackExecutionOutcome(ticketId))
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

  return { ticket, activities, subTasks };
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

  const tickets = await Ticket.findAll({
    where,
    order: [
      ['priority', 'ASC'],
      ['created_at', 'DESC'],
    ],
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

  for (const t of tickets) {
    board[t.status]?.push(t);
  }

  return board;
}

export async function getTicketStats() {
  const tickets = await Ticket.findAll({ attributes: ['status', 'priority', 'type'], raw: true });

  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const t of tickets) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    byType[t.type] = (byType[t.type] || 0) + 1;
  }

  const openCount = (byStatus.backlog || 0) + (byStatus.todo || 0) +
    (byStatus.in_progress || 0) + (byStatus.in_review || 0);

  return { total: tickets.length, open: openCount, byStatus, byPriority, byType };
}

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
