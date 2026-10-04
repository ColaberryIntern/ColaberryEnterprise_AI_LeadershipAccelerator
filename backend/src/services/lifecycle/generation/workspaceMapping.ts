/**
 * P4-T1 — workspace / action / headless mapping, and consolidation rules.
 *
 * LC-08: "Every task maps to a justified human surface/action or explicit background operation."
 *
 * ## This module VALIDATES a declared mapping; it does not derive one
 *
 * `deriveAllocation` can read execution class off a task's own attributes, because judgment level
 * and data sensitivity are properties OF the task. Which workspace a task belongs to is not: it is
 * a design decision about how work is grouped for a human. Nothing in `FactoryTask` determines it,
 * and a function that guessed would be inventing the design it is supposed to check.
 *
 * So the shape follows `processValidation.validateProcess(project, bounds)`: the caller declares
 * the bindings, this module refuses the ones that are wrong. Declared, not inferred.
 *
 * ## Why `headless` is a closed enum and not a sentence
 *
 * The Phase 6 rule that fixes the walking-skeleton failure reads this field. `planGate`'s
 * `r0_no_trust_spine` already demonstrates what happens when a gate tries to detect meaning in
 * prose: it is a regex over story text, and it was measured to miss `Approval`, `Notification`,
 * `Generation`, `Deliver` and `Upload` while flagging correct plans. A free-text justification
 * would make the downstream rule evadable for the cost of a sentence. An enumerated reason is
 * checkable; a paragraph is not.
 *
 * ## The project-level rule, which is the walking-skeleton lesson made enforceable
 *
 * A student finished 20 of 20 stories and could not run her own product: twelve services
 * unreachable, nothing chaining them. Per-task LC-08 does not catch that, because every one of
 * those tasks could be legitimately headless. So `SURFACE_NO_HUMAN_PATH` is a PROJECT-level
 * refusal: a blueprint where no task reaches any human surface describes a system nobody can
 * operate. It is deliberately separate from the per-task codes, and it is the one rule here that
 * an all-headless project cannot satisfy by declaring every reason correctly.
 *
 * ## What this module does NOT prove, stated so a later phase does not over-read it
 *
 * A workspace binding proves a human interacts SOMEWHERE. It does not prove the task produces
 * user-visible output chained to the rest of the workflow — an ingestion task bound to an
 * "Imports" admin screen satisfies every rule here. That is strictly better than the
 * measured-unworkable regex and strictly weaker than "proves a workflow"; the stronger guarantee
 * needs Phase 6's release-level view and is recorded in the register as such.
 *
 * NO DATABASE. `ValidationIssue` is reused verbatim rather than redeclared, so a consumer can
 * concatenate these with `factoryValidate`'s and render one list.
 */

import type { ValidationIssue } from '../../factory/factoryValidate';
import type { FactoryProject, FactoryTask } from '../../factory/contracts/factoryContract';

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
 * `whyNotExisting` is required and non-empty because §4.5 demands every proposed screen carry
 * "why an existing workspace cannot serve it". A screen that cannot answer that is a renamed
 * dashboard, which the phase exit condition names explicitly.
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
  /** decisions this surface supports; empty is legal for a read-only view. */
  decisions: string[];
  whyNotExisting: string;
  requirementIds: string[];
  taskIds: string[];
  audience: SurfaceAudience;
  permissionViews: PermissionView[];
  /** §4.5: "use deep links and preserve navigation state". A stable addressable path. */
  deepLink: string;
  preservesNavigationState: boolean;
}

/**
 * A task resolves to EXACTLY ONE of two states. There is no third and no default.
 *
 * A default would be the whole problem: whichever way it defaulted, an unconsidered task would
 * acquire a position nobody chose.
 */
export type TaskSurfaceBinding =
  | { taskId: string; kind: 'workspace'; ref: WorkspaceRef }
  | { taskId: string; kind: 'headless'; reason: HeadlessReason };

/** The codes this module adds. Distinct from `factoryValidate`'s fourteen. */
export const SURFACE_CODES = [
  'SURFACE_UNMAPPED',
  'SURFACE_TASK_UNKNOWN',
  'SURFACE_DUPLICATE_BINDING',
  'NEW_SCREEN_UNJUSTIFIED',
  'HEADLESS_REASON_UNDECLARED',
  'SURFACE_ROLE_UNKNOWN',
  'SURFACE_AUDIENCE_CONFLATED',
  'SURFACE_DEEP_LINK_MISSING',
  'SURFACE_NO_HUMAN_PATH',
] as const;
export type SurfaceCode = (typeof SURFACE_CODES)[number];

const err = (code: SurfaceCode, message: string, stepId?: string): ValidationIssue =>
  ({ code, message, stepId, severity: 'error' });

/**
 * Tasks that are business work, and so need a surface decision.
 *
 * `START` and `END` are flow markers: they denote where a process begins and ends, not work a
 * human or a machine performs. Requiring a surface for them would force every blueprint to invent
 * two meaningless bindings, and the noise would train reviewers to rubber-stamp the list.
 * `processValidation.isFlowOrStart` draws the same line for the same reason.
 */
export function businessTasks(project: FactoryProject): FactoryTask[] {
  return project.tasks.filter((t) => t.kind === 'TASK' || t.kind === 'DECISION');
}

/** Validate a declared set of bindings against the project they claim to describe. */
export function validateTaskSurfaces(
  project: FactoryProject,
  bindings: ReadonlyArray<TaskSurfaceBinding>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const work = businessTasks(project);
  const workIds = new Set(work.map((t) => t.id));
  const allTaskIds = new Set(project.tasks.map((t) => t.id));
  const roleIds = new Set(project.roles.map((r) => r.id));
  const requirementIds = new Set(project.requirements.map((r) => r.id));

  // 1. Every binding must name a task the project declares.
  //
  // The MIRROR of the unmapped-task check below. T6 in Phase 3 proved that when a reconciliation
  // runs one way only, the unchecked direction is the one that inflates the headline: one effort
  // row for a nonexistent task took a manual-only blueprint to 97.9% automated. A binding for a
  // task nobody declared would likewise make coverage look complete.
  const seen = new Set<string>();
  for (const b of bindings) {
    if (!allTaskIds.has(b.taskId)) {
      issues.push(err('SURFACE_TASK_UNKNOWN',
        `Binding names task ${b.taskId}, which the process graph does not declare.`, b.taskId));
      continue;
    }
    if (seen.has(b.taskId)) {
      issues.push(err('SURFACE_DUPLICATE_BINDING',
        `Task ${b.taskId} has more than one binding; a task resolves to exactly one surface state.`,
        b.taskId));
      continue;
    }
    seen.add(b.taskId);
  }

  // 2. Every business task must have one.
  for (const t of work) {
    if (!seen.has(t.id)) {
      issues.push(err('SURFACE_UNMAPPED',
        `Task ${t.id} ("${t.title}") maps to no workspace action and is not marked headless.`,
        t.id));
    }
  }

  // 3. Per-binding rules.
  for (const b of bindings) {
    if (!workIds.has(b.taskId)) continue; // already reported, or a flow marker

    if (b.kind === 'headless') {
      // The type system forbids an unknown member at compile time, but a decomposition arrives as
      // JSON at runtime, where `as` casts and model output both bypass the union.
      if (!HEADLESS_REASONS.includes(b.reason)) {
        issues.push(err('HEADLESS_REASON_UNDECLARED',
          `Task ${b.taskId} is headless with reason "${String(b.reason)}", which is not one of the `
          + `declared reasons (${HEADLESS_REASONS.join(', ')}).`, b.taskId));
      }
      continue;
    }

    const r = b.ref;
    if (r.whyNotExisting.trim() === '') {
      issues.push(err('NEW_SCREEN_UNJUSTIFIED',
        `Workspace ${r.workspaceId} carries no rationale for why an existing workspace cannot `
        + 'serve it.', b.taskId));
    }
    if (r.deepLink.trim() === '') {
      issues.push(err('SURFACE_DEEP_LINK_MISSING',
        `Workspace ${r.workspaceId} declares no deep link, so its state cannot be addressed or `
        + 'preserved.', b.taskId));
    }
    for (const roleId of r.intendedRoles) {
      if (!roleIds.has(roleId)) {
        issues.push(err('SURFACE_ROLE_UNKNOWN',
          `Workspace ${r.workspaceId} names role ${roleId}, which is not in project.roles.`,
          b.taskId));
      }
    }
    for (const pv of r.permissionViews) {
      if (!roleIds.has(pv.roleId)) {
        issues.push(err('SURFACE_ROLE_UNKNOWN',
          `Workspace ${r.workspaceId} declares a permission view for role ${pv.roleId}, which is `
          + 'not in project.roles.', b.taskId));
      }
    }
    for (const reqId of r.requirementIds) {
      if (!requirementIds.has(reqId)) {
        issues.push(err('SURFACE_TASK_UNKNOWN',
          `Workspace ${r.workspaceId} cites requirement ${reqId}, which the project does not `
          + 'declare.', b.taskId));
      }
    }
  }

  // 4. One workspace may not serve both a customer and an internal job.
  //
  // `reference-fixtures.md` requires customer and internal surfaces stay distinct when their jobs
  // or trust boundaries differ. Same id, two audiences, is that distinction collapsed — and the
  // trust boundary is the part that matters: an internal view shows records a customer must not
  // see.
  const audienceById = new Map<string, SurfaceAudience>();
  for (const b of bindings) {
    if (b.kind !== 'workspace') continue;
    const prior = audienceById.get(b.ref.workspaceId);
    if (prior === undefined) {
      audienceById.set(b.ref.workspaceId, b.ref.audience);
    } else if (prior !== b.ref.audience) {
      issues.push(err('SURFACE_AUDIENCE_CONFLATED',
        `Workspace ${b.ref.workspaceId} is declared both ${prior} and ${b.ref.audience}; a single `
        + 'surface cannot hold both trust boundaries.', b.taskId));
    }
  }

  // 5. PROJECT level: something must reach a human.
  //
  // Deliberately last and deliberately separate. Every per-task rule above can pass while the
  // blueprint describes a system no human can operate — which is exactly what shipped when a
  // student completed twenty stories against a product she could not run.
  if (work.length > 0 && !bindings.some((b) => b.kind === 'workspace' && workIds.has(b.taskId))) {
    issues.push(err('SURFACE_NO_HUMAN_PATH',
      `No business task reaches a human surface: all ${work.length} are headless. A blueprint with `
      + 'no human path describes a system nobody can operate.'));
  }

  return issues;
}

/** One workspace, with the tasks it carries and the rationale for its existence. */
export interface ConsolidationEntry {
  workspaceId: string;
  workspaceTitle: string;
  audience: SurfaceAudience;
  taskIds: string[];
  whyNotExisting: string;
}

/**
 * The recorded workspace count and per-surface rationale.
 *
 * RECORDED, NOT TARGETED. `reference-fixtures.md` already ruled that workspace count is "recorded,
 * not targeted. There is no required page count", and §5 forbids allocating a release to a page to
 * satisfy a count. So this reports; it does not cap. A cap would silently drop a surface, which is
 * the source-truncation failure the specification forbids elsewhere.
 */
export function consolidationAssessment(
  bindings: ReadonlyArray<TaskSurfaceBinding>,
): { workspaceCount: number; headlessCount: number; workspaces: ConsolidationEntry[] } {
  const byId = new Map<string, ConsolidationEntry>();
  let headlessCount = 0;

  for (const b of bindings) {
    if (b.kind === 'headless') {
      headlessCount += 1;
      continue;
    }
    const existing = byId.get(b.ref.workspaceId);
    if (existing) {
      existing.taskIds.push(b.taskId);
      continue;
    }
    byId.set(b.ref.workspaceId, {
      workspaceId: b.ref.workspaceId,
      workspaceTitle: b.ref.workspaceTitle,
      audience: b.ref.audience,
      taskIds: [b.taskId],
      whyNotExisting: b.ref.whyNotExisting,
    });
  }

  return {
    workspaceCount: byId.size,
    headlessCount,
    workspaces: [...byId.values()],
  };
}

/**
 * Which free-text `proposed_surfaces` from the understanding have no declared workspace.
 *
 * REPORTED, NEVER AUTO-BOUND. `proposed_surfaces` is free-text LLM output
 * (`projectUnderstandingExtractor` asks for "screen or area the system would need"), so matching
 * it to a workspace is a judgement a human makes. Auto-binding on a string match would
 * manufacture exactly the traceability this phase exists to establish honestly. A surface named
 * upstream and absent downstream is a question for a reviewer, not an error.
 */
export function unboundProposedSurfaces(
  proposedSurfaces: ReadonlyArray<string>,
  bindings: ReadonlyArray<TaskSurfaceBinding>,
): string[] {
  const titles = new Set(
    bindings
      .filter((b): b is Extract<TaskSurfaceBinding, { kind: 'workspace' }> => b.kind === 'workspace')
      .map((b) => b.ref.workspaceTitle.trim().toLowerCase()),
  );
  return proposedSurfaces.filter((p) => !titles.has(p.trim().toLowerCase()));
}
