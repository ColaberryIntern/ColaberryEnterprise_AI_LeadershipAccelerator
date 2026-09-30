/**
 * deliveryStoryContract — the Story Contract and the traceability rules. PURE, no I/O.
 *
 * ## Relationship to SBP — extend, never fork
 *
 * `services/sbp/planContract.ts` already defines `PlanStory`, and Gate 0's
 * SBP_INTEGRATION_MAP put it in Tier 1: **reuse unchanged, no delivery-specific copy.**
 * That is honoured here — this module does not redefine a story, it declares the
 * *additional* commitments a delivery story carries beyond a student one, and validates
 * them.
 *
 * The extra fields are all governance, and each exists because delivery has a client:
 *
 *   risk_level          — which authorization gate the execution runs under (Gate 2)
 *   execution_policy    — may this run automatically, or only with a human present
 *   approval_policy     — who must say yes before it lands
 *   evidence_required   — what Gate 9 will demand before the release opens
 *   architecture_impact / design_decisions / agent_impacts — what it touches
 *
 * A student story needs none of these because the student is the only stakeholder and
 * nothing they build reaches a paying customer.
 *
 * ## The traceability rules fail closed
 *
 * Master plan §Gate 7 states them, and `sbp/planGate.ts` already proves the shape works:
 * a pure, deterministic gate cannot be talked out of a refusal.
 *
 *   every `must` requirement            → a story
 *   every approved design decision      → a story, or a recorded no-code rationale
 *   every production agent trust req    → an implementation or evaluation story
 *
 * The third rule is the one with teeth. Gate 5 makes an agent declare what trust it
 * needs; without this rule nothing forces anyone to actually *build* it, and the
 * declaration becomes paperwork.
 */

import { DELIVERY_RISK_ORDER, isKnownDeliveryRiskLevel } from '../../modules/delivery/deliveryRiskLevels';
import { INPACT_DIMENSIONS } from '../../modules/delivery/inpact';

export type ExecutionPolicy =
  | 'manual_only'
  | 'agent_with_review'
  | 'agent_autonomous';

export const EXECUTION_POLICIES: readonly ExecutionPolicy[] = [
  'manual_only',
  'agent_with_review',
  'agent_autonomous',
];

export type ApprovalPolicy = 'none' | 'internal_review' | 'client_approval';

export const APPROVAL_POLICIES: readonly ApprovalPolicy[] = [
  'none',
  'internal_review',
  'client_approval',
];

/**
 * The delivery-specific half of a story. The narrative half stays in SBP's `PlanStory`.
 */
export interface DeliveryStoryContract {
  storyId: string;
  title: string;
  /** Requirement ids this story fulfils — the same `fulfills` relationship SBP uses. */
  fulfills: string[];
  /** Why this exists in business terms, not implementation terms. */
  businessReason?: string | null;
  architectureImpact?: string[] | null;
  designDecisions?: string[] | null;
  /** Agent definition ids this story implements, changes, or evaluates. */
  agentImpacts?: string[] | null;
  /** INPACT dimensions this story implements or evaluates, if any. */
  trustDimensions?: string[] | null;
  dependsOn?: string[] | null;
  riskLevel?: string | null;
  acceptance?: string[] | null;
  failurePaths?: string[] | null;
  testRequirements?: string[] | null;
  /** Evidence types Gate 9 will require before this story counts as done. */
  evidenceRequired?: string[] | null;
  executionPolicy?: ExecutionPolicy | null;
  approvalPolicy?: ApprovalPolicy | null;
  /** Paths this story is expected to touch. Drives collision detection. */
  touchesPaths?: string[] | null;
}

export interface StoryIssue {
  storyId: string;
  rule: string;
  detail: string;
  severity: 'blocking' | 'warning';
}

/**
 * Validate one Story Contract.
 *
 * Blocking vs warning follows `sbp/planGate.ts`'s line exactly: a rule blocks when it
 * would **mislead about what is being built, or write broken data**; it warns when the
 * contract is merely thin. That split is why the SBP gate could ship a slightly untidy
 * plan rather than leaving a student with an empty Projects page.
 */
export function validateStoryContract(story: DeliveryStoryContract): StoryIssue[] {
  const issues: StoryIssue[] = [];
  const add = (rule: string, detail: string, severity: StoryIssue['severity'] = 'blocking') =>
    issues.push({ storyId: story.storyId, rule, detail, severity });

  if (!story.storyId?.trim()) {
    add('story_id_missing', 'A story with no id cannot be depended on or traced.');
  }
  if (!story.title?.trim()) {
    add('title_missing', 'A story with no title is not reviewable.');
  }

  if (!story.fulfills?.length) {
    // A story fulfilling nothing is either undocumented scope or work nobody asked for.
    add('story_fulfills_nothing', 'No requirement ids. Every story must trace to a requirement.');
  }

  if (story.riskLevel && !isKnownDeliveryRiskLevel(story.riskLevel)) {
    add(
      'risk_level_unknown',
      `'${story.riskLevel}' is not one of ${DELIVERY_RISK_ORDER.join(', ')}.`,
    );
  }
  if (!story.riskLevel) {
    // Unclassified risk means the execution plane cannot pick a gate, so it would have to
    // guess — and the safe guess (maximum) would block ordinary work.
    add('risk_level_missing', 'Without a risk level the execution gate has nothing to apply.');
  }

  if (!story.acceptance?.length) {
    add('acceptance_missing', 'Nothing states what "done" means.');
  }
  if (!story.failurePaths?.length) {
    // Root CLAUDE.md's Failure-First Design: design the failure path before the happy one.
    add('failure_paths_missing', 'No failure modes declared.', 'warning');
  }
  if (!story.testRequirements?.length) {
    add('test_requirements_missing', 'No tests required, so nothing will prove this works.', 'warning');
  }

  const policy = story.executionPolicy;
  if (policy && !EXECUTION_POLICIES.includes(policy)) {
    add('execution_policy_unknown', `'${policy}' is not a known execution policy.`);
  }

  // An autonomous run at R3 or above with no approval requirement means a schema change,
  // a production release or a destructive action lands with nobody in the loop.
  const riskIndex = story.riskLevel ? DELIVERY_RISK_ORDER.indexOf(story.riskLevel as any) : -1;
  const highRisk = riskIndex >= DELIVERY_RISK_ORDER.indexOf('R3');
  if (policy === 'agent_autonomous' && highRisk) {
    add(
      'autonomous_execution_of_high_risk_story',
      `Risk ${story.riskLevel} may not run autonomously. Use 'agent_with_review'.`,
    );
  }
  if (highRisk && (!story.approvalPolicy || story.approvalPolicy === 'none')) {
    add(
      'high_risk_story_without_approval',
      `Risk ${story.riskLevel} requires an approval policy.`,
    );
  }

  const unknownTrust = (story.trustDimensions ?? []).filter(
    (d) => !INPACT_DIMENSIONS.includes(d as any),
  );
  if (unknownTrust.length > 0) {
    add('trust_dimension_unknown', `Unrecognised: ${unknownTrust.join(', ')}.`);
  }

  return issues;
}

export interface TraceabilityInput {
  stories: DeliveryStoryContract[];
  /** Requirement ids with priority `must`. */
  mustRequirementIds: string[];
  /** Ids of approved design decisions. */
  approvedDesignDecisionIds: string[];
  /** Design decision ids with a recorded rationale for needing no code. */
  noCodeRationaleFor?: string[];
  /**
   * Trust requirements that must be built: one entry per (agent, dimension) for every
   * PRODUCTION-BOUND agent. Design-only agents are excluded by the caller, matching the
   * scoping in `deliveryTrustGate`.
   */
  productionAgentTrustRequirements?: Array<{ agentId: string; dimension: string }>;
}

export interface TraceabilityGap {
  kind: 'must_requirement' | 'design_decision' | 'agent_trust_requirement';
  id: string;
  detail: string;
}

/**
 * The three fail-closed traceability rules.
 *
 * Returns every gap rather than the first, for the same reason the trust gate does:
 * closing them should not be an iterative game against a system that already knows the
 * whole answer.
 */
export function findDeliveryTraceabilityGaps(input: TraceabilityInput): TraceabilityGap[] {
  const gaps: TraceabilityGap[] = [];

  const fulfilled = new Set(input.stories.flatMap((s) => s.fulfills ?? []));
  for (const requirementId of input.mustRequirementIds) {
    if (!fulfilled.has(requirementId)) {
      gaps.push({
        kind: 'must_requirement',
        id: requirementId,
        detail: 'No story fulfils this must requirement.',
      });
    }
  }

  const coveredDesign = new Set(input.stories.flatMap((s) => s.designDecisions ?? []));
  const noCode = new Set(input.noCodeRationaleFor ?? []);
  for (const decisionId of input.approvedDesignDecisionIds) {
    if (coveredDesign.has(decisionId) || noCode.has(decisionId)) continue;
    gaps.push({
      kind: 'design_decision',
      id: decisionId,
      detail: 'Approved design decision has no story and no recorded no-code rationale.',
    });
  }

  // The rule with teeth: Gate 5 makes an agent DECLARE what trust it needs; without this
  // nothing forces anyone to build it, and the declaration becomes paperwork.
  for (const requirement of input.productionAgentTrustRequirements ?? []) {
    const covered = input.stories.some(
      (s) =>
        (s.agentImpacts ?? []).includes(requirement.agentId) &&
        (s.trustDimensions ?? []).includes(requirement.dimension),
    );
    if (!covered) {
      gaps.push({
        kind: 'agent_trust_requirement',
        id: `${requirement.agentId}:${requirement.dimension}`,
        detail: `No story implements or evaluates '${requirement.dimension}' for this production-bound agent.`,
      });
    }
  }

  return gaps;
}
