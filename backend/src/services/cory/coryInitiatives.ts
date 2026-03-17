/**
 * Cory Strategic Initiative Service
 *
 * Creates and manages strategic initiatives that are tracked through
 * the ticket system. Each initiative generates a parent ticket with
 * automatic subtask creation.
 */

import StrategicInitiative, { type InitiativeType, type InitiativeStatus } from '../../models/StrategicInitiative';
import { createTicket, createSubTasks, updateTicketStatus, addTicketComment } from '../ticketService';
import AgentTask from '../../models/AgentTask';
import { logAiEvent } from '../aiEventService';
import { Op } from 'sequelize';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateInitiativeInput {
  title: string;
  description: string;
  initiative_type: InitiativeType;
  priority?: string;
  source_decision_id?: string;
  involved_departments?: string[];
  involved_agents?: string[];
  strategic_priority?: string;
  expected_impact?: Record<string, any>;
  subtasks?: Array<{ title: string; effort?: string }>;
}

export interface InitiativeSummary {
  id: string;
  title: string;
  initiative_type: InitiativeType;
  priority: string;
  status: InitiativeStatus;
  ticket_id: string | null;
  involved_departments: string[] | null;
  involved_agents: string[] | null;
  created_by: string;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Create Initiative + Ticket
// ---------------------------------------------------------------------------

/**
 * Create a strategic initiative and its tracking ticket with subtasks.
 * This is the primary integration point between CoryBrain and the ticket system.
 */
export async function createStrategicInitiative(input: CreateInitiativeInput): Promise<StrategicInitiative> {
  // Dedup: check if an identical initiative already exists and is active
  const existing = await StrategicInitiative.findOne({
    where: {
      title: input.title,
      status: { [Op.notIn]: ['completed', 'cancelled'] },
    },
  });
  if (existing) return existing;

  // 1. Create the parent ticket in the ticket system
  const ticket = await createTicket({
    title: `[Initiative] ${input.title}`,
    description: input.description,
    type: input.initiative_type as any, // Extended ticket types
    priority: (input.priority as any) || 'medium',
    source: 'cory:evolution',
    created_by_type: 'cory',
    created_by_id: 'CoryBrain',
    metadata: {
      initiative_type: input.initiative_type,
      involved_departments: input.involved_departments || [],
      involved_agents: input.involved_agents || [],
      strategic_priority: input.strategic_priority || input.priority || 'medium',
      created_by: 'cory',
    },
    confidence: 0.8,
    estimated_effort: 'large',
  });

  // 2. Create the strategic initiative record
  const initiative = await StrategicInitiative.create({
    title: input.title,
    description: input.description,
    initiative_type: input.initiative_type,
    priority: input.priority || 'medium',
    source_decision_id: input.source_decision_id || null,
    involved_departments: input.involved_departments || null,
    involved_agents: input.involved_agents || null,
    ticket_id: ticket.id,
    created_by: 'CoryBrain',
    status: 'proposed',
    strategic_priority: input.strategic_priority || null,
    expected_impact: input.expected_impact || null,
  });

  // 3. Create subtask tickets
  if (input.subtasks && input.subtasks.length > 0) {
    await createSubTasks(
      ticket.id,
      input.subtasks.map(st => ({
        title: st.title,
        type: 'task' as any,
        priority: (input.priority as any) || 'medium',
        source: 'cory:evolution',
        created_by_type: 'cory' as const,
        created_by_id: 'CoryBrain',
        estimated_effort: st.effort || 'medium',
        metadata: {
          initiative_id: initiative.id,
          initiative_type: input.initiative_type,
        },
      })),
    );
  }

  await logAiEvent('CoryBrain', 'INITIATIVE_CREATED', 'strategic_initiatives', initiative.id, {
    title: input.title,
    type: input.initiative_type,
    ticket_id: ticket.id,
    subtasks: input.subtasks?.length || 0,
    departments: input.involved_departments,
    agents: input.involved_agents,
  }).catch(() => {});

  return initiative;
}

// ---------------------------------------------------------------------------
// Initiative Management
// ---------------------------------------------------------------------------

export async function approveInitiative(initiativeId: string, reviewedBy: string): Promise<StrategicInitiative> {
  const initiative = await StrategicInitiative.findByPk(initiativeId);
  if (!initiative) throw new Error(`Initiative ${initiativeId} not found`);
  if (initiative.status !== 'proposed') throw new Error(`Initiative already ${initiative.status}`);

  await initiative.update({
    status: 'approved',
    updated_at: new Date(),
  });

  // Move parent ticket to todo
  if (initiative.ticket_id) {
    await updateTicketStatus(initiative.ticket_id, 'todo', 'human', reviewedBy);
    await addTicketComment(initiative.ticket_id, `Initiative approved by ${reviewedBy}`, 'human', reviewedBy);
  }

  await logAiEvent('CoryBrain', 'INITIATIVE_APPROVED', 'strategic_initiatives', initiativeId, {
    reviewed_by: reviewedBy,
  }).catch(() => {});

  return initiative;
}

export async function rejectInitiative(initiativeId: string, reviewedBy: string, reason?: string): Promise<StrategicInitiative> {
  const initiative = await StrategicInitiative.findByPk(initiativeId);
  if (!initiative) throw new Error(`Initiative ${initiativeId} not found`);
  if (initiative.status !== 'proposed') throw new Error(`Initiative already ${initiative.status}`);

  await initiative.update({
    status: 'cancelled',
    updated_at: new Date(),
  });

  // Cancel parent ticket
  if (initiative.ticket_id) {
    await updateTicketStatus(initiative.ticket_id, 'cancelled', 'human', reviewedBy);
    if (reason) {
      await addTicketComment(initiative.ticket_id, `Rejected: ${reason}`, 'human', reviewedBy);
    }
  }

  return initiative;
}

export async function startInitiative(initiativeId: string): Promise<StrategicInitiative> {
  const initiative = await StrategicInitiative.findByPk(initiativeId);
  if (!initiative) throw new Error(`Initiative ${initiativeId} not found`);

  await initiative.update({
    status: 'in_progress',
    updated_at: new Date(),
  });

  // Move ticket to in_progress
  if (initiative.ticket_id) {
    await updateTicketStatus(initiative.ticket_id, 'in_progress', 'cory', 'CoryBrain').catch(() => {});
  }

  return initiative;
}

export async function completeInitiative(initiativeId: string): Promise<StrategicInitiative> {
  const initiative = await StrategicInitiative.findByPk(initiativeId);
  if (!initiative) throw new Error(`Initiative ${initiativeId} not found`);

  await initiative.update({
    status: 'completed',
    updated_at: new Date(),
  });

  // Mark ticket done
  if (initiative.ticket_id) {
    await updateTicketStatus(initiative.ticket_id, 'done', 'cory', 'CoryBrain').catch(() => {});
  }

  return initiative;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getActiveInitiatives(): Promise<StrategicInitiative[]> {
  return StrategicInitiative.findAll({
    where: { status: { [Op.notIn]: ['completed', 'cancelled'] } },
    order: [['created_at', 'DESC']],
    limit: 50,
  });
}

export async function getInitiativesByStatus(status: InitiativeStatus): Promise<StrategicInitiative[]> {
  return StrategicInitiative.findAll({
    where: { status },
    order: [['created_at', 'DESC']],
    limit: 50,
  });
}

export async function getInitiativeStats(): Promise<{
  total: number;
  proposed: number;
  approved: number;
  in_progress: number;
  completed: number;
  cancelled: number;
}> {
  // Use SQL GROUP BY instead of loading all rows into memory
  const rows = await StrategicInitiative.findAll({
    attributes: [
      'status',
      [StrategicInitiative.sequelize!.fn('COUNT', StrategicInitiative.sequelize!.col('id')), 'count'],
    ],
    group: ['status'],
    raw: true,
  }) as unknown as { status: string; count: string }[];

  const counts = { total: 0, proposed: 0, approved: 0, in_progress: 0, completed: 0, cancelled: 0 };
  for (const row of rows) {
    const n = parseInt(row.count, 10);
    counts.total += n;
    if (row.status in counts) (counts as any)[row.status] = n;
  }
  return counts;
}

export async function getRecentInitiatives(limit = 20): Promise<InitiativeSummary[]> {
  const initiatives = await StrategicInitiative.findAll({
    order: [['created_at', 'DESC']],
    limit,
  });

  return initiatives.map(i => ({
    id: i.id,
    title: i.title,
    initiative_type: i.initiative_type,
    priority: i.priority,
    status: i.status,
    ticket_id: i.ticket_id,
    involved_departments: i.involved_departments,
    involved_agents: i.involved_agents,
    created_by: i.created_by,
    created_at: i.created_at,
  }));
}
