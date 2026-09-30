/**
 * clientChangeRequest — impact before build. PURE, no I/O.
 *
 * Master plan §Gate 10: **"Client change request must show impact before build."**
 *
 * The failure this prevents is ordinary and expensive: a client asks for "just one small
 * change", it is picked up as work, and three weeks later something they already signed
 * off no longer behaves the way they accepted it. Nobody lied; nobody looked. This module
 * makes looking a precondition of starting.
 *
 * The impact itself comes from Gate 3's `analyzeImpact` over the project graph — reused
 * rather than re-derived, so the client's answer and the builder's answer are computed by
 * the same code and cannot drift apart.
 */

import { analyzeImpact, type DeliveryGraph, type GraphNodeRef } from './deliveryProjectGraph';

export type ChangeRequestStatus =
  | 'draft'
  | 'submitted'
  | 'impact_assessed'
  | 'approved_for_build'
  | 'declined'
  | 'withdrawn';

const TRANSITIONS: Record<ChangeRequestStatus, readonly ChangeRequestStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['impact_assessed', 'declined', 'withdrawn'],
  // The gate: build can only be reached THROUGH impact assessment. There is deliberately
  // no `submitted -> approved_for_build` edge, so "show impact before build" is a
  // property of the graph rather than a rule someone has to remember to apply.
  impact_assessed: ['approved_for_build', 'declined', 'withdrawn'],
  approved_for_build: ['withdrawn'],
  declined: [],
  withdrawn: [],
};

export function canTransition(from: ChangeRequestStatus, to: ChangeRequestStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function allowedTransitions(from: ChangeRequestStatus): readonly ChangeRequestStatus[] {
  return TRANSITIONS[from] ?? [];
}

/**
 * What the client is shown about a change's consequences.
 *
 * Counts and flags, not node lists. A client is owed "this touches two things you already
 * signed off, and one thing that is live" — not the identifiers of internal design
 * decisions. `truncated` is carried through verbatim because an impact report that
 * silently stopped walking reads as "nothing else is affected", which is the most
 * dangerous possible way to be wrong here.
 */
export interface ClientImpactSummary {
  affectedCount: number;
  touchesAcceptedWork: boolean;
  touchesDeployedWork: boolean;
  truncated: boolean;
  /** Plain-language lines, safe to render directly to a client. */
  highlights: string[];
}

export interface ChangeImpactResult {
  summary: ClientImpactSummary;
  /** The full report, for the builder surface only. Never sent to a client. */
  internal: ReturnType<typeof analyzeImpact>;
}

/**
 * Assess a proposed change.
 *
 * Returns both shapes from one computation: the client summary and the full internal
 * report. Producing them together is deliberate — if a caller had to build the summary
 * itself, two callers would build it two ways and one of them would leak node ids.
 */
export function assessChangeImpact(
  graph: DeliveryGraph,
  changed: GraphNodeRef[],
  options: { maxDepth?: number } = {},
): ChangeImpactResult {
  const internal = analyzeImpact(graph, changed, options);
  const highlights: string[] = [];

  if (internal.affected.length === 0) {
    highlights.push('This change does not appear to affect anything already agreed.');
  } else {
    highlights.push(
      `This change reaches ${internal.affected.length} other ` +
        `${internal.affected.length === 1 ? 'part' : 'parts'} of the project.`,
    );
  }

  if (internal.touchesAcceptedWork) {
    highlights.push('It affects work you have already accepted, which would need re-approval.');
  }
  if (internal.touchesDeployedWork) {
    highlights.push('It affects something already released and running.');
  }
  if (internal.truncated) {
    // Said plainly rather than hidden: an incomplete answer presented as complete is the
    // failure mode this whole gate exists to prevent.
    highlights.push(
      'This assessment reached its analysis limit, so the list above may be incomplete.',
    );
  }

  return {
    summary: {
      affectedCount: internal.affected.length,
      touchesAcceptedWork: internal.touchesAcceptedWork,
      touchesDeployedWork: internal.touchesDeployedWork,
      truncated: internal.truncated,
      highlights,
    },
    internal,
  };
}

export interface ChangeRequestGateInput {
  status: ChangeRequestStatus;
  targetStatus: ChangeRequestStatus;
  /** Whether an impact assessment has been recorded against this request. */
  hasImpactSummary: boolean;
  /** Whether a decision-maker approved it after seeing the impact. */
  approvedByIdentityId?: string | null;
}

export interface ChangeRequestIssue {
  rule: string;
  detail: string;
}

/**
 * Gate a change-request transition.
 *
 * Belt and braces with the transition table above: the table makes the *path* to
 * `approved_for_build` run through assessment, and this check makes sure the assessment
 * actually produced something. A status can be set by a caller; a recorded summary cannot
 * be faked by setting a field to the right string.
 */
export function gateChangeRequest(input: ChangeRequestGateInput): ChangeRequestIssue[] {
  const issues: ChangeRequestIssue[] = [];

  if (!canTransition(input.status, input.targetStatus)) {
    issues.push({
      rule: 'illegal_transition',
      detail:
        `'${input.status}' cannot become '${input.targetStatus}'. Allowed: ` +
        `${allowedTransitions(input.status).join(', ') || '(none)'}.`,
    });
  }

  if (input.targetStatus === 'impact_assessed' && !input.hasImpactSummary) {
    issues.push({
      rule: 'impact_not_assessed',
      detail: 'Cannot mark a change request impact-assessed with no impact summary recorded.',
    });
  }

  if (input.targetStatus === 'approved_for_build') {
    if (!input.hasImpactSummary) {
      issues.push({
        rule: 'build_without_impact',
        detail:
          'A change cannot be approved for build before its impact has been shown ' +
          '(master plan §Gate 10).',
      });
    }
    if (!input.approvedByIdentityId) {
      issues.push({
        rule: 'approver_missing',
        detail: 'Approval for build must record who approved it.',
      });
    }
  }

  return issues;
}
