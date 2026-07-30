/**
 * workforceAgentRuntime — the single gate every AI Workforce director action
 * runs through. Two entry points: runDirectorWrite (write_with_audit tier —
 * internal task/message queue only) and runDirectorProposal (suggest_only
 * tier — the one outward-facing director, requires human approval before
 * anything happens). Both hard-check kill switch / safe mode / enabled
 * BEFORE any write, independent of the repo's global abac_enforcement shadow
 * default — a director cannot act while paused, regardless of that setting.
 * See docs/trust-audit/gap-analysis.md (P0-2, P1-1..P1-3) for the gaps this closes.
 */
import AiAgent from '../../models/AiAgent';
import { isKillSwitchActive } from '../launchSafety';
import { isSafeModeActive } from '../systemControlService';
import { validateAgentWrite, createProposal } from '../agentPermissionService';
import { logAgentActivity, emitAiEvent } from '../aiEventService';
import { ensureTraceId } from '../../utils/requestContext';

export interface DirectorRunResult {
  ran: boolean;
  wrote: boolean;
  reason?: string;
  recordId?: string;
  costUsd: number;
}

interface GateOpen {
  ok: true;
  agent: AiAgent;
}
interface GateBlocked {
  ok: false;
  reason: string;
}

async function gate(agentName: string): Promise<GateOpen | GateBlocked> {
  const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
  if (!agent) return { ok: false, reason: 'agent_not_registered' };
  if (!agent.enabled || agent.status === 'paused') return { ok: false, reason: 'agent_disabled' };
  if (await isKillSwitchActive()) return { ok: false, reason: 'kill_switch_active' };
  if (await isSafeModeActive()) return { ok: false, reason: 'safe_mode_active' };
  return { ok: true, agent };
}

/**
 * Run a director's one direct write (write_with_audit tier). Caller supplies
 * `alreadyExists` (the idempotency check) and `create` (the one write) —
 * this function only decides whether the run is ALLOWED and records that it
 * happened; it never decides what gets written.
 */
export async function runDirectorWrite(params: {
  slug: string;
  agentName: string;
  operation: string;
  targetTable: string;
  alreadyExists: () => Promise<string | null>;
  create: () => Promise<{ id: string }>;
}): Promise<DirectorRunResult> {
  const traceId = ensureTraceId();
  const g = await gate(params.agentName);
  if (!g.ok) return { ran: false, wrote: false, reason: g.reason, costUsd: 0 };
  const agentId = g.agent.id;

  const existingId = await params.alreadyExists();
  if (existingId) {
    return { ran: true, wrote: false, reason: 'already_flagged', recordId: existingId, costUsd: 0 };
  }

  const check = await validateAgentWrite(
    agentId, params.agentName, params.operation, params.targetTable, params.slug, null, null, traceId,
  );
  if (!check.allowed) {
    await logAgentActivity({ agent_id: agentId, action: params.operation, result: 'skipped', reason: check.reason, trace_id: traceId });
    return { ran: true, wrote: false, reason: check.reason, costUsd: 0 };
  }

  const record = await params.create();

  await logAgentActivity({
    agent_id: agentId,
    action: params.operation,
    result: 'success',
    after_state: { id: record.id, target_table: params.targetTable },
    trace_id: traceId,
  });
  await emitAiEvent({
    event_type: 'agent.action',
    outcome: 'success',
    trace_id: traceId,
    workflow_id: `workforce_${params.slug}`,
    agent_id: agentId,
    cost_usd: 0,
    metadata: { operation: params.operation, target_table: params.targetTable, record_id: record.id },
  });

  return { ran: true, wrote: true, recordId: record.id, costUsd: 0 };
}

/**
 * Run a director's one suggest-only action (proposal tier). `build` receives
 * the gated agentId so an LLM call inside it can carry agent_id all the way
 * into ai_events — closing gap-analysis.md P1-2 for this call site — and so
 * money is only spent once the gate has already passed.
 */
export async function runDirectorProposal(params: {
  slug: string;
  agentName: string;
  build: (agentId: string) => Promise<{
    actionType: string;
    targetTable: string;
    targetId: string;
    proposedChanges: Record<string, any>;
    beforeState?: Record<string, any>;
    reason: string;
    confidence: number;
  }>;
}): Promise<DirectorRunResult> {
  const traceId = ensureTraceId();
  const g = await gate(params.agentName);
  if (!g.ok) return { ran: false, wrote: false, reason: g.reason, costUsd: 0 };
  const agentId = g.agent.id;

  const built = await params.build(agentId);
  const proposal = await createProposal(
    agentId, params.agentName, built.actionType, built.targetTable, built.targetId,
    built.proposedChanges, built.beforeState || {}, built.reason, built.confidence,
  );

  await logAgentActivity({
    agent_id: agentId,
    action: built.actionType,
    result: 'success',
    after_state: { proposal_id: proposal.id },
    trace_id: traceId,
  });
  await emitAiEvent({
    event_type: 'agent.action',
    outcome: 'success',
    trace_id: traceId,
    workflow_id: `workforce_${params.slug}`,
    agent_id: agentId,
    cost_usd: 0,
    metadata: { operation: built.actionType, target_table: built.targetTable, proposal_id: proposal.id },
  });

  return { ran: true, wrote: true, recordId: proposal.id, costUsd: 0 };
}

/** Whether a director is currently allowed to run at all (for the dashboard / manual-trigger button). */
export async function isDirectorGateOpen(agentName: string): Promise<{ open: boolean; reason?: string }> {
  const g = await gate(agentName);
  return g.ok ? { open: true } : { open: false, reason: g.reason };
}
