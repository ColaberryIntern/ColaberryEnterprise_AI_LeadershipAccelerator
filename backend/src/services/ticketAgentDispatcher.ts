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
import { emitEvent } from './workLedger/workLedgerService';
import type { WorkLedgerEventInput } from '../schemas/workLedgerEventSchema';
// ProofDesk Work Graph (Milestone 3, T009): the agent-runner imports that used to
// live here (runCurriculumArchitectAgent, runArtifactGenerationAgent,
// runCurriculumQAAgent, runPlatformFixAgent) moved with AGENT_MAPPINGS to
// capabilityRegistry.ts, which owns calling them now.
import { selectAgent } from './workGraph/capabilityRouter';

// ProofDesk Work Ledger (Milestone 1 - Foundation, shadow mode). These three
// helpers wrap AgentRun/emitEvent writes so a ledger failure can never change
// dispatchTicketToAgent's existing return value or thrown-error behavior for its
// two real callers (ticketManagementAgent's cron, the manual dispatch route).
async function createAgentRunSafe(fields: {
  ticketId: string;
  agentName: string;
  traceId: string;
  // ProofDesk Work Graph (Milestone 3, T008): when set, this run is a retry of an
  // earlier failed run, and agent_runs.retry_of_run_id (added in M1, unused until
  // now) records the lineage. Populated by workCoordinatorService.retryFailedRun().
  retryOfRunId?: string;
}): Promise<InstanceType<typeof AgentRun> | null> {
  try {
    return await AgentRun.create({
      ticket_id: fields.ticketId,
      agent_name: fields.agentName,
      trace_id: fields.traceId,
      status: 'running',
      retry_of_run_id: fields.retryOfRunId ?? null,
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
// ProofDesk Work Graph (Milestone 3, T009): the old hard-coded, first-match-wins
// AGENT_MAPPINGS array has moved to backend/src/services/workGraph/
// capabilityRegistry.ts as CAPABILITY_REGISTRY (backward-compat seed data — all 5
// original entries ported verbatim, see that file + its regression test) and is
// now selected via the scored Capability Router (capabilityRouter.ts's
// selectAgent()) rather than a plain array .find(). Nothing below this comment
// changed except the single line that looks the mapping up (see dispatchTicketToAgent).

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

export async function dispatchTicketToAgent(
  ticketId: string,
  // ProofDesk Work Graph (Milestone 3, T008): optional retry lineage. The
  // AGENT_MAPPINGS lookup itself is untouched here on purpose - that swap to the
  // Capability Router is T009's own, separately-verified change.
  opts?: { retryOfRunId?: string }
): Promise<AgentExecutionResult | null> {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  // Find matching agent via the Capability Router (T009). `selection` is null
  // when nothing in the registry is eligible, exactly like the old
  // AGENT_MAPPINGS.find() returning undefined — the "no agent mapping found"
  // fallback path below needs no change.
  const selection = await selectAgent(ticket);
  const mapping = selection?.mapping ?? null;

  const traceId = crypto.randomUUID();
  const agentRun = await createAgentRunSafe({
    ticketId,
    agentName: mapping ? mapping.agent_name : 'unmapped',
    traceId,
    retryOfRunId: opts?.retryOfRunId,
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

