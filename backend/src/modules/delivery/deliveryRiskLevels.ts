/**
 * Delivery risk levels R0–R5 (master plan §Gate 2).
 *
 * RELATIONSHIP TO THE OPS FLEET'S TIERS — read this before "unifying" the two.
 *
 * The platform already has an R0–R4 ladder, defined in two places that are kept in sync
 * by hand: `services/agentAutonomy.ts` (the HITL approval gate) and
 * `services/workGraph/capabilityRouter.ts` (the dispatch-eligibility gate), plus a typed
 * union `maxRiskTier: 'R0'|…|'R4'` in `capabilityRegistry.ts`. R0–R4 here mean **exactly**
 * what they mean there — that is deliberate, so "R3" is one concept across the platform.
 *
 * R5 is new and is delivery-only for now. Adding it to the ops ladder means editing all
 * three sites above, one of which gates live agent dispatch, so per Gate 0's
 * AUTHORIZATION_MATRIX it must ship **shadow-logged first**
 * (`ApprovalRequest.status = 'shadow_logged'`, verdict recorded, nothing enforced) and
 * reviewed before it enforces. That is a separate change with its own blast radius, not a
 * side effect of building the delivery domain.
 *
 * ONE DELIBERATE DIVERGENCE: the fail-safe direction.
 *
 * `agentAutonomy.isHighRiskTier()` treats an unrecognized tier as **not** high risk — it
 * fails OPEN, and says so, because a malformed string there must not manufacture an
 * approval requirement for an established ops pipeline. Delivery inverts that: an
 * unrecognized risk level fails **CLOSED**. A delivery action whose risk nobody can
 * classify is not safe to execute unreviewed, and unlike the ops fleet there is no
 * established pipeline to protect from false positives. Master plan §5.6: "Unknown
 * authorization fails closed."
 *
 * Pure and dependency-free, like `agentAutonomy.ts`. No DB, no services.
 */

import type { DeliveryPermission } from './deliveryRoles';

export type DeliveryRiskLevel = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';

/** Least → most consequential. A level's index is its rank. */
export const DELIVERY_RISK_ORDER: readonly DeliveryRiskLevel[] = [
  'R0',
  'R1',
  'R2',
  'R3',
  'R4',
  'R5',
];

export const DELIVERY_RISK_MEANINGS: Record<DeliveryRiskLevel, string> = {
  R0: 'read_only',
  R1: 'reversible_content',
  R2: 'code_change',
  R3: 'schema_security_or_external_side_effect',
  R4: 'production_release',
  R5: 'destructive_or_high_consequence',
};

/**
 * Rank of a risk level. Unrecognized input returns the HIGHEST rank, not -1 and not 0.
 *
 * This is the fail-closed choice and the opposite of `agentAutonomy`'s convention — see
 * the header. Returning 0 would make a typo look like a read-only action.
 */
export function deliveryRiskIndex(level: string | null | undefined): number {
  if (!level) return DELIVERY_RISK_ORDER.length - 1;
  const idx = DELIVERY_RISK_ORDER.indexOf(level as DeliveryRiskLevel);
  return idx === -1 ? DELIVERY_RISK_ORDER.length - 1 : idx;
}

export function isKnownDeliveryRiskLevel(level: string): level is DeliveryRiskLevel {
  return (DELIVERY_RISK_ORDER as readonly string[]).includes(level);
}

/** Is `level` at or below `ceiling`? Unknown values are treated as maximum risk. */
export function riskWithinCeiling(
  level: string | null | undefined,
  ceiling: string | null | undefined,
): boolean {
  return deliveryRiskIndex(level) <= deliveryRiskIndex(ceiling);
}

/**
 * The declaration every consequential delivery action must carry (master plan §Gate 2):
 * its risk, the permission it needs, and who must approve it.
 *
 * This applies identically to humans and to AI workers. An execution run requesting an R3
 * action is subject to the same gate as a builder requesting it — that equivalence is the
 * point of the whole model, and it is why this type has no `actorType` field to branch on.
 */
export interface ActionRiskDeclaration {
  action: string;
  risk: DeliveryRiskLevel;
  requiredPermission: DeliveryPermission;
  /** A permission a *different* identity must hold to approve. Null = no second party. */
  requiredApproverPermission: DeliveryPermission | null;
}

/**
 * The consequential actions this gate knows about.
 *
 * Deliberately a registry rather than free-form strings classified by keyword. The ops
 * fleet classifies actions by substring hints (`actionCategory()`), which is right for an
 * open-ended agent action space — but delivery actions are a closed, designed set, and
 * guessing the risk of "deploy_release" from its name is how a typo becomes an
 * unreviewed production deploy.
 */
const ACTION_RISKS: Record<string, ActionRiskDeclaration> = {
  'project.read': { action: 'project.read', risk: 'R0', requiredPermission: 'project.read', requiredApproverPermission: null },
  'evidence.read': { action: 'evidence.read', risk: 'R0', requiredPermission: 'evidence.read', requiredApproverPermission: null },

  'requirement.write': { action: 'requirement.write', risk: 'R1', requiredPermission: 'requirement.write', requiredApproverPermission: null },
  'design.comment': { action: 'design.comment', risk: 'R1', requiredPermission: 'design.comment', requiredApproverPermission: null },
  'story.write': { action: 'story.write', risk: 'R1', requiredPermission: 'story.write', requiredApproverPermission: null },

  'story.execute': { action: 'story.execute', risk: 'R2', requiredPermission: 'story.execute', requiredApproverPermission: null },
  'architecture.write': { action: 'architecture.write', risk: 'R2', requiredPermission: 'architecture.write', requiredApproverPermission: null },

  // Approvals are the second-party half of a decision, so they need an approver
  // permission distinct from the writer's.
  'contract.approve': { action: 'contract.approve', risk: 'R3', requiredPermission: 'contract.approve', requiredApproverPermission: 'contract.approve' },
  'design.approve': { action: 'design.approve', risk: 'R3', requiredPermission: 'design.approve', requiredApproverPermission: 'design.approve' },
  'agent.approve': { action: 'agent.approve', risk: 'R3', requiredPermission: 'agent.approve', requiredApproverPermission: 'agent.approve' },
  'schema.change': { action: 'schema.change', risk: 'R3', requiredPermission: 'architecture.write', requiredApproverPermission: 'architecture.approve' },

  'release.approve': { action: 'release.approve', risk: 'R4', requiredPermission: 'release.approve', requiredApproverPermission: 'release.approve' },
  'release.deploy': { action: 'release.deploy', risk: 'R4', requiredPermission: 'release.deploy', requiredApproverPermission: 'release.approve' },
  'client.accept': { action: 'client.accept', risk: 'R4', requiredPermission: 'client.accept', requiredApproverPermission: null },

  // R5 — destructive or high consequence. Nothing in the plan authorizes these yet; they
  // are declared so that the gate has an answer if one is ever attempted, rather than
  // falling through to a default.
  'project.delete': { action: 'project.delete', risk: 'R5', requiredPermission: 'project.write', requiredApproverPermission: 'project.manage_members' },
  'production.data_migration': { action: 'production.data_migration', risk: 'R5', requiredPermission: 'release.deploy', requiredApproverPermission: 'release.approve' },
};

/**
 * The declaration for an action. An unregistered action is treated as **R5 requiring the
 * highest authority**, not as harmless.
 *
 * This is the whole fail-closed posture in one function: adding a consequential action
 * without declaring it makes it maximally restricted and immediately visible, instead of
 * silently permitted.
 */
export function declarationFor(action: string): ActionRiskDeclaration {
  return (
    ACTION_RISKS[action] ?? {
      action,
      risk: 'R5',
      requiredPermission: 'project.manage_authority',
      requiredApproverPermission: 'project.manage_authority',
    }
  );
}

export function isDeclaredAction(action: string): boolean {
  return Object.prototype.hasOwnProperty.call(ACTION_RISKS, action);
}

/** Every declared action, for tests and for the authority-matrix documentation. */
export const DECLARED_ACTIONS: readonly ActionRiskDeclaration[] = Object.values(ACTION_RISKS);
