/**
 * assignExistingToolContract — may this recorded decision be carried out, and against what.
 *
 * AF11.4. Pure and synchronous: every fact is passed in, so the gate can be driven both ways
 * without a database and an unreadable input becomes a named refusal rather than a silent pass.
 *
 * ## What this gate is NOT for
 *
 * It does not judge who may grant a tool. That is AF3.5's `agentToolGrantContract`, which
 * requires the approver to resolve to a recorded human, to be one of the configured approvers,
 * and not to be the person who asked. The ticket says not to invent a second notion of who may
 * approve, so nothing here repeats any of those three checks — a refusal that belongs to the
 * grant arrives from the grant, in the grant's own vocabulary.
 *
 * What this gate judges is narrower and nobody else judges it: **is there a decision to carry
 * out, does it name a tool, an agent and a capability, and is the person carrying it out the
 * person who made it.**
 *
 * ## Why the caller must be the decider
 *
 * The grant records one approving human. If anybody who can reach the route could execute
 * somebody else's decision, that record would name the decider while a different person pressed
 * the button, and AF3.5's "the proposer does not approve their own grant" check would then be
 * applied to a person who did not act. One identity on both halves keeps the record true and
 * keeps the two gates talking about the same human. Letting a second person execute a decision
 * is a real thing somebody may want later; it is a decision with an owner, not a default.
 *
 * ## The tool comes from the RECORD, never from a caller
 *
 * `toolName` is read off the decision Ali already made. There is no input for it anywhere in
 * this path — the route's body schema is a strict empty object — so this step cannot grant a
 * different tool from the one that was decided. That is the property that makes "the grant and
 * nothing more" checkable rather than merely intended.
 */

/** Every way carrying out an assignment can be refused. The rule is stable; the detail is prose. */
export type AssignmentRefusalRule =
  | 'not_a_tool_request'
  | 'request_details_missing'
  | 'request_names_no_agent'
  | 'request_names_no_capability'
  | 'no_assignment_decision'
  | 'assignment_names_no_tool'
  | 'caller_is_not_the_decider';

export interface AssignmentIssue {
  readonly rule: AssignmentRefusalRule;
  readonly detail: string;
}

/** One row out of the AF11.3 decision log, in the shape this gate reads it. */
export interface RecordedDecisionRow {
  readonly verb: string;
  readonly decided_by_identity: string;
  readonly decided_at: string;
  readonly assigned_tool_name: string | null;
}

export interface ProposedAssignment {
  readonly changeRequestId: string;
  /** `kind` on the parent request. Only a `tool` request can be fulfilled by a tool grant. */
  readonly requestKind: string;
  /** Who filed it. Passed through to the grant, which refuses them as their own approver. */
  readonly requestedByIdentity: string;
  /** The AF11.1 detail row, or `null` when the request carries none. */
  readonly detail: { readonly agentId: string; readonly capabilityId: string } | null;
  /** Every decision recorded on the request, in any order. */
  readonly decisions: ReadonlyArray<RecordedDecisionRow>;
  /** The caller's identity, from the verified token. Never from a body. */
  readonly calledBy: string;
}

/** Exactly what the grant needs, and nothing a grant must not be told. */
export interface AcceptedAssignment {
  readonly changeRequestId: string;
  readonly agentId: string;
  readonly capabilityId: string;
  readonly toolName: string;
  /** The human whose decision this is. Becomes the grant's approver. */
  readonly approvedBy: string;
  /** The human who asked. The grant refuses a grant where these two are the same person. */
  readonly proposedBy: string;
  readonly decidedAt: string;
}

export type AssignmentVerdict =
  | { readonly ok: true; readonly assignment: AcceptedAssignment }
  | { readonly ok: false; readonly issues: AssignmentIssue[] };

const text = (v: unknown): string => String(v ?? '').trim();
const lower = (v: unknown): string => text(v).toLowerCase();

/**
 * The assignment decision to carry out: the most recent one, by `decided_at`.
 *
 * There is normally exactly one. A second decision on a request that is no longer `submitted` is
 * refused by AF11.3, and `assign_existing_tool` moves it to `approved` — but `send_back` leaves
 * the request `submitted` on purpose, so a history of several send-backs followed by one
 * assignment is ordinary. Taking the latest is also the right answer for a row written by hand
 * or by a migration: the most recent decision is the one that stands.
 *
 * Exported so the rule is testable on its own rather than only through the whole gate.
 */
export function latestAssignment(
  decisions: ReadonlyArray<RecordedDecisionRow>,
): RecordedDecisionRow | null {
  const assignments = decisions.filter((d) => text(d.verb) === 'assign_existing_tool');
  if (assignments.length === 0) return null;
  return assignments.reduce((newest, row) => (
    Date.parse(text(row.decided_at)) >= Date.parse(text(newest.decided_at)) ? row : newest
  ));
}

/** Judge a proposed assignment. Returns EVERY reason it is refused, not just the first. */
export function gateAssignment(proposed: ProposedAssignment): AssignmentIssue[] {
  const issues: AssignmentIssue[] = [];

  if (text(proposed.requestKind) !== 'tool') {
    issues.push({
      rule: 'not_a_tool_request',
      detail: 'Only a tool request can be fulfilled by granting a tool. A change request is '
        + 'decided the way it always was.',
    });
  }

  // WHAT IT IS GRANTED TO, AND FOR. Both live on the AF11.1 detail row, which is where the
  // intern named the agent and the capability. A request with no detail has nothing to judge.
  if (!proposed.detail) {
    issues.push({
      rule: 'request_details_missing',
      detail: 'This request carries no tool-request detail, so it names no agent and no '
        + 'capability. There is nothing to grant against.',
    });
  } else {
    if (!text(proposed.detail.agentId)) {
      issues.push({
        rule: 'request_names_no_agent',
        detail: 'The request names no agent, so there is nobody to grant the tool to.',
      });
    }
    if (!text(proposed.detail.capabilityId)) {
      issues.push({
        rule: 'request_names_no_capability',
        detail: 'The request names no capability. A grant records what it is for, or it records '
          + 'nothing.',
      });
    }
  }

  // IS THERE A DECISION. This step carries one out; it never makes one.
  const assignment = latestAssignment(proposed.decisions);
  if (!assignment) {
    issues.push({
      rule: 'no_assignment_decision',
      detail: 'Nobody has decided to assign an existing tool to this request. The decision comes '
        + 'first and this step carries it out; it cannot stand in for one.',
    });
  } else {
    if (!text(assignment.assigned_tool_name)) {
      issues.push({
        rule: 'assignment_names_no_tool',
        detail: 'The recorded decision names no tool, so there is nothing to grant.',
      });
    }
    // Independent of everything the grant checks about an approver, and checked here because
    // nobody else can see both halves: the record names one human and one human acted.
    //
    // The EMPTINESS CHECK IS NOT REDUNDANT. The controller passes the token's identity through
    // including empty, deliberately, so that an identity the route could not resolve is refused
    // by name rather than invented as `'unknown'`. Comparing on equality alone would then let an
    // empty caller match a decision row whose own identity was empty — two absences reading as
    // the same person. There is no row like that today; the column is NOT NULL and AF11.3
    // refuses a blank decider. "Today" is the word doing the work.
    if (!text(proposed.calledBy)
      || lower(proposed.calledBy) !== lower(assignment.decided_by_identity)) {
      issues.push({
        rule: 'caller_is_not_the_decider',
        detail: `"${text(proposed.calledBy) || '(empty)'}" did not make this decision. `
          + `${text(assignment.decided_by_identity) || '(nobody)'} did. A grant records one `
          + 'approving human, so the person carrying a decision out is the person who made it.',
      });
    }
  }

  return issues;
}

/**
 * Gate, then build the assignment. Never partially.
 *
 * The returned object carries only what a grant needs. No autonomy level, no `enabled`, no tool
 * list — because an object that could express those is one refactor away from carrying them into
 * the write.
 */
export function acceptAssignment(proposed: ProposedAssignment): AssignmentVerdict {
  const issues = gateAssignment(proposed);
  if (issues.length > 0) return { ok: false, issues };

  const assignment = latestAssignment(proposed.decisions)!;
  return {
    ok: true,
    assignment: {
      changeRequestId: text(proposed.changeRequestId),
      agentId: text(proposed.detail!.agentId),
      capabilityId: text(proposed.detail!.capabilityId),
      toolName: text(assignment.assigned_tool_name),
      approvedBy: text(assignment.decided_by_identity),
      proposedBy: text(proposed.requestedByIdentity),
      decidedAt: text(assignment.decided_at),
    },
  };
}
