/**
 * Ticket Orchestrator — Universal Ticket Creation Layer
 *
 * Wraps Ticket.create with consistent patterns for all system actors.
 * Ensures every action in the company layer is tracked via tickets.
 * Creates TicketActivity audit trail entries automatically.
 */

interface TicketInput {
  title: string;
  description?: string;
  type: string;
  priority?: string;
  source: string;
  createdByType: 'human' | 'cory' | 'agent';
  createdById: string;
  companyId?: string;
  goalId?: string;
  directiveId?: string;
  entityType?: string;
  entityId?: string;
  parentTicketId?: string;
  assignedToType?: string;
  assignedToId?: string;
  metadata?: Record<string, any>;
  confidence?: number;
}

export async function createTrackedTicket(input: TicketInput) {
  const { Ticket, TicketActivity } = await import('../../models');

  const ticket = await (Ticket as any).create({
    title: input.title,
    description: input.description || '',
    type: input.type,
    priority: input.priority || 'medium',
    status: 'backlog',
    source: input.source,
    created_by_type: input.createdByType,
    created_by_id: input.createdById,
    company_id: input.companyId || null,
    goal_id: input.goalId || null,
    directive_id: input.directiveId || null,
    entity_type: input.entityType || null,
    entity_id: input.entityId || null,
    parent_ticket_id: input.parentTicketId || null,
    assigned_to_type: input.assignedToType || null,
    assigned_to_id: input.assignedToId || null,
    metadata: input.metadata || {},
    confidence: input.confidence || null,
  });

  // Create audit trail entry
  await (TicketActivity as any).create({
    ticket_id: ticket.id,
    actor_type: input.createdByType,
    actor_id: input.createdById,
    action: 'created',
    to_value: 'backlog',
    metadata: { title: input.title, type: input.type, priority: input.priority || 'medium', source: input.source },
  });

  return ticket;
}

// ─── Specialized ticket creators ────────────────────────────────────────────

export async function createDirectiveTicket(directiveId: string, companyId: string, objective: string, priority: string, department: string) {
  return createTrackedTicket({
    title: `[CEO Directive] ${objective.substring(0, 200)}`,
    description: `Company directive targeting ${department}. Priority: ${priority}.`,
    type: 'company_directive',
    priority,
    source: 'company_ceo_agent',
    createdByType: 'agent',
    createdById: 'company_strategy_agent',
    companyId,
    directiveId,
    entityType: 'department',
    entityId: department,
    metadata: { directive_id: directiveId, department, objective },
  });
}

export async function createWorkforceTicket(companyId: string, agentName: string, decision: string, reasoning: string, priority: string = 'medium') {
  return createTrackedTicket({
    title: `[Workforce] ${decision.substring(0, 200)}`,
    description: reasoning,
    type: 'workforce_decision',
    priority,
    source: 'workforce_intelligence',
    createdByType: 'agent',
    createdById: 'workforce_intelligence_engine',
    companyId,
    entityType: 'agent',
    entityId: agentName,
    metadata: { agent_name: agentName, decision, reasoning },
  });
}

export async function createBPOSTicket(companyId: string, bpName: string, stage: string, bpId: string, parentTicketId?: string) {
  return createTrackedTicket({
    title: `[BPOS] ${bpName} — ${stage}`,
    description: `BPOS execution stage: ${stage} for business process "${bpName}"`,
    type: 'bpos_execution',
    priority: 'medium',
    source: 'bpos_engine',
    createdByType: 'cory',
    createdById: 'bpos_orchestrator',
    companyId,
    entityType: 'capability',
    entityId: bpId,
    parentTicketId,
    metadata: { bp_name: bpName, stage, bp_id: bpId },
  });
}

export async function updateTicketStatus(ticketId: string, newStatus: string, actorType: string, actorId: string, comment?: string) {
  const { Ticket, TicketActivity } = await import('../../models');
  const ticket = await (Ticket as any).findByPk(ticketId);
  if (!ticket) return null;

  const oldStatus = ticket.status;
  await ticket.update({
    status: newStatus,
    ...(newStatus === 'done' ? { completed_at: new Date() } : {}),
  });

  await (TicketActivity as any).create({
    ticket_id: ticketId,
    actor_type: actorType,
    actor_id: actorId,
    action: 'status_changed',
    from_value: oldStatus,
    to_value: newStatus,
    comment: comment || null,
  });

  return ticket;
}

export async function addTicketOutput(ticketId: string, agentName: string, output: Record<string, any>) {
  const { TicketActivity } = await import('../../models');
  await (TicketActivity as any).create({
    ticket_id: ticketId,
    actor_type: 'agent',
    actor_id: agentName,
    action: 'agent_output',
    metadata: output,
  });
}
