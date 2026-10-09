/**
 * workspaceBindingTypes — the P4-T1 binding vocabulary. Types and code lists only, no logic.
 *
 * ## Why this file exists, measured rather than asserted
 *
 * P4-T1 split `workspaceMapping.ts` because it hit 602 lines against a 500-line ceiling. That
 * fixed the line count and made the EXPORT SURFACE worse: one file with 20 public symbols
 * became two with 15 and 20, against CLAUDE.md's hard ceiling of 12. Two later tasks (P4-T4,
 * P4-T5) each avoided widening it by adding a sibling module instead, which is not the same as
 * fixing it — and the second time a task steps around a rule is the signal that the rule needs
 * its own change rather than another preamble.
 *
 * The seam is vocabulary versus helpers, and it needed no invention: the types were already a
 * contiguous block between the imports and the first function.
 *
 * ## There is no facade over this
 *
 * `workspaceMapping` used to re-export all ten of these so older import paths kept resolving.
 * That is what put it at 15. The facade is gone and every consumer imports from here directly,
 * which CLAUDE.md permits as a single coordinated change with the consumers updated in the same
 * diff. A convenience re-export is cheap to add and silently costs a module its whole budget.
 *
 * ## One thing to know before you move anything else out of this folder
 *
 * `__tests__/workspaceMapping.test.ts` DERIVES both its generator keyspace and its leaf value
 * space from a **hand-listed set of filenames**, and this file is in that list. Take it out and
 * the suite does NOT stay green — measured, after an earlier version of this comment claimed it
 * would:
 *
 *   SOURCES without workspaceBindingTypes.ts  ->  97 of 98 pass
 *   the failure is THE LEAF VALUE SPACE IS DERIVED: union literals the code compares against
 *
 * So the keyspace control alone would NOT catch it — that test stays green — and the
 * leaf-value-space control does, by name, because the union literals moved here with the types.
 * **If you move something out of this folder that is neither a key nor a union literal, neither
 * control will notice.** That is the real residual risk, and it is narrower and more useful than
 * the "silently, nothing fails" version this comment used to carry.
 */


/**
 * Why a task has no human surface. A CLOSED set: there is no `other`, and no free-text field.
 *
 * Adding a member is a deliberate act that a reviewer sees in a diff. That is the point — the
 * alternative is a sentence, which is how `r0_no_trust_spine` became evadable.
 */
export const HEADLESS_REASONS = [
  'scheduled_ingestion',
  'system_to_system',
  'derived_computation',
  'notification_delivery',
  'retention_or_cleanup',
] as const;
export type HeadlessReason = (typeof HEADLESS_REASONS)[number];

/** Who a surface is for. Conflating the two is refused: their trust boundaries differ. */
export type SurfaceAudience = 'internal' | 'customer';

/** What one role may see and do on a workspace. §4.5's permission-specific views, as data. */
export interface PermissionView {
  roleId: string;
  visibleActions: string[];
}

/**
 * One human surface, with the fields §4.5 requires of a proposed screen.
 *
 * §4.5 requires "a primary human job, intended roles, relevant records, supported decisions, why
 * an existing workspace cannot serve it, and links to requirements/tasks". All are enforced
 * non-empty except `decisions`, which is legitimately empty for a read-only view — an exception
 * stated here rather than left as an unexplained gap.
 */
export interface WorkspaceRef {
  workspaceId: string;
  workspaceTitle: string;
  /** the action a human takes here, e.g. "approve the contract". Not a page name. */
  action: string;
  primaryJob: string;
  intendedRoles: string[];
  /** record kinds surfaced here, e.g. "contract", "solicitor note". */
  records: string[];
  /** decisions this surface supports; empty is legal for a read-only view, by design. */
  decisions: string[];
  whyNotExisting: string;
  requirementIds: string[];
  /** must contain this binding's own `taskId`; a disagreement is refused. */
  taskIds: string[];
  audience: SurfaceAudience;
  permissionViews: PermissionView[];
  /** §4.5: "use deep links and preserve navigation state". A stable addressable path. */
  deepLink: string;
  /** §4.5 requires preserved navigation state, so declaring `false` declares non-compliance. */
  preservesNavigationState: boolean;
}

/**
 * A task resolves to EXACTLY ONE of two states. There is no third and no default.
 *
 * A default would be the whole problem: whichever way it fell, an unconsidered task would acquire
 * a position nobody chose. A third `kind` arriving as JSON is refused, not thrown.
 */
export type TaskSurfaceBinding =
  | { taskId: string; kind: 'workspace'; ref: WorkspaceRef }
  | { taskId: string; kind: 'headless'; reason: HeadlessReason };

/**
 * Where an acceptance came from. Mirrors `blueprintGeneration.DeclarationOrigin` exactly,
 * including its reasoning: a generator emitting both the blueprint and its own waiver can
 * declare whatever it invents, so the waiver has force only if a different actor authored it.
 */
export type AcceptanceOrigin = 'owner_recorded' | 'model_turn';

/**
 * Owner acceptance of a blueprint with no human surface.
 *
 * Shaped like `TargetAcceptance` in `effortMeasures` — a rationale plus a named human — but
 * with an `origin`, and that difference is the point.
 *
 * ## Why this needs an origin where `checkTargetDisclosure` does not
 *
 * Attempt 2 copied `checkTargetDisclosure` and stopped there. A verifier found the
 * asymmetry that makes the copy wrong, and it is worth stating because the two cases look
 * identical:
 *
 * `checkTargetDisclosure` waives a **target** that sits on top of an independent
 * **measurement** — the AI share is computed from effort rows, and no acceptance string
 * changes it. The waiver buys a pass on the threshold, not on the number.
 *
 * `SURFACE_NO_HUMAN_PATH` has no measurement underneath. The acceptance **is** the entire
 * gate, and what it waives is the only rule in this module that catches the
 * walking-skeleton failure. As attempt 2 shipped it, that gate cost one string literal —
 * cheaper than the "invent a screen" incentive it replaced, since an invented screen at
 * least has to carry fourteen independently-checked fields.
 *
 * So `origin: 'model_turn'` is refused. This is the same judgement
 * `blueprintGeneration.ts` makes for the capability declaration, and the precedent sits
 * forty lines away in the same folder.
 */
export interface HeadlessAcceptance {
  rationale: string;
  acceptedBy: string;
  origin: AcceptanceOrigin;
}

/** The codes this module adds. Distinct from `factoryValidate`'s fourteen. */
export const SURFACE_CODES = [
  'SURFACE_BINDING_MALFORMED',
  'SURFACE_UNMAPPED',
  'SURFACE_TASK_UNKNOWN',
  'SURFACE_REQUIREMENT_UNKNOWN',
  'SURFACE_DUPLICATE_BINDING',
  'SURFACE_BINDING_ON_FLOW_MARKER',
  'NEW_SCREEN_UNJUSTIFIED',
  'SURFACE_FIELD_EMPTY',
  'HEADLESS_REASON_UNDECLARED',
  'SURFACE_ROLE_UNKNOWN',
  'SURFACE_AUDIENCE_CONFLATED',
  'SURFACE_DEEP_LINK_MISSING',
  'SURFACE_NAVIGATION_STATE_NOT_PRESERVED',
  'SURFACE_TASKIDS_INCONSISTENT',
  'SURFACE_NO_HUMAN_PATH',
  'SURFACE_ACCEPTANCE_SELF_SUPPLIED',
  'SURFACE_ARGUMENT_NOT_ARRAY',
  'SURFACE_PROJECT_UNUSABLE',
] as const;
export type SurfaceCode = (typeof SURFACE_CODES)[number];
