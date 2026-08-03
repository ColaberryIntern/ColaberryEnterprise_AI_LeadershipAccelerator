// ─── Ticket Agent Dispatcher ──────────────────────────────────────────────────
// Maps tickets to the appropriate agent for execution.
// Called from Cory (auto_dispatch) or manually via POST /tickets/:id/dispatch.

import crypto from 'crypto';
import { Ticket, AgentRun } from '../models';
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
import { emitEvent } from './workLedger/workLedgerService';
import type { WorkLedgerEventInput } from '../schemas/workLedgerEventSchema';

// ProofDesk Work Ledger (Milestone 1 - Foundation, shadow mode). These three
// helpers wrap AgentRun/emitEvent writes so a ledger failure can never change
// dispatchTicketToAgent's existing return value or thrown-error behavior for its
// two real callers (ticketManagementAgent's cron, the manual dispatch route).
async function createAgentRunSafe(fields: {
  ticketId: string;
  agentName: string;
  traceId: string;
}): Promise<InstanceType<typeof AgentRun> | null> {
  try {
    return await AgentRun.create({
      ticket_id: fields.ticketId,
      agent_name: fields.agentName,
      trace_id: fields.traceId,
      status: 'running',
    } as any);
  } catch (err: any) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'ticketAgentDispatcher',
        event: 'agent_run_create_failed',
        outcome: 'failure',
        error_class: err?.name || 'Error',
        context: { ticket_id: fields.ticketId, agent_name: fields.agentName, message: err?.message },
      }),
    );
    return null;
  }
}

async function finishAgentRunSafe(
  agentRun: InstanceType<typeof AgentRun> | null,
  fields: { status: string; result: string; durationMs: number },
): Promise<void> {
  if (!agentRun) return;
  try {
    await agentRun.update({
      status: fields.status,
      result: fields.result,
      ended_at: new Date(),
      duration_ms: fields.durationMs,
    } as any);
  } catch (err: any) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'ticketAgentDispatcher',
        event: 'agent_run_update_failed',
        outcome: 'failure',
        error_class: err?.name || 'Error',
        context: { agent_run_id: (agentRun as any).id, message: err?.message },
      }),
    );
  }
}

async function emitLedgerEventSafe(input: WorkLedgerEventInput): Promise<void> {
  try {
    await emitEvent(input);
  } catch (err: any) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'ticketAgentDispatcher',
        event: 'work_ledger_emit_failed',
        outcome: 'failure',
        error_class: err?.error_class || err?.name || 'Error',
        context: { action_class: input.actionClass, idempotency_key: input.idempotencyKey, message: err?.message },
      }),
    );
  }
}

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

  const traceId = crypto.randomUUID();
  const agentRun = await createAgentRunSafe({
    ticketId,
    agentName: mapping ? mapping.agent_name : 'unmapped',
    traceId,
  });
  const dispatchIdempotencyKey = agentRun ? `ticket-dispatch:${agentRun.id}` : `ticket-dispatch:${traceId}`;

  if (!mapping) {
    await addTicketComment(
      ticketId,
      'No agent mapping found for this ticket type. Manual intervention required.',
      'cory',
      'ticket_dispatcher',
    );
    await finishAgentRunSafe(agentRun, { status: 'skipped', result: 'skipped', durationMs: 0 });
    await emitLedgerEventSafe({
      ticketId,
      runId: agentRun?.id,
      traceId,
      actorType: 'agent',
      actorId: 'ticket_dispatcher',
      intent: 'ticket.dispatch',
      domain: 'tickets',
      actionClass: 'ticket_dispatch',
      targetType: 'ticket',
      targetId: ticketId,
      idempotencyKey: dispatchIdempotencyKey,
      result: 'skipped',
      reasonCode: 'no_agent_mapping',
      sourceRecordType: 'ticket',
      sourceRecordId: ticketId,
    });
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

    const durationMs = Date.now() - startTime;
    const runResult = result.errors.length === 0 ? 'success' : 'failure';
    await finishAgentRunSafe(agentRun, {
      status: runResult === 'success' ? 'success' : 'failed',
      result: runResult,
      durationMs,
    });
    await emitLedgerEventSafe({
      ticketId,
      runId: agentRun?.id,
      traceId,
      actorType: 'agent',
      actorId: mapping.agent_name,
      intent: 'ticket.dispatch',
      domain: 'tickets',
      actionClass: 'ticket_dispatch',
      targetType: 'ticket',
      targetId: ticketId,
      idempotencyKey: dispatchIdempotencyKey,
      result: runResult,
      durationMs,
      sourceRecordType: 'ticket',
      sourceRecordId: ticketId,
    });

    return result;
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const errorResult: AgentExecutionResult = {
      agent_name: mapping.agent_name,
      campaigns_processed: 0,
      actions_taken: [],
      errors: [err.message],
      duration_ms: durationMs,
    };
    await addAgentOutput(ticketId, mapping.agent_name, errorResult);
    await addTicketComment(ticketId, `Agent error: ${err.message}`, 'agent', mapping.agent_name);

    await finishAgentRunSafe(agentRun, { status: 'failed', result: 'failure', durationMs });
    await emitLedgerEventSafe({
      ticketId,
      runId: agentRun?.id,
      traceId,
      actorType: 'agent',
      actorId: mapping.agent_name,
      intent: 'ticket.dispatch',
      domain: 'tickets',
      actionClass: 'ticket_dispatch',
      targetType: 'ticket',
      targetId: ticketId,
      idempotencyKey: dispatchIdempotencyKey,
      result: 'failure',
      reasonCode: 'agent_threw',
      durationMs,
      sourceRecordType: 'ticket',
      sourceRecordId: ticketId,
    });

    return errorResult;
  }
}

