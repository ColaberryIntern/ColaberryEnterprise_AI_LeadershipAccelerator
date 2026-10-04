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
 * The plan named a `mapTaskSurfaces()` export. It does not exist, deliberately: there is nothing to
 * map FROM. What shipped instead is `businessTasks()` plus `unboundProposedSurfaces()`, and that
 * deviation is recorded in the session log rather than left as a silent substitution.
 *
 * ## Why `headless` is a closed enum and not a sentence
 *
 * The Phase 6 rule that fixes the walking-skeleton failure reads this field. `planGate`'s
 * `r0_no_trust_spine` already demonstrates what happens when a gate tries to detect meaning in
 * prose: it is a regex over story text, and it was measured to miss `Approval`, `Notification`,
 * `Generation`, `Deliver` and `Upload` while flagging correct plans. A free-text justification
 * would make the downstream rule evadable for the cost of a sentence.
 *
 * ## EVERY field is defended against runtime JSON, not just `reason`
 *
 * Attempt 1 of this module said exactly what is written above — that a decomposition arrives as
 * JSON where `as` casts and model output bypass the union — and then defended **one** field
 * against it. Every other malformed shape threw a raw `TypeError`: a missing `ref`, a missing
 * `deepLink`, a non-array `intendedRoles`, and a third `kind` value, which the documentation
 * claimed was impossible. A generic error escaping a validator is worse than a refusal, because
 * the caller learns nothing, and CLAUDE.md forbids `Error` as a production error class.
 * `SURFACE_BINDING_MALFORMED` now refuses all of it, and `consolidationAssessment` and
 * `unboundProposedSurfaces` skip malformed entries rather than crashing on them.
 *
 * ## The project-level rule is a DISCLOSURE requirement, not a threshold
 *
 * A student finished 20 of 20 stories, platform-verified, and could not run her own product:
 * twelve services unreachable, nothing chaining them. Per-task LC-08 cannot catch that, because
 * every one of those tasks could be legitimately headless.
 *
 * But refusing an all-headless project outright was wrong, for the reason this phase argues
 * everywhere else: a legitimately headless pipeline could then proceed only by declaring a
 * workspace nobody would use — the "invent a screen to clear the gate" incentive. §4.4 gives a
 * below-target project a visible rationale plus owner acceptance, and `checkTargetDisclosure`
 * implements that shape already. So an all-headless project passes WHEN it declares a rationale
 * and a named acceptor, and is refused otherwise. An undisclosed absence of any human surface is
 * how a design decision quietly becomes a defect nobody admits.
 *
 * Grounding, stated precisely because attempt 1 overclaimed it: LC-08 and §4.5's first clause both
 * PERMIT an all-headless blueprint. The requirement comes from §4.5's journey clause — "Required
 * prototype journeys: normal success, approval, rejection/revision, uncertain/failed AI result, and
 * human takeover" — which a project with no human surface cannot satisfy.
 *
 * ## What this module does NOT prove
 *
 * A workspace binding proves a human interacts SOMEWHERE. It does not prove the task produces
 * user-visible output chained to the rest of the workflow — an ingestion task bound to an
 * "Imports" admin screen satisfies every rule here. Stronger than the measured-unworkable regex,
 * weaker than "proves a workflow"; the stronger guarantee needs Phase 6's release-level view and is
 * recorded in the register.
 *
 * ## SIZE: this file is 478 lines against CLAUDE.md`s 500-line hard ceiling
 *
 * P4-T5 is planned to add per-workspace empty/loading/error state checks HERE. It must **split
 * this file first** rather than grow it past the ceiling. The obvious seam is already cut: the
 * shape, content, audience and acceptance rules are four separate functions, so `shapeIssue` and
 * `refIssues` can move to a sibling module with no change to the exported surface. Every function
 * is under the 100-line function ceiling (largest: `validateTaskSurfaces` at 72 code lines, down
 * from 94 in attempt 1).
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
 * Owner acceptance of a blueprint with no human surface.
 *
 * The same shape as `TargetAcceptance` in `effortMeasures`, deliberately: both answer "this looks
 * wrong but is actually the requirement", and both require a named human so the acceptance has
 * somebody behind it.
 */
export interface HeadlessAcceptance {
  rationale: string;
  acceptedBy: string;
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
] as const;
export type SurfaceCode = (typeof SURFACE_CODES)[number];

const err = (code: SurfaceCode, message: string, stepId?: string): ValidationIssue =>
  ({ code, message, stepId, severity: 'error' });

const isStr = (v: unknown): v is string => typeof v === 'string';
const blank = (v: string): boolean => v.trim() === '';

/**
 * Tasks that are business work, and so need a surface decision.
 *
 * `START` and `END` are flow markers: they denote where a process begins and ends, not work a
 * human or a machine performs. Requiring a surface for them would force every blueprint to invent
 * two meaningless bindings, and the noise would train reviewers to rubber-stamp the list.
 *
 * NOT the same line as `processValidation.isFlowOrStart`, and attempt 1's header wrongly claimed it
 * was: that helper INCLUDES `START`, because it answers a reachability question — START must also
 * be able to finish. This one excludes it, because START is not work anyone performs.
 */
export function businessTasks(project: FactoryProject): FactoryTask[] {
  return project.tasks.filter((t) => t.kind === 'TASK' || t.kind === 'DECISION');
}

const REF_STRINGS = ['workspaceId', 'workspaceTitle', 'action', 'primaryJob', 'whyNotExisting',
  'deepLink'] as const;
const REF_ARRAYS = ['intendedRoles', 'records', 'decisions', 'requirementIds', 'taskIds',
  'permissionViews'] as const;

/**
 * Is this binding structurally usable at all?
 *
 * Returns a refusal, or `null` when the shape is sound enough for the content rules to run. Every
 * field a later check dereferences is proven present and correctly typed here, so no later rule
 * can throw on model-shaped JSON.
 */
function shapeIssue(b: TaskSurfaceBinding): ValidationIssue | null {
  const raw = b as unknown as Record<string, unknown>;
  const at = isStr(raw.taskId) ? raw.taskId : undefined;
  const bad = (m: string) => err('SURFACE_BINDING_MALFORMED', m, at);

  if (!isStr(raw.taskId) || blank(raw.taskId)) return bad('A binding carries no usable taskId.');
  if (raw.kind !== 'workspace' && raw.kind !== 'headless') {
    return bad(`Binding for ${raw.taskId} declares kind "${String(raw.kind)}"; the only states are `
      + '"workspace" and "headless". There is no third.');
  }
  if (raw.kind === 'headless') {
    return isStr(raw.reason) ? null
      : bad(`Headless binding for ${raw.taskId} carries no reason string.`);
  }

  const ref = raw.ref;
  if (ref === null || typeof ref !== 'object') {
    return bad(`Workspace binding for ${raw.taskId} carries no ref.`);
  }
  const r = ref as Record<string, unknown>;
  for (const f of REF_STRINGS) {
    if (!isStr(r[f])) return bad(`Workspace binding for ${raw.taskId} has a non-string ${f}.`);
  }
  for (const f of REF_ARRAYS) {
    if (!Array.isArray(r[f])) return bad(`Workspace binding for ${raw.taskId} has a non-array ${f}.`);
  }
  if (r.audience !== 'internal' && r.audience !== 'customer') {
    return bad(`Workspace binding for ${raw.taskId} declares audience "${String(r.audience)}"; the `
      + 'only audiences are "internal" and "customer".');
  }
  if (typeof r.preservesNavigationState !== 'boolean') {
    return bad(`Workspace binding for ${raw.taskId} has a non-boolean preservesNavigationState.`);
  }
  return null;
}

/** Content rules for one well-shaped workspace ref. */
function refIssues(
  b: Extract<TaskSurfaceBinding, { kind: 'workspace' }>,
  roleIds: ReadonlySet<string>,
  requirementIds: ReadonlySet<string>,
): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const r = b.ref;
  const push = (c: SurfaceCode, m: string) => out.push(err(c, m, b.taskId));

  if (blank(r.whyNotExisting)) {
    push('NEW_SCREEN_UNJUSTIFIED',
      `Workspace ${r.workspaceId} carries no rationale for why an existing workspace cannot serve it.`);
  }
  if (blank(r.deepLink)) {
    push('SURFACE_DEEP_LINK_MISSING',
      `Workspace ${r.workspaceId} declares no deep link, so its state cannot be addressed.`);
  }
  if (!r.preservesNavigationState) {
    push('SURFACE_NAVIGATION_STATE_NOT_PRESERVED',
      `Workspace ${r.workspaceId} declares preservesNavigationState false. §4.5 requires preserved `
      + 'navigation state, so this declares non-compliance rather than satisfying the field.');
  }

  // §4.5's required per-screen content. `decisions` is deliberately absent from this list: empty
  // is legal for a read-only view, and that exception is documented on the interface.
  for (const [field, value] of [
    ['workspaceId', r.workspaceId], ['workspaceTitle', r.workspaceTitle],
    ['action', r.action], ['primaryJob', r.primaryJob],
  ] as const) {
    if (blank(value)) push('SURFACE_FIELD_EMPTY', `Workspace ${r.workspaceId} has an empty ${field}.`);
  }
  if (r.intendedRoles.length === 0) {
    push('SURFACE_FIELD_EMPTY', `Workspace ${r.workspaceId} names no intended roles.`);
  }
  if (r.records.length === 0) {
    push('SURFACE_FIELD_EMPTY', `Workspace ${r.workspaceId} surfaces no records.`);
  }

  if (!r.taskIds.includes(b.taskId)) {
    push('SURFACE_TASKIDS_INCONSISTENT',
      `Workspace ${r.workspaceId} is bound to task ${b.taskId} but its own taskIds do not list it.`);
  }
  for (const roleId of [...r.intendedRoles, ...r.permissionViews.map((p) => p.roleId)]) {
    if (!roleIds.has(roleId)) {
      push('SURFACE_ROLE_UNKNOWN',
        `Workspace ${r.workspaceId} names role ${roleId}, which is not in project.roles.`);
    }
  }
  // Its OWN code rather than an overload. Attempt 1 folded this into `SURFACE_TASK_UNKNOWN`, and
  // the overload is precisely what hid the branch from the code-reachability test: deleting the
  // check left the suite green at 28/28.
  for (const reqId of r.requirementIds) {
    if (!requirementIds.has(reqId)) {
      push('SURFACE_REQUIREMENT_UNKNOWN',
        `Workspace ${r.workspaceId} cites requirement ${reqId}, which the project does not declare.`);
    }
  }
  return out;
}

/** Audience conflation across every sound workspace binding. */
function audienceIssues(sound: ReadonlyArray<TaskSurfaceBinding>): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const byId = new Map<string, SurfaceAudience>();
  for (const b of sound) {
    if (b.kind !== 'workspace') continue;
    const prior = byId.get(b.ref.workspaceId);
    if (prior === undefined) byId.set(b.ref.workspaceId, b.ref.audience);
    else if (prior !== b.ref.audience) {
      out.push(err('SURFACE_AUDIENCE_CONFLATED',
        `Workspace ${b.ref.workspaceId} is declared both ${prior} and ${b.ref.audience}; a single `
        + 'surface cannot hold both trust boundaries.', b.taskId));
    }
  }
  return out;
}

/** Is owner acceptance of a no-human-path blueprint present and complete? */
function headlessAccepted(a: HeadlessAcceptance | null): boolean {
  return a !== null
    && isStr(a.rationale) && !blank(a.rationale)
    && isStr(a.acceptedBy) && !blank(a.acceptedBy);
}

/** Validate a declared set of bindings against the project they claim to describe. */
export function validateTaskSurfaces(
  project: FactoryProject,
  bindings: ReadonlyArray<TaskSurfaceBinding>,
  headlessAcceptance: HeadlessAcceptance | null = null,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const work = businessTasks(project);
  const workIds = new Set(work.map((t) => t.id));
  const allTaskIds = new Set(project.tasks.map((t) => t.id));
  const roleIds = new Set(project.roles.map((r) => r.id));
  const requirementIds = new Set(project.requirements.map((r) => r.id));

  const sound: TaskSurfaceBinding[] = [];
  const seen = new Set<string>();

  for (const b of bindings) {
    const shape = shapeIssue(b);
    if (shape) { issues.push(shape); continue; }

    // The MIRROR of the unmapped-task check. T6 in Phase 3 proved the unchecked direction is the
    // one that inflates the headline: one effort row for a nonexistent task took a manual-only
    // blueprint to 97.9% automated. A binding for a ghost task would make coverage look complete.
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

    // A flow marker performs no work, so it cannot carry a surface. Attempt 1 silently SKIPPED
    // these, so a ref on START bypassed every §4.5 rule while still being counted by
    // `consolidationAssessment` — a surface that existed for the count and nothing else.
    if (!workIds.has(b.taskId)) {
      issues.push(err('SURFACE_BINDING_ON_FLOW_MARKER',
        `Task ${b.taskId} is a flow marker (START/END) and performs no work, so it cannot carry a `
        + 'surface or a headless reason.', b.taskId));
      continue;
    }
    sound.push(b);
  }

  for (const t of work) {
    if (!seen.has(t.id)) {
      issues.push(err('SURFACE_UNMAPPED',
        `Task ${t.id} ("${t.title}") maps to no workspace action and is not marked headless.`, t.id));
    }
  }

  for (const b of sound) {
    if (b.kind === 'headless') {
      if (!(HEADLESS_REASONS as ReadonlyArray<string>).includes(b.reason)) {
        issues.push(err('HEADLESS_REASON_UNDECLARED',
          `Task ${b.taskId} is headless with reason "${String(b.reason)}", which is not one of the `
          + `declared reasons (${HEADLESS_REASONS.join(', ')}).`, b.taskId));
      }
      continue;
    }
    issues.push(...refIssues(b, roleIds, requirementIds));
  }

  issues.push(...audienceIssues(sound));

  // PROJECT level, and a DISCLOSURE rather than a threshold. See the module header: refusing
  // outright would force a legitimately headless pipeline to invent a screen to clear the gate.
  const reachesHuman = sound.some((b) => b.kind === 'workspace');
  if (work.length > 0 && !reachesHuman && !headlessAccepted(headlessAcceptance)) {
    issues.push(err('SURFACE_NO_HUMAN_PATH',
      `No business task reaches a human surface: all ${work.length} are headless, with no rationale `
      + 'and no named acceptor. A blueprint with no human path cannot demonstrate the approval or '
      + 'human-takeover journeys §4.5 requires. That is a disclosure requirement rather than a '
      + 'prohibition — but an undisclosed one is how a design decision quietly becomes a defect.'));
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
 *
 * Malformed bindings are SKIPPED rather than crashed on: attempt 1 threw a `TypeError` here on a
 * ref-less binding. `validateTaskSurfaces` is what reports them.
 */
export function consolidationAssessment(
  bindings: ReadonlyArray<TaskSurfaceBinding>,
): { workspaceCount: number; headlessCount: number; workspaces: ConsolidationEntry[] } {
  const byId = new Map<string, ConsolidationEntry>();
  let headlessCount = 0;

  for (const b of bindings) {
    if (shapeIssue(b) !== null) continue;
    if (b.kind === 'headless') { headlessCount += 1; continue; }

    const existing = byId.get(b.ref.workspaceId);
    if (existing) { existing.taskIds.push(b.taskId); continue; }
    byId.set(b.ref.workspaceId, {
      workspaceId: b.ref.workspaceId,
      workspaceTitle: b.ref.workspaceTitle,
      audience: b.ref.audience,
      taskIds: [b.taskId],
      whyNotExisting: b.ref.whyNotExisting,
    });
  }

  return { workspaceCount: byId.size, headlessCount, workspaces: [...byId.values()] };
}

/**
 * Which free-text `proposed_surfaces` from the understanding have no declared workspace.
 *
 * REPORTED, NEVER AUTO-BOUND. `proposed_surfaces` is free-text model output, so matching it to a
 * workspace is a judgement a human makes. Auto-binding on a string match would manufacture exactly
 * the traceability this phase exists to establish honestly, and treating an unmatched proposal as
 * an error would push a generator to invent a screen to clear the gate. A surface named upstream
 * and absent downstream is a question for a reviewer.
 *
 * NO CONSUMER YET, and that is recorded rather than implied: nothing in the repo calls this, and
 * the plan does not schedule a caller. It is here because the gap it reports is real, and it is
 * noted as an open obligation so it does not sit as a producer nobody reads.
 *
 * Blank proposals and malformed bindings are ignored rather than reported or thrown.
 */
export function unboundProposedSurfaces(
  proposedSurfaces: ReadonlyArray<string>,
  bindings: ReadonlyArray<TaskSurfaceBinding>,
): string[] {
  const titles = new Set<string>();
  for (const b of bindings) {
    if (shapeIssue(b) !== null || b.kind !== 'workspace') continue;
    titles.add(b.ref.workspaceTitle.trim().toLowerCase());
  }
  return proposedSurfaces.filter(
    (p) => isStr(p) && !blank(p) && !titles.has(p.trim().toLowerCase()),
  );
}
