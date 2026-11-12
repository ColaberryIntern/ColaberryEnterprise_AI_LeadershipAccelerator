/**
 * agentToolGrantContract — may this tool be granted to this agent, by this person, right now.
 *
 * AF3.5. Pure and synchronous: every fact it judges is passed in, so the whole gate can be
 * driven both ways by a test without a database, and so an unreadable input becomes a named
 * refusal rather than a silent pass.
 *
 * ## Why this does not call `evaluatePromotion`
 *
 * The ticket says not to invent a second notion of who may approve, and this does not. But
 * `promotionCriteria.evaluatePromotion` cannot be used here, and the reason is structural rather
 * than stylistic: it judges movement along the CAPABILITY ladder (`autonomy:R0..R9`), while the
 * thing being changed here lives on the AGENT ladder (`observe | suggest | act_audited |
 * communicate`). `promotionSecondSignature.ts` states in its own header that nothing in the
 * codebase maps one onto the other. Reusing it would mean inventing that mapping as a side
 * effect of a tool grant, which is a design decision and not this ticket's to make.
 *
 * So the pieces that ARE about identity get reused verbatim — `humanityCheck` and
 * `isNonHumanIdentity` from `promotionIdentity`, `configuredApprovers` from the AF11.3 service —
 * and nothing new is invented about who counts as a person.
 *
 * ## The two checks that are not the same check
 *
 * `resolveRecordedHumans` establishes that the approver is A REAL PERSON. `configuredApprovers`
 * establishes that this particular person MAY SETTLE A TOOL GRANT. Ali's 4 Nov ruling narrowed
 * the second without touching the first, and collapsing them would quietly re-widen it.
 */

import { humanityCheck, isNonHumanIdentity, norm } from './promotionIdentity';
import type { RequirementValidationState } from './capabilityRecord';

/** Every way a grant can be refused. The rule code is the stable half; the detail is prose. */
export type GrantRefusalRule =
  // -- who is asking
  | 'approver_roster_absent'
  | 'approver_is_non_human'
  | 'approver_not_a_recorded_human'
  | 'approver_not_configured'
  | 'approver_is_the_proposer'
  // -- what is being granted
  | 'tool_catalog_unreadable'
  | 'tool_not_registered'
  | 'tool_name_missing'
  // -- what it is being granted for
  | 'capability_not_confirmed'
  | 'capability_rejected'
  | 'capability_id_missing'
  // Agent Tools Phase 4. The tie between the two halves above: a grant names a tool AND the
  // capability it is for, and until now nothing checked that the capability actually asks for
  // that tool. Without this rule the `capability_id` on a grant is decoration — it records an
  // intention nobody verified, which is exactly the gap that made "every action is tied to a
  // tool" unprovable.
  | 'tool_not_required_by_capability'
  | 'capability_required_tools_unreadable'
  // -- who it is being granted to
  | 'agent_not_found';

export interface GrantIssue {
  readonly rule: GrantRefusalRule;
  readonly detail: string;
}

/** Everything the gate needs, read by the caller before any transaction opens. */
export interface ProposedGrant {
  /** The agent row, or null when the id matched nothing. */
  readonly agent: { readonly id: string; readonly agentName: string;
    readonly toolsGranted: readonly string[] } | null;
  readonly toolName: string;
  readonly capabilityId: string;
  /** What the capability's state IS, with the confirmation store taken into account. */
  readonly capabilityState: RequirementValidationState | null;
  readonly approvedBy: string;
  /** Result of `resolveRecordedHumans`. An empty array means "not established", not "no". */
  readonly recordedHumans: readonly string[] | null;
  /** Result of `configuredApprovers()`. Never empty — it falls back to its documented default. */
  readonly approvers: readonly string[];
  /** Who asked for this capability. Refused as an approver even if they are on the approver set. */
  readonly proposedBy?: string | null;
  /** Compile-time tool names. `null` means the catalog could not be read, which is a refusal. */
  readonly registeredToolNames: readonly string[] | null;
  /**
   * The `required_tools` of the capability this grant cites.
   *
   * `null` means the capability record could not be read, which is a refusal for the same
   * reason `registeredToolNames: null` is: "I could not check" is not "it is fine".
   *
   * An EMPTY array is a different thing and is also a refusal, via
   * `tool_not_required_by_capability` — a capability that asks for no tools cannot justify one.
   */
  readonly capabilityRequiredTools: readonly string[] | null;
}

export interface AcceptedGrant {
  readonly agentId: string;
  readonly agentName: string;
  readonly toolName: string;
  readonly capabilityId: string;
  readonly approvedBy: string;
  /** The exact array to persist: the current tools plus this one, order stable. */
  readonly toolsGrantedAfter: readonly string[];
  /** True when the agent already had the tool, so the write is a no-op. */
  readonly alreadyGranted: boolean;
}

export type GrantVerdict =
  | { readonly ok: true; readonly grant: AcceptedGrant }
  | { readonly ok: false; readonly issues: GrantIssue[] };

const text = (v: unknown): string => String(v ?? '').trim();

/**
 * The tools the agent will hold afterwards.
 *
 * Order is STABLE and that is load-bearing rather than tidy:
 * `maybeReclassifyAutonomyLevel` decides whether anything changed by comparing
 * `JSON.stringify` of the two arrays, so a grant that merely reordered the list would read as a
 * change and trigger an automatic autonomy reclassification. Existing entries keep their
 * position and the new one is appended.
 */
function toolsAfter(current: readonly string[], toolName: string): string[] {
  return current.includes(toolName) ? [...current] : [...current, toolName];
}

/** Who is asking, and may they settle this. Four refusals, deliberately separate. */
function judgeApprover(p: ProposedGrant, issues: GrantIssue[]): void {
  const approver = text(p.approvedBy);
  const humanity = humanityCheck(p.recordedHumans ?? undefined);

  // ABSENCE IS NOT APPROVAL. An unreadable roster is its own refusal rather than a fall-back to
  // the denylist, because `isNonHumanIdentity('unknown')` returns false and a denylist alone
  // would then read the identity that actually walks through as a person.
  if (!humanity.hasRoster) {
    issues.push({
      rule: 'approver_roster_absent',
      detail: 'The record of who is a real person could not be read, so nobody can be confirmed '
        + 'as human. This is refused rather than assumed.',
    });
  }

  if (isNonHumanIdentity(approver)) {
    issues.push({
      rule: 'approver_is_non_human',
      detail: `"${approver || '(empty)'}" is a machine identity. A tool grant is a human `
        + 'decision and the four-hour approval timer must never satisfy it.',
    });
  } else if (humanity.hasRoster && humanity.isNotHuman(approver)) {
    issues.push({
      rule: 'approver_not_a_recorded_human',
      detail: `"${approver}" is not recorded as a person in admin_users or in the agent-domain `
        + 'org. Being absent from the record is not the same as being approved.',
    });
  }

  const approvers = p.approvers.map((a) => norm(a));
  if (!approvers.includes(norm(approver))) {
    issues.push({
      rule: 'approver_not_configured',
      detail: `"${approver || '(empty)'}" is not one of the configured approvers for a tool `
        + 'grant. Owner ruling, 4 Nov 2026.',
    });
  }

  // Independent of the approver set ON PURPOSE: widening the set later must not accidentally
  // let somebody approve the thing they asked for.
  const proposer = text(p.proposedBy);
  if (proposer && norm(proposer) === norm(approver)) {
    issues.push({
      rule: 'approver_is_the_proposer',
      detail: `"${approver}" asked for this capability. The proposer does not approve their own `
        + 'grant, even when they are an approver.',
    });
  }
}

/** What is being granted, and what for. */
function judgeSubject(p: ProposedGrant, issues: GrantIssue[]): void {
  const toolName = text(p.toolName);
  if (!toolName) {
    issues.push({ rule: 'tool_name_missing', detail: 'No tool was named.' });
  } else if (p.registeredToolNames === null) {
    // FAIL CLOSED. A catalog that could not be read cannot establish that a tool exists, and
    // treating "I could not check" as "it is fine" is the mistake the roster rule above exists
    // to prevent. Same move, same reason.
    issues.push({
      rule: 'tool_catalog_unreadable',
      detail: 'The tool catalog could not be read, so it cannot be established that this tool is '
        + 'compiled into the backend. Refused rather than assumed.',
    });
  } else if (!p.registeredToolNames.includes(toolName)) {
    issues.push({
      rule: 'tool_not_registered',
      detail: `"${toolName}" is not a registered tool. Registration is compile-time: a tool `
        + 'cannot be created by granting it, and a grant of a name nothing implements would read '
        + 'as success while changing nothing the agent can do.',
    });
  }

  const capabilityId = text(p.capabilityId);
  if (!capabilityId) {
    issues.push({
      rule: 'capability_id_missing',
      detail: 'No capability was named. A grant records what it is for, or it records nothing.',
    });
  } else if (p.capabilityState === 'rejected') {
    issues.push({
      rule: 'capability_rejected',
      detail: `Capability ${capabilityId} was rejected. Granting a tool for it would be a `
        + 'reversal, which is a different decision with a different author.',
    });
  } else if (p.capabilityState !== 'confirmed') {
    issues.push({
      rule: 'capability_not_confirmed',
      detail: `Capability ${capabilityId} is ${p.capabilityState ?? 'unknown'}, not confirmed. A `
        + 'tool is granted on the strength of a capability somebody proved by hand and recorded.',
    });
  }

  // THE TIE, Agent Tools Phase 4. Only checked once BOTH halves are present and the capability
  // is otherwise acceptable: telling somebody their tool is not required by a capability they
  // have not named, or that was rejected, is noise on top of the real refusal.
  if (toolName && capabilityId && issues.length === 0) {
    if (p.capabilityRequiredTools === null) {
      // FAIL CLOSED, same move as tool_catalog_unreadable.
      issues.push({
        rule: 'capability_required_tools_unreadable',
        detail: `The required tools of capability ${capabilityId} could not be read, so it `
          + 'cannot be established that it asks for this tool. Refused rather than assumed.',
      });
    } else if (!p.capabilityRequiredTools.includes(toolName)) {
      const asked = p.capabilityRequiredTools.length === 0
        ? 'it lists no required tools at all'
        : `it asks for: ${p.capabilityRequiredTools.join(', ')}`;
      issues.push({
        rule: 'tool_not_required_by_capability',
        detail: `Capability ${capabilityId} does not require "${toolName}" — ${asked}. A grant `
          + 'records which capability a tool serves, so a tool the capability never asked for is '
          + 'granted for a purpose nobody stated. Either grant a tool the capability requires, or '
          + "add this one to that capability's required_tools and have the capability "
          + 're-confirmed.',
      });
    }
  }

  if (!p.agent) {
    issues.push({ rule: 'agent_not_found', detail: 'No agent with that id.' });
  }
}

/**
 * The whole gate. Every refusal that applies is returned, not the first.
 *
 * A caller who fixes one problem, resubmits and meets a second has been told half the truth,
 * and on a grant that is the half that matters.
 */
export function acceptToolGrant(proposed: ProposedGrant): GrantVerdict {
  const issues: GrantIssue[] = [];
  judgeApprover(proposed, issues);
  judgeSubject(proposed, issues);
  if (issues.length > 0) return { ok: false, issues };

  const agent = proposed.agent!;
  const toolName = text(proposed.toolName);
  return {
    ok: true,
    grant: {
      agentId: agent.id,
      agentName: agent.agentName,
      toolName,
      capabilityId: text(proposed.capabilityId),
      approvedBy: text(proposed.approvedBy),
      toolsGrantedAfter: toolsAfter(agent.toolsGranted, toolName),
      alreadyGranted: agent.toolsGranted.includes(toolName),
    },
  };
}
