// ─── Cory Strategic Agent ─────────────────────────────────────────────────────
// On-demand agent invoked by CoryEngine for ticket creation, curriculum planning,
// and strategic plan generation. Translates natural language into structured tickets.

import { chatCompletion } from '../assistant/openaiHelper';
import { createTicket, createSubTasks } from '../../services/ticketService';
import type { CoryIntent } from '../strategy/coryEngine';
import type { TicketPriority, TicketType } from '../../models/Ticket';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlannedTicket {
  title: string;
  description: string;
  priority: TicketPriority;
  type: TicketType;
  estimated_effort: 'small' | 'medium' | 'large';
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, any>;
  sub_tasks?: Array<{
    title: string;
    description: string;
    type: TicketType;
    estimated_effort: 'small' | 'medium' | 'large';
    metadata?: Record<string, any>;
  }>;
}

interface StrategicAgentResult {
  tickets_created: Array<{ id: string; ticket_number: number; title: string }>;
  plan_summary: string;
  agents_to_dispatch: string[];
  confidence: number;
}

// ─── System Prompts ──────────────────────────────────────────────────────────

const PLANNING_SYSTEM_PROMPT = `You are a strategic planning agent for the Colaberry Enterprise AI Leadership Accelerator platform.

Given a natural language command, decompose it into actionable tickets.

For CURRICULUM planning:
- Create a parent "strategic" ticket for the overall plan
- Create sub-tasks for: module design, lesson creation, artifact generation, QA checks
- Use type "curriculum" for curriculum work, "task" for general tasks
- Set estimated_effort: small (<1h), medium (1-4h), large (4h+)
- Reference entity_type/entity_id when operating on existing entities

For BUG/FIX requests:
- Create a single "bug" type ticket with clear reproduction steps in description
- Priority: critical if production-affecting, high if user-facing, medium otherwise

For STRATEGIC PLANS:
- Create a parent "strategic" ticket with the plan overview
- Create phased sub-tasks with dependencies noted in metadata

For GENERAL TICKETS:
- Create a single ticket matching the request

Available agents that can be dispatched:
- CurriculumArchitectAgent: designs curriculum modules/lessons
- ArtifactGenerationAgent: generates slides, labs, datasets
- CurriculumQAAgent: validates curriculum integrity
- PlatformFixAgent: diagnoses and fixes platform bugs
- CurriculumOptimizerAgent: analyzes student data for improvements

Return JSON:
{
  "tickets": [{ title, description, priority, type, estimated_effort, entity_type?, entity_id?, metadata?, sub_tasks? }],
  "plan_summary": "1-2 sentence summary of the plan",
  "agents_to_dispatch": ["AgentName", ...],
  "confidence": 0.0-1.0
}`;

// ─── Main Execution ──────────────────────────────────────────────────────────

export async function executeCoryStrategicAgent(
  command: string,
  intent: CoryIntent,
  context?: Record<string, any>,
): Promise<StrategicAgentResult> {
  const userPrompt = [
    `Intent: ${intent}`,
    `Command: ${command}`,
    context ? `Context: ${JSON.stringify(context)}` : '',
  ].filter(Boolean).join('\n');

  let planned: {
    tickets: PlannedTicket[];
    plan_summary: string;
    agents_to_dispatch: string[];
    confidence: number;
  };

  try {
    const llmResult = await chatCompletion(
      PLANNING_SYSTEM_PROMPT,
      userPrompt,
      { json: true, maxTokens: 2000, temperature: 0.2 },
    );

    if (!llmResult) throw new Error('No LLM response');
    planned = JSON.parse(llmResult);
  } catch {
    // Fallback: create a single ticket from the command
    planned = {
      tickets: [{
        title: command.slice(0, 200),
        description: command,
        priority: intent === 'fix_platform' ? 'high' : 'medium',
        type: intent === 'fix_platform' ? 'bug' : intent === 'plan_curriculum' ? 'curriculum' : 'task',
        estimated_effort: 'medium',
      }],
      plan_summary: `Created ticket from command: ${command.slice(0, 100)}`,
      agents_to_dispatch: [],
      confidence: 0.5,
    };
  }

  // Create tickets in DB
  const createdTickets: Array<{ id: string; ticket_number: number; title: string }> = [];

  for (const planned_ticket of planned.tickets) {
    const source = `cory:${intent}`;

    const ticket = await createTicket({
      title: planned_ticket.title,
      description: planned_ticket.description,
      priority: planned_ticket.priority || 'medium',
      type: planned_ticket.type || 'task',
      source,
      created_by_type: 'cory',
      created_by_id: 'cory_strategic_agent',
      estimated_effort: planned_ticket.estimated_effort,
      entity_type: planned_ticket.entity_type || undefined,
      entity_id: planned_ticket.entity_id || undefined,
      metadata: {
        ...planned_ticket.metadata,
        intent,
        original_command: command,
        agents_to_dispatch: planned.agents_to_dispatch,
      },
      confidence: planned.confidence,
    });

    createdTickets.push({
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      title: ticket.title,
    });

    // Create sub-tasks if any
    if (planned_ticket.sub_tasks && planned_ticket.sub_tasks.length > 0) {
      const subTaskData = planned_ticket.sub_tasks.map((st) => ({
        title: st.title,
        description: st.description,
        type: st.type || ('task' as TicketType),
        priority: planned_ticket.priority || ('medium' as TicketPriority),
        estimated_effort: st.estimated_effort,
        source,
        created_by_type: 'cory' as const,
        created_by_id: 'cory_strategic_agent',
        metadata: { ...st.metadata, intent },
        confidence: planned.confidence,
      }));

      const subs = await createSubTasks(ticket.id, subTaskData);
      for (const sub of subs) {
        createdTickets.push({
          id: sub.id,
          ticket_number: sub.ticket_number,
          title: sub.title,
        });
      }
    }
  }

  return {
    tickets_created: createdTickets,
    plan_summary: planned.plan_summary || `Created ${createdTickets.length} ticket(s)`,
    agents_to_dispatch: planned.agents_to_dispatch || [],
    confidence: Math.round((planned.confidence || 0.7) * 100),
  };
}
