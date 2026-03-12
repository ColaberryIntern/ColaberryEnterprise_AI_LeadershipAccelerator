// ─── Ticket Agent Dispatcher ──────────────────────────────────────────────────
// Maps tickets to the appropriate agent for execution.
// Called from Cory (auto_dispatch) or manually via POST /tickets/:id/dispatch.

import { Ticket } from '../models';
import {
  updateTicketStatus,
  assignTicket,
  addAgentOutput,
  addTicketComment,
} from './ticketService';
import * as coryDecisionEngine from './reporting/coryDecisionEngine';
import type { AgentExecutionResult } from './agents/types';
import { runCurriculumArchitectAgent } from './agents/curriculumArchitectAgent';
import { runArtifactGenerationAgent } from './agents/artifactGenerationAgent';
import { runCurriculumQAAgent } from './agents/curriculumQAAgent';
import { runPlatformFixAgent } from './agents/platformFixAgent';

// ─── Agent Registry Mapping ──────────────────────────────────────────────────

interface AgentMapping {
  match: (ticket: any) => boolean;
  agent_name: string;
  execute: (ticket: any) => Promise<AgentExecutionResult>;
}

const AGENT_MAPPINGS: AgentMapping[] = [
  {
    match: (t) => t.type === 'curriculum' && t.metadata?.action === 'design_module',
    agent_name: 'CurriculumArchitectAgent',
    execute: async (ticket) => runCurriculumArchitectAgent(ticket.id, ticket.metadata || {}),
  },
  {
    match: (t) => t.type === 'curriculum' && t.metadata?.action === 'generate_artifact',
    agent_name: 'ArtifactGenerationAgent',
    execute: async (ticket) => runArtifactGenerationAgent(ticket.id, ticket.metadata || {}),
  },
  {
    match: (t) => t.type === 'curriculum' && t.metadata?.action === 'qa_check',
    agent_name: 'CurriculumQAAgent',
    execute: async () => runCurriculumQAAgent(),
  },
  {
    match: (t) => t.type === 'bug',
    agent_name: 'PlatformFixAgent',
    execute: async (ticket) => runPlatformFixAgent(ticket.id, { title: ticket.title, description: ticket.description, ...ticket.metadata }),
  },
  {
    match: (t) => t.type === 'curriculum',
    agent_name: 'CurriculumArchitectAgent',
    execute: async (ticket) => runCurriculumArchitectAgent(ticket.id, ticket.metadata || {}),
  },
];

// ─── Dispatcher ──────────────────────────────────────────────────────────────

// ─── Strategic Completion Hook ───────────────────────────────────────────────
// When a strategic ticket reaches 'done', trigger outcome tracking so the
// Decision Engine can compare predicted vs actual results and update the
// simulation accuracy learning loop.

export async function onTicketStatusChange(ticketId: string, newStatus: string): Promise<void> {
  if (newStatus !== 'done') return;

  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) return;

  // Only track strategic tickets created by Cory Decision Engine
  if ((ticket as any).type === 'strategic' && (ticket as any).source === 'cory') {
    try {
      await coryDecisionEngine.trackExecutionOutcome(ticketId);
    } catch (_err) {
      // Non-critical: tracking failure should not block ticket state transition
    }
  }
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function dispatchTicketToAgent(ticketId: string): Promise<AgentExecutionResult | null> {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  // Find matching agent
  const mapping = AGENT_MAPPINGS.find((m) => m.match(ticket));

  if (!mapping) {
    await addTicketComment(
      ticketId,
      'No agent mapping found for this ticket type. Manual intervention required.',
      'cory',
      'ticket_dispatcher',
    );
    return null;
  }

  // Assign ticket to agent
  await assignTicket(ticketId, 'agent', mapping.agent_name, 'cory', 'ticket_dispatcher');

  // Move to in_progress if currently in backlog or todo
  if (ticket.status === 'backlog' || ticket.status === 'todo') {
    await updateTicketStatus(ticketId, 'in_progress', 'agent', mapping.agent_name);
  }

  // Execute agent
  const startTime = Date.now();
  try {
    const result = await mapping.execute(ticket);

    // Log agent output
    await addAgentOutput(ticketId, mapping.agent_name, result);

    // Move to in_review if agent succeeded
    if (result.errors.length === 0) {
      await updateTicketStatus(ticketId, 'in_review', 'agent', mapping.agent_name);
    }

    return result;
  } catch (err: any) {
    const errorResult: AgentExecutionResult = {
      agent_name: mapping.agent_name,
      campaigns_processed: 0,
      actions_taken: [],
      errors: [err.message],
      duration_ms: Date.now() - startTime,
    };
    await addAgentOutput(ticketId, mapping.agent_name, errorResult);
    await addTicketComment(ticketId, `Agent error: ${err.message}`, 'agent', mapping.agent_name);
    return errorResult;
  }
}

