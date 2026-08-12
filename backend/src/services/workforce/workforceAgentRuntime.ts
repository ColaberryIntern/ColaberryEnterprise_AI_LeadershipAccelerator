/**
 * workforceAgentRuntime — the single gate every AI Workforce director action
 * runs through. Two entry points: runDirectorWrite (write_with_audit tier —
 * internal task/message queue only) and runDirectorProposal (suggest_only
 * tier — the one outward-facing director, requires human approval before
 * anything happens). Both hard-check kill switch / safe mode / enabled
 * BEFORE any write, independent of the repo's global abac_enforcement shadow
 * default — a director cannot act while paused, regardless of that setting.
 * See docs/trust-audit/gap-analysis.md (P0-2, P1-1..P1-3) for the gaps this closes.
 *
 * Every write also mirrors into the existing Tickets system (Ali's explicit
 * ask: "all work should be done through the ticketing system") — the ticket
 * is a visibility/action projection of a write already authorized above, not
 * a separately-gated capability, so it never blocks or fails the underlying
 * write if ticket creation itself has a problem. runDirectorWrite's ticket
 * lands in the default 'backlog' status (independent work, no approval
 * needed); runDirectorProposal's lands in 'in_review' and fires exactly one
 * email — the only case where a human needs to be in the loop at all. If
 * that email itself fails, the ticket still exists and sits visibly in
 * 'in_review' on the board — that's the recovery path; there is no retry
 * queue for this v1 notification side-channel.
 */
import { randomBytes } from 'crypto';
import AiAgent from '../../models/AiAgent';
import { isKillSwitchActive } from '../launchSafety';
import { isSafeModeActive } from '../systemControlService';
import { validateAgentWrite, createProposal } from '../agentPermissionService';
import { logAgentActivity, emitAiEvent } from '../aiEventService';
import { ensureTraceId } from '../../utils/requestContext';
import { createTicket } from '../ticketService';
import type { TicketPriority } from '../../models/Ticket';
import { sendTicketApprovalEmail } from '../emailService';

export interface DirectorRunResult {
  ran: boolean;
  wrote: boolean;
  reason?: string;
  recordId?: string;
  ticketId?: string;
  costUsd: number;
}

function structuredLog(event: string, level: 'warn' | 'error', context: Record<string, unknown>, err?: unknown): void {
  const line = {
    timestamp: new Date().toISOString(),
    level,
    service: 'workforce-agent-runtime',
    event,
    outcome: 'failure',
    error_class: err instanceof Error ? err.constructor.name : err !== undefined ? 'UnknownError' : undefined,
    message: err instanceof Error ? err.message : err !== undefined ? String(err) : undefined,
    ...context,
  };
  (level === 'error' ? console.error : console.warn)(JSON.stringify(line));
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
 * Create the Tickets-board mirror of a write already authorized above. Best-effort:
 * a failure here is logged and swallowed, never thrown, since the underlying write
 * this mirrors is already real and complete. `notifyOnCreate` additionally sends the
 * approval email once the ticket exists — if that specific step fails, it's logged
 * distinctly from a ticket-creation failure (the ticket itself still exists either way).
 */
async function mirrorTicket(params: {
  slug: string;
  agentName: string;
  operation: string;
  ticket: { title: string; description: string; priority?: TicketPriority; status?: 'backlog' | 'in_review' };
  entityType: string;
  entityId: string;
  traceId: string;
  notifyOnCreate?: boolean;
}): Promise<string | undefined> {
  // Generated up front (not after createTicket) so it can be stored on the ticket's own
  // metadata at creation — the token, not the UUID, is what actually authorizes a reply;
  // it's never rendered anywhere in the dashboard, only ever transmitted in the email below.
  const replyToken = params.notifyOnCreate ? randomBytes(4).toString('hex') : undefined;

  let ticketId: string;
  try {
    const ticket = await createTicket({
      title: params.ticket.title,
      description: params.ticket.description,
      status: params.ticket.status,
      priority: params.ticket.priority,
      type: 'agent_action',
      source: 'ai_workforce',
      created_by_type: 'agent',
      created_by_id: params.agentName,
      entity_type: params.entityType,
      entity_id: params.entityId,
      metadata: { operation: params.operation, director_slug: params.slug, ...(replyToken ? { reply_token: replyToken } : {}) },
    });
    ticketId = ticket.id;
  } catch (err) {
    structuredLog('ticket_mirror_failed', 'warn', { slug: params.slug, agent_name: params.agentName, trace_id: params.traceId }, err);
    return undefined;
  }

  if (params.notifyOnCreate && replyToken) {
    try {
      await sendTicketApprovalEmail({
        ticketId,
        replyToken,
        title: params.ticket.title,
        description: params.ticket.description,
        directorName: params.agentName,
      });
    } catch (err) {
      structuredLog('ticket_approval_email_failed', 'error', { slug: params.slug, agent_name: params.agentName, ticket_id: ticketId, trace_id: params.traceId }, err);
    }
  }

  return ticketId;
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
  ticket: { title: string; description: string; priority: TicketPriority };
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

  const ticketId = await mirrorTicket({
    slug: params.slug,
    agentName: params.agentName,
    operation: params.operation,
    ticket: params.ticket,
    entityType: params.targetTable,
    entityId: record.id,
    traceId,
  });

  return { ran: true, wrote: true, recordId: record.id, ticketId, costUsd: 0 };
}

/**
 * Run a director's one suggest-only action (proposal tier). `alreadyExists` mirrors
 * runDirectorWrite's idempotency contract — checked BEFORE `build()` so a duplicate
 * manual trigger (this is the one on-demand, no-cron director) never spends an LLM
 * call or sends a second approval email for the same underlying signal. `build`
 * receives the gated agentId so an LLM call inside it can carry agent_id all the way
 * into ai_events — closing gap-analysis.md P1-2 for this call site — and so money is
 * only spent once the gate AND the idempotency check have both already passed.
 */
export async function runDirectorProposal(params: {
  slug: string;
  agentName: string;
  alreadyExists: () => Promise<string | null>;
  build: (agentId: string) => Promise<{
    actionType: string;
    targetTable: string;
    targetId: string;
    proposedChanges: Record<string, any>;
    beforeState?: Record<string, any>;
    reason: string;
    confidence: number;
    ticket: { title: string; description: string };
  }>;
}): Promise<DirectorRunResult> {
  const traceId = ensureTraceId();
  const g = await gate(params.agentName);
  if (!g.ok) return { ran: false, wrote: false, reason: g.reason, costUsd: 0 };
  const agentId = g.agent.id;

  const existingId = await params.alreadyExists();
  if (existingId) {
    return { ran: true, wrote: false, reason: 'already_flagged', recordId: existingId, costUsd: 0 };
  }

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

  // Suggest-only work always needs a human decision — the ticket starts directly in
  // 'in_review' (not 'backlog') and this is the ONE point in the whole AI Workforce
  // that emails Ali, so routine work from the other 9 directors never pages him.
  const ticketId = await mirrorTicket({
    slug: params.slug,
    agentName: params.agentName,
    operation: built.actionType,
    ticket: { ...built.ticket, status: 'in_review' },
    entityType: 'proposed_agent_action',
    entityId: proposal.id,
    traceId,
    notifyOnCreate: true,
  });

  return { ran: true, wrote: true, recordId: proposal.id, ticketId, costUsd: 0 };
}

/** Whether a director is currently allowed to run at all (for the dashboard / manual-trigger button). */
export async function isDirectorGateOpen(agentName: string): Promise<{ open: boolean; reason?: string }> {
  const g = await gate(agentName);
  return g.ok ? { open: true } : { open: false, reason: g.reason };
}
