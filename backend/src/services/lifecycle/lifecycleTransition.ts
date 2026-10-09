/**
 * The stage transition command — the decision half of a lifecycle move.
 *
 * A transition is a COMMAND, not a setter. A client never writes a stage; it asks for one, and
 * this decides. The decision is three independent questions, and all three have to pass:
 *
 *   1. Is the edge in the allow-list?            (lifecycleStages.canTransition)
 *   2. Are the target stage's prerequisites met? (lifecyclePrerequisites.prerequisiteGaps)
 *   3. Does the actor hold the required permission?
 *
 * Separating them matters because the three failures want different responses: an illegal edge
 * is a 409 (the client's model of the world is wrong), unmet prerequisites are a 422 with the
 * list of what is missing (the project is not ready), and a permission failure is a 403 (the
 * actor is wrong). Collapsing them into one boolean would turn all three into "no".
 *
 * PURE. No database, no clock, no I/O. The caller persists the outcome. That keeps this in the
 * CI gate — which has no `DATABASE_URL` and so cannot run anything touching Sequelize — and
 * makes every branch reachable from a test without fixtures.
 *
 * Decision record: docs/project-lifecycle/architecture.md §3.
 */
import {
  canTransition,
  crossesApprovalBoundary,
  isLifecycleStage,
  isReturnEdge,
  type LifecycleCondition,
  type LifecycleStage,
} from './lifecycleStages';
import type { DeliveryPermission } from '../../modules/delivery/deliveryRoles';
import {
  advisoryGaps,
  blockingGaps,
  prerequisiteGaps,
  satisfied,
  type LifecycleEvidence,
  type PrerequisiteGap,
} from './lifecyclePrerequisites';

/** Why a transition was refused. Distinct classes because they map to distinct HTTP statuses. */
export type RefusalReason =
  | 'illegal_edge'          // -> 409: not in the allow-list
  | 'unknown_stage'         // -> 400: the stage string is not a stage
  | 'prerequisites_unmet'   // -> 422: with the gap list
  | 'forbidden'             // -> 403: the actor lacks the permission
  | 'draft_cannot_authorize'; // -> 409: a preview/draft tried to authorize a build

export interface TransitionRequest {
  from: unknown;
  to: unknown;
  /** Permissions the actor actually holds, resolved from DELIVERY_ROLES by the caller. */
  actorPermissions: ReadonlyArray<DeliveryPermission | string>;
  /**
   * True when this request originates from a preview or draft scenario. Previews may exist at
   * any stage; what they may never do is mark themselves authorized for build.
   */
  isDraftScenario?: boolean;
  evidence: LifecycleEvidence;
}

export interface TransitionDecision {
  allowed: boolean;
  from: LifecycleStage | null;
  to: LifecycleStage | null;
  refusal?: RefusalReason;
  /** Everything missing, blocking and advisory, so the UI can render it. */
  gaps: PrerequisiteGap[];
  blocking: PrerequisiteGap[];
  advisory: PrerequisiteGap[];
  /** The condition to persist alongside the new stage, or null to clear it. */
  nextCondition: LifecycleCondition | null;
  /** Human-readable, one line, safe to show a non-developer. */
  message: string;
}

/**
 * The permission each target stage requires.
 *
 * Mapped onto the EXISTING `DeliveryPermission` values in `modules/delivery/deliveryRoles.ts`
 * rather than inventing lifecycle-specific permissions and a parallel role registry. The request
 * is explicit that the personas should use current roles with no proliferation of logins, and
 * that registry already distinguishes requirement, architecture, agent, design, contract, story
 * and release authority — so each stage can take the specific grant that matches it rather than
 * one blanket "manage" permission. Typed as `DeliveryPermission`, so a typo is a compile error
 * rather than a permission check that can never pass.
 */
export const STAGE_PERMISSION: Readonly<Record<LifecycleStage, DeliveryPermission>> = {
  discovery: 'project.read',
  // Each of these is the EXISTING permission whose meaning actually matches the stage, rather
  // than one blanket "manage" grant. The registry already distinguishes requirement, architecture,
  // agent, design, story and release authority, so using the specific one means a design reviewer
  // can approve a design without also being able to approve a release.
  requirements_ready: 'requirement.approve',
  process_ready: 'architecture.approve',
  allocation_ready: 'agent.approve',
  design_ready: 'design.approve',
  // Submitting FOR approval is not approving. This is deliberately a write, not an approve.
  awaiting_blueprint_approval: 'project.write',
  // The blueprint is the agreement about what gets built, so approving it is contract authority.
  blueprint_approved: 'contract.approve',
  planning: 'story.write',
  plan_ready: 'story.review',
  building: 'story.execute',
  release_review: 'story.review',
  launch_ready: 'release.approve',
  operating: 'release.deploy',
};

/** Stages whose entry authorizes implementation work, and which a draft may therefore never enter. */
const AUTHORIZING_STAGES: ReadonlySet<LifecycleStage> = new Set<LifecycleStage>([
  'blueprint_approved', 'planning', 'plan_ready', 'building', 'release_review', 'launch_ready', 'operating',
]);

function refuse(
  reason: RefusalReason,
  message: string,
  from: LifecycleStage | null,
  to: LifecycleStage | null,
  gaps: PrerequisiteGap[] = [],
): TransitionDecision {
  return {
    allowed: false,
    from,
    to,
    refusal: reason,
    gaps,
    blocking: blockingGaps(gaps),
    advisory: advisoryGaps(gaps),
    nextCondition: null,
    message,
  };
}

/**
 * Evaluate a requested transition. Never throws: a malformed stage is a refusal with a reason,
 * because a stored value that has drifted should not be able to crash a read path.
 */
export function evaluateTransition(req: TransitionRequest): TransitionDecision {
  const { from, to, actorPermissions, evidence } = req;

  if (!isLifecycleStage(from) || !isLifecycleStage(to)) {
    return refuse(
      'unknown_stage',
      `Not a lifecycle stage: ${!isLifecycleStage(from) ? String(from) : String(to)}.`,
      isLifecycleStage(from) ? from : null,
      isLifecycleStage(to) ? to : null,
    );
  }

  if (!canTransition(from, to)) {
    return refuse('illegal_edge', `A project at ${from} cannot move to ${to}.`, from, to);
  }

  // A preview may sit at any stage but may never cross into one that authorizes work.
  if (req.isDraftScenario && AUTHORIZING_STAGES.has(to)) {
    return refuse(
      'draft_cannot_authorize',
      `A draft or preview cannot enter ${to}, which would authorize implementation work.`,
      from,
      to,
    );
  }

  const required = STAGE_PERMISSION[to];
  if (!actorPermissions.includes(required)) {
    return refuse('forbidden', `Entering ${to} requires the ${required} permission.`, from, to);
  }

  const gaps = prerequisiteGaps(to, evidence);
  if (!satisfied(gaps)) {
    const blocking = blockingGaps(gaps);
    return refuse(
      'prerequisites_unmet',
      `${to} is not ready: ${blocking.length} thing(s) still missing.`,
      from,
      to,
      gaps,
    );
  }

  // A return edge that leaves the post-approval band invalidates work authorized against the old
  // revision, so the downstream work is marked rather than left to proceed on stale evidence.
  const nextCondition: LifecycleCondition | null = crossesApprovalBoundary(from, to)
    ? 'needs_reapproval'
    : null;

  return {
    allowed: true,
    from,
    to,
    gaps,
    blocking: [],
    advisory: advisoryGaps(gaps),
    nextCondition,
    message: isReturnEdge(from, to)
      ? `Returned to ${to} from ${from}${nextCondition ? '; the existing approval no longer covers this revision' : ''}.`
      : `Advanced to ${to}.`,
  };
}

/** The HTTP status a refusal maps to, so routes do not each re-derive it. */
export function refusalStatus(reason: RefusalReason): number {
  switch (reason) {
    case 'unknown_stage': return 400;
    case 'forbidden': return 403;
    case 'prerequisites_unmet': return 422;
    case 'illegal_edge':
    case 'draft_cannot_authorize': return 409;
    default: {
      // Exhaustiveness: a new RefusalReason without a status is a compile error here, not a
      // silent 500 in production.
      const never: never = reason;
      return never;
    }
  }
}
