// ─── Ticket Management Agent ─────────────────────────────────────────────────
// Cron (every 15 min). Auto-assigns unassigned tickets to appropriate agents,
// escalates stale tickets, and manages ticket lifecycle.

import { Op } from 'sequelize';
import { Ticket } from '../../models';
import { assignTicket, updateTicketStatus, addTicketComment } from '../ticketService';
import { dispatchTicketToAgent } from '../ticketAgentDispatcher';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'TicketManagementAgent';
const STALE_HOURS = 48; // Escalate tickets older than 48h in in_progress

export async function runTicketManagementAgent(): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // 1. Auto-dispatch unassigned tickets in "todo" status
    const unassigned = await Ticket.findAll({
      where: {
        status: 'todo',
        assigned_to_id: { [Op.is]: null as any },
      },
      order: [['priority', 'ASC'], ['created_at', 'ASC']],
      limit: 10,
    });

    for (const ticket of unassigned) {
      try {
        const result = await dispatchTicketToAgent(ticket.id);
        if (result) {
          actions.push({
            campaign_id: '',
            action: 'auto_dispatched',
            reason: `Auto-dispatched TK-${ticket.ticket_number} to ${result.agent_name}`,
            confidence: 0.8,
            before_state: { status: ticket.status, assigned: null },
            after_state: { agent: result.agent_name },
            result: 'success',
            entity_type: 'system',
            entity_id: ticket.id,
          });
        }
      } catch (err: any) {
        errors.push(`TK-${ticket.ticket_number}: ${err.message}`);
      }
    }

    // 2. Escalate stale tickets (in_progress for too long)
    const staleDate = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
    const staleTickets = await Ticket.findAll({
      where: {
        status: 'in_progress',
        updated_at: { [Op.lt]: staleDate },
      },
      limit: 10,
    });

    for (const ticket of staleTickets) {
      // Escalate priority if not already critical
      if (ticket.priority !== 'critical') {
        const newPriority = ticket.priority === 'low' ? 'medium' : ticket.priority === 'medium' ? 'high' : 'critical';
        await ticket.update({ priority: newPriority, updated_at: new Date() } as any);
        await addTicketComment(
          ticket.id,
          `⚠️ Auto-escalated from ${ticket.priority} → ${newPriority} (stale for ${STALE_HOURS}+ hours)`,
          'agent',
          AGENT_NAME,
        );

        actions.push({
          campaign_id: '',
          action: 'escalated',
          reason: `TK-${ticket.ticket_number} stale for ${STALE_HOURS}+ hours`,
          confidence: 1.0,
          before_state: { priority: ticket.priority },
          after_state: { priority: newPriority },
          result: 'success',
          entity_type: 'system',
          entity_id: ticket.id,
        });
      }
    }

    // 3. Auto-close old "in_review" tickets (>7 days)
    const autoCloseDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const reviewTickets = await Ticket.findAll({
      where: {
        status: 'in_review',
        updated_at: { [Op.lt]: autoCloseDate },
      },
      limit: 10,
    });

    for (const ticket of reviewTickets) {
      await updateTicketStatus(ticket.id, 'done', 'agent', AGENT_NAME);
      await addTicketComment(
        ticket.id,
        '✅ Auto-closed: in review for 7+ days with no activity',
        'agent',
        AGENT_NAME,
      );

      actions.push({
        campaign_id: '',
        action: 'auto_closed',
        reason: `TK-${ticket.ticket_number} in review for 7+ days`,
        confidence: 0.9,
        before_state: { status: 'in_review' },
        after_state: { status: 'done' },
        result: 'success',
        entity_type: 'system',
        entity_id: ticket.id,
      });
    }
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    entities_processed: actions.length,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
  };
}
