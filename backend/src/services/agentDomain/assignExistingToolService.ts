/**
 * assignExistingToolService — carry out a recorded "assign an existing tool" decision.
 *
 * AF11.4. Ali, 3 Nov 2026: *"the cheapest good answer to a tool request is 'we already have that
 * one', and it is only cheap if assigning it is a click rather than a ticket."* AF11.2 finds the
 * candidate, AF11.3 lets him choose it, and this is the write.
 *
 * ## This is the file the two structural pins were written to expect
 *
 * `toolRequestDecisionGrantsNothing.test.ts` forbids the whole AF11.3 decision subtree from so
 * much as importing anything grant-capable, and says in its own words that "AF11.4 will
 * legitimately need to read a decision, and when it does it belongs on this list — which is the
 * point." `agentToolGrantWritesOneColumn.test.ts` pins the importer set of the grant service for
 * the converse reason. So this module, and only this module, imports both, and each of those two
 * allowlists gains exactly one line in the same change. That is deliberate: joining a decision
 * to a grant is a reviewable event, not something a file quietly starts doing.
 *
 * ## It reuses AF3.5's grant path rather than writing the column
 *
 * The ticket is explicit — "Use AF3.5's grant path; if it does not exist yet, this ticket is
 * blocked on it rather than a reason to write a second one." Nothing here touches
 * `tools_granted`, `autonomy_level`, `enabled` or `abac_mode_override`. `grantToolToAgent` does
 * the write, inside its own transaction, with its own read-back diff that rolls the whole thing
 * back if anything other than the tool list moved. So the invariant this ticket is really about
 * is enforced by the code that already enforces it, for every caller including this one.
 *
 * ## Two steps, two transactions, and that is the honest shape
 *
 * The decision is already committed before this runs. If the grant is then refused — an
 * unconfirmed capability, a tool nothing implements, an approver who is also the proposer — the
 * decision still stands and the refusal says why it could not be carried out. Collapsing the two
 * would mean a refused grant erased Ali's decision, which is a worse answer: he did decide, and
 * the record should say so.
 *
 * ## The resolver's verdict is REPORTED, never required
 *
 * The ticket asks to "assert the resolver's verdict, not the write", and the honest reading of
 * that is to read the verdict back and hand it over — not to make the grant conditional on it.
 * `usable` additionally requires the agent to be enabled and its autonomy level to allow the
 * action category, and lifting either of those is a different decision that this ticket puts
 * explicitly out of scope. So a grant can legitimately succeed and leave the tool unusable, and
 * saying so plainly is the point rather than a defect: see `measureAccessAfterGrant` below.
 */

import type { Sequelize } from 'sequelize';
import AgentDomainChangeRequest from '../../models/AgentDomainChangeRequest';
import AgentDomainToolRequestDetail from '../../models/AgentDomainToolRequestDetail';
import { ToolRequestNotFoundError, loadDecisions } from './toolRequestDecisionService';
import { grantToolToAgent, type GrantToolResult } from './agentToolGrantService';
import { resolveEffectiveAccess } from '../workforce/agentEffectiveAccessService';
import {
  acceptAssignment,
  type AssignmentIssue,
} from './assignExistingToolContract';

/**
 * The failures a caller of this service has to tell apart, re-exported from the modules that
 * define them.
 *
 * Not a convenience. The controller branches on all four with `instanceof`, so without this it
 * would import the decision service and the grant service directly — and those two modules each
 * have a structural test pinning their importer set precisely so that a new way into them is a
 * visible line in a diff. Adding the controller to both lists would have widened both pins to
 * say something weaker than the truth, which is that **one** module joins a decision to a grant.
 * Re-exporting keeps each list at two entries and keeps this file the single seam.
 *
 * The same move, for the same stated reason, as `configuredApprovers` in
 * `toolRequestDecisionService.ts`: "a second importer of THIS file would weaken the pin."
 */
export { ToolRequestNotFoundError } from './toolRequestDecisionService';
export {
  ToolGrantRefusedError,
  ToolGrantTouchedMoreThanToolsError,
} from './agentToolGrantService';

/** Thrown with the whole refusal list, so the console renders all of them at once. */
export class AssignmentRefusedError extends Error {
  readonly issues: AssignmentIssue[];

  constructor(issues: AssignmentIssue[]) {
    super(issues.map((i) => i.detail).join(' '));
    this.name = 'AssignmentRefusedError';
    this.issues = issues;
  }
}

/**
 * What the resolver says about this one tool after the grant committed.
 *
 * Every field is copied verbatim from `resolveEffectiveAccess`. Nothing here re-derives
 * `usable` or invents a reason for it: a second copy of that rule would be a rule that can
 * disagree with the real one, and confirming a verdict against a duplicate of its own logic is
 * agreement rather than corroboration.
 */
export interface AccessAfterGrant {
  readonly toolName: string;
  /** A real handler exists FOR THIS AGENT. Not the same question as "is it a registered tool". */
  readonly registered: boolean;
  readonly grantedVia: string[];
  readonly mismatches: string[];
  readonly usable: boolean;
  /** The agent's own row. A disabled agent can hold a tool and still do nothing with it. */
  readonly agentEnabled: boolean;
  readonly autonomyLevel: string | null;
  readonly abacMode: string;
}

export interface AssignExistingToolArgs {
  readonly sequelize: Sequelize;
  readonly changeRequestId: string;
  /** The caller's identity, from the verified token. Never a body, never `|| 'unknown'`. */
  readonly calledBy: string;
}

export interface AssignExistingToolResult {
  readonly changeRequestId: string;
  readonly grant: GrantToolResult;
  /**
   * `null` when the resolver could not be read. A grant that committed is not undone by a
   * failed report, so this is reported as absent rather than thrown — the alternative is an
   * endpoint that answers 500 after successfully granting, which would invite a retry of
   * something that already happened.
   */
  readonly access: AccessAfterGrant | null;
}

/**
 * Read the resolver back for the one tool that was granted.
 *
 * AFTER the grant's transaction has committed, deliberately. `resolveEffectiveAccess` opens its
 * own read with no transaction, so calling it from inside the grant would read the pre-commit
 * row and report the state the grant had just changed.
 */
async function measureAccessAfterGrant(
  agentId: string,
  toolName: string,
): Promise<AccessAfterGrant | null> {
  try {
    const report = await resolveEffectiveAccess(agentId);
    if (!report) return null;
    const tool = report.tools.find((t) => t.toolName === toolName);
    if (!tool) return null;
    const mainRow = report.enabledRows.find((r) => r.role === 'main');
    return {
      toolName: tool.toolName,
      registered: tool.registered,
      grantedVia: [...tool.grantedVia],
      mismatches: [...tool.mismatches],
      usable: tool.usable,
      agentEnabled: mainRow?.enabled ?? false,
      autonomyLevel: report.autonomyLevel,
      abacMode: report.abacMode,
    };
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'assignExistingToolService',
      event: 'effective_access_unreadable_after_grant',
      outcome: 'partial',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: { agent_id: agentId, tool_name: toolName },
    }));
    return null;
  }
}

/**
 * Grant the tool a recorded decision already chose.
 *
 * Idempotent through AF3.5: the unique index on `(agent_id, tool_name)` means a retry records
 * nothing new and comes back with `unchanged: true`. A re-run therefore leaves the same end
 * state, which is what makes this safe to click twice.
 *
 * It deliberately does NOT rewrite the provenance of a grant that already exists. If the agent
 * was granted this tool earlier — by the AF3.5 route, for a capability promotion — that row
 * keeps the request id it was written with, and this call reports `unchanged: true` instead.
 * Rewriting it would make the record depend on the order the calls happened to arrive in.
 */
export async function assignExistingTool(
  args: AssignExistingToolArgs,
): Promise<AssignExistingToolResult> {
  const { sequelize, changeRequestId, calledBy } = args;

  const request = await AgentDomainChangeRequest.findByPk(changeRequestId);
  if (!request) throw new ToolRequestNotFoundError(changeRequestId);

  const detail = await AgentDomainToolRequestDetail.findByPk(changeRequestId);
  const decisions = await loadDecisions(changeRequestId);

  const verdict = acceptAssignment({
    changeRequestId,
    requestKind: String(request.kind ?? 'change'),
    requestedByIdentity: String(request.requested_by_identity ?? ''),
    detail: detail
      ? { agentId: String(detail.agent_id ?? ''), capabilityId: String(detail.capability_id ?? '') }
      : null,
    decisions: decisions.map((d) => ({
      verb: d.verb,
      decided_by_identity: d.decided_by_identity,
      decided_at: d.decided_at,
      assigned_tool_name: d.assigned_tool_name,
    })),
    calledBy,
  });
  if (!verdict.ok) throw new AssignmentRefusedError(verdict.issues);

  const { assignment } = verdict;

  // AF3.5 performs the write, judges who may grant, and rolls back if anything but the tool
  // list moved. A refusal from here arrives in the grant's own vocabulary on purpose: "that
  // capability is not confirmed" is the sentence the person needs, and restating it in a second
  // vocabulary would be a second idea of what a grant requires.
  const grant = await grantToolToAgent(sequelize, {
    agentId: assignment.agentId,
    toolName: assignment.toolName,
    capabilityId: assignment.capabilityId,
    approvedBy: assignment.approvedBy,
    proposedBy: assignment.proposedBy,
    changeRequestId: assignment.changeRequestId,
  });

  const access = await measureAccessAfterGrant(assignment.agentId, assignment.toolName);

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'assignExistingToolService',
    event: 'tool_request_assignment_granted',
    outcome: 'success',
    context: {
      change_request_id: assignment.changeRequestId,
      agent_name: grant.agentName,
      tool_name: grant.toolName,
      capability_id: grant.capabilityId,
      approved_by: grant.approvedBy,
      unchanged: grant.unchanged,
      // Reported, not enforced. A grant that leaves the tool unusable is a correct outcome and
      // the log should say which of the two it was.
      usable_after: access?.usable ?? null,
    },
  }));

  return { changeRequestId: assignment.changeRequestId, grant, access };
}
