import { Op } from 'sequelize';
import { Ticket } from '../../models';
import { createTicket } from '../ticketService';
import { resolveHumanDownstreamAgents } from './orgChartHierarchyService';

/**
 * orgChartTaskAssignmentService — Org Chart v3 (2026-08-19, session
 * CC-20260818-x4nk continued). Ali, live: "The human has the ability to
 * create and assign tasks to any agent in it's hierarchy even if they
 * report to another AI Agent."
 *
 * New sibling module to orgChartHierarchyService.ts (which owns the
 * downward-walk mechanics this file consumes but doesn't re-derive) — kept
 * separate so this feature's DB-write logic (the actual Ticket.create call,
 * the idempotency check) is isolated and independently reviewable/testable
 * from the pure hierarchy-resolution logic, per this run's execution
 * contract.
 *
 * Data-model decision (see this run's handoff.md for the full reasoning
 * reported back to Ali): targets the existing `Ticket` model, not a new
 * `AgentTask`-style parallel system. `Ticket` already has a typed
 * created_by_type/assigned_to_type actor-kind pair (including 'org_member',
 * added specifically for "a real org_members row"), a real status state
 * machine, the ledger/audit hook, and is the system of record the org
 * chart's own open_ticket_count already reads from — zero schema change
 * needed.
 */

/** Thrown when the target agent is genuinely NOT in the assigning human's
 * downstream hierarchy — the real authorization boundary Ali asked for
 * ("any agent in it's hierarchy"), not just a UI-level restriction. Checked
 * BEFORE any DB read/write. `status = 403` is read by workforceController.ts's
 * existing `fail()` helper with zero changes to that helper. */
export class AgentNotInHierarchyError extends Error {
  readonly error_class = 'AgentNotInHierarchyError' as const;
  readonly status = 403;

  constructor(orgMemberId: string, agentId: string) {
    super(`Agent "${agentId}" is not in org_member "${orgMemberId}"'s downstream hierarchy.`);
    this.name = 'AgentNotInHierarchyError';
  }
}

/** Thrown when the target agent IS genuinely in the hierarchy but is
 * currently deactivated (AI Workforce Reset, Phase A). Real bug, caught
 * live 2026-08-25: Taiwo assigned "Audit of Payment System" to
 * FinanceIntelligenceArchitect (one of the 17 agents deactivated in Phase
 * A) — the dropdown listed it with no indication it was inactive, and this
 * service created a real ticket that agent will never process, since it's
 * switched off. A client-side dropdown filter alone is not a real
 * authorization boundary (a direct API call would still bypass it), so this
 * is checked here, server-side, same posture as AgentNotInHierarchyError. */
export class AgentDeactivatedError extends Error {
  readonly error_class = 'AgentDeactivatedError' as const;
  readonly status = 403;

  constructor(agentId: string, agentName: string) {
    super(`Agent "${agentName}" (${agentId}) is currently deactivated and cannot be assigned a task.`);
    this.name = 'AgentDeactivatedError';
  }
}

export interface AssignTaskToAgentInput {
  orgMemberId: string;
  agentId: string;
  title: string;
  description?: string;
  /** Client-generated once per form-open, reused across retries of the SAME
   * submission — see this run's handoff.md for the exact frontend contract.
   * Required, not optional: CLAUDE.md's Idempotency & Replayability section
   * is non-negotiable, and a real key (not a content-based heuristic) is
   * the correct mechanism for a user-initiated write like this one. */
  idempotencyKey: string;
}

/**
 * Assigns a task (a real `Ticket`) to any ENABLED agent in `orgMemberId`'s
 * downstream hierarchy. Authorization checks happen FIRST, before any DB
 * read or write — a client-supplied agentId is NEVER trusted on its own,
 * and neither is its enabled status (2026-08-25: a deactivated agent that
 * hadn't gone through the dropdown's client-side filter was still
 * assignable via this service directly). Idempotent: submitting the SAME
 * idempotencyKey twice returns the SAME ticket both times, never creating
 * a duplicate (Postgres JSONB containment lookup on
 * `metadata.idempotency_key`, scoped to this creator so two different
 * humans could theoretically reuse the same random key without colliding —
 * astronomically unlikely with crypto.randomUUID(), but scoping costs
 * nothing and removes the theoretical case entirely).
 */
export async function assignTaskToAgent(input: AssignTaskToAgentInput): Promise<Ticket> {
  const { orgMemberId, agentId, title, description, idempotencyKey } = input;

  if (!title || !title.trim()) {
    throw new Error('title is required.');
  }

  // One shared hierarchy walk answers both "is this agent really here" and
  // "is it actually enabled" — reusing resolveHumanDownstreamAgents() rather
  // than isAgentInHumanDownstream()'s boolean-only check, so the real agent
  // record (and its real `enabled`/`agent_name`) is available for the
  // second check without a second DB round trip.
  const { leadership, staff } = await resolveHumanDownstreamAgents(orgMemberId);
  const targetAgent = [...leadership, ...staff].find((a) => a.id === agentId);
  if (!targetAgent) {
    throw new AgentNotInHierarchyError(orgMemberId, agentId);
  }
  if (!targetAgent.enabled) {
    throw new AgentDeactivatedError(targetAgent.id, targetAgent.agent_name);
  }

  const existing = await Ticket.findOne({
    where: {
      created_by_type: 'org_member',
      created_by_id: orgMemberId,
      // Sequelize's WhereOptions typing doesn't model Op.contains on a JSONB
      // object column, so this clause is cast to any — same established
      // pattern as roomMessageService.ts, sessionClassNotesService.ts,
      // sessionRecordingService.ts, and coryBrain.ts's own Op.contains
      // usage on their own JSONB metadata columns.
      metadata: { [Op.contains]: { idempotency_key: idempotencyKey } } as unknown as Record<string, unknown>,
    },
  });
  if (existing) return existing;

  return createTicket({
    title: title.trim(),
    description,
    type: 'agent_action',
    source: 'org_chart_hierarchy_assignment',
    created_by_type: 'org_member',
    created_by_id: orgMemberId,
    assigned_to_type: 'agent',
    assigned_to_id: agentId,
    metadata: { idempotency_key: idempotencyKey, assigned_via: 'org_chart_hierarchy_assignment' },
  });
}
