/**
 * P4-T1 shape and content checks for a declared task-surface binding.
 *
 * Extracted from `workspaceMapping.ts` because that file reached **602 lines against
 * CLAUDE.md's 500-line hard ceiling**, and the rule is that the next change to an oversize
 * file splits it before adding code. Attempt 3 is the change that pushed it over, so attempt 3
 * splits it — rather than leaving the note for P4-T5 that attempt 2 wrote and attempt 3
 * then invalidated.
 *
 * The seam was already cut: shape, content, audience and acceptance were four separate
 * functions. The types live HERE and `workspaceMapping` imports them, so there is no cycle;
 * `workspaceMapping` re-exports the public ones, so every existing import path still resolves.
 *
 * ## EVERY field is defended against runtime JSON, not just `reason`
 *
 * Attempt 1 said a decomposition arrives as JSON where `as` casts and model output bypass the
 * union — true — and then defended **one** field against it. Attempt 2 defended every
 * field and still threw on a malformed **container** or array **element**: a `null` entry in
 * the bindings array, a `null` inside `permissionViews`. Ten live throws, in the two functions
 * the documentation called crash-proof. A dropped object in a JSON list is exactly what
 * `JSON.parse` yields.
 *
 * The same mistake three times, each a level up: one field, then every field but not the
 * container, then the array but not its members, then — attempt 3 — every member but not the
 * STRINGIFICATION of the non-union value in the refusal it emits.
 *
 * ## The bound, and how it is now established
 *
 * Four attempts published a universally-quantified claim ("refuses all of it", "no later rule
 * can throw", "every value `JSON.parse` can produce") backed by a hand-written list of the cases
 * the author thought of. A twelve-item enumeration cannot support a claim over an infinite space,
 * and it failed every time.
 *
 * **So the claim is now backed by a GENERATOR, not a list.** `__tests__/workspaceMapping.test.ts`
 * builds its corpus from a seeded deterministic JSON generator plus the known-hostile literals,
 * splices every value into every reachable path, and asserts zero throws across all three
 * exported functions. Same seed, same corpus, every run — so the evidence is reproducible rather
 * than anecdotal. The standing rule this follows is recorded in `plan-phase4.md`.
 *
 * **Out of scope, stated rather than discovered:** an object with a throwing accessor (`get ref()
 * { throw }`) or one built by `Object.create(null)`. Neither is `JSON.parse`-producible, so
 * neither is on the model-output path, and a blanket try/catch would hide real defects rather
 * than classify them.
 */

import type { ValidationIssue } from '../../factory/factoryValidate';

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

export const err = (code: SurfaceCode, message: string, stepId?: string): ValidationIssue =>
  ({ code, message, stepId, severity: 'error' });

export const isStr = (v: unknown): v is string => typeof v === 'string';

/**
 * Describe a value in a refusal message WITHOUT invoking any user code.
 *
 * This is where attempt 3 still threw, and the location is the instructive part: the unsafe
 * call was inside the REFUSAL ITSELF. The code proved a value was not in its union and then
 * interpolated that same value into the message explaining why — so a hostile value was
 * guaranteed to reach `String()`.
 *
 * `String(JSON.parse('{"toString":null}'))` throws `TypeError: Cannot convert object to
 * primitive value`: with `toString` null, it falls through to `Object.prototype.valueOf`, which
 * returns the object, and V8 gives up. Ordinary JSON, no Proxy, no accessor.
 *
 * `typeof` and `Array.isArray` cannot call into user code, so this helper cannot throw.
 */
export function label(v: unknown): string {
  if (isStr(v)) return v;
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
export const blank = (v: string): boolean => v.trim() === '';

const REF_STRINGS = ['workspaceId', 'workspaceTitle', 'action', 'primaryJob', 'whyNotExisting',
  'deepLink'] as const;
const REF_ARRAYS = ['intendedRoles', 'records', 'decisions', 'requirementIds', 'taskIds',
  'permissionViews'] as const;

/** A plain object: not null, not an array. The shape every nested check assumes. */
export const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** One `permissionViews` element, typed to its ELEMENTS and not merely to the array. */
function isPermissionView(v: unknown): boolean {
  if (!isObj(v)) return false;
  return isStr(v.roleId) && Array.isArray(v.visibleActions) && v.visibleActions.every(isStr);
}

/**
 * Is this binding structurally usable at all?
 *
 * Returns a refusal, or `null` when the shape is sound enough for the content rules to run.
 *
 * ## The bound: every `JSON.parse`-producible ARGUMENT, proven by a generator
 *
 * Attempt 2 said "every field a later check dereferences is proven present and correctly typed
 * here, so no later rule can throw". That was false, and in the ordinary case rather than an exotic
 * one: a `null` ELEMENT inside the bindings array, or inside `permissionViews`, still threw a raw
 * `TypeError`. A dropped object in a list is exactly what `JSON.parse` yields, and
 * `consolidationAssessment([null])` crashed in the function the documentation called crash-proof.
 *
 * The defect was the same one twice: attempt 1 defended one field of many, attempt 2 defended every
 * field but not the CONTAINER or the array ELEMENTS. Proving `permissionViews` is an array while
 * never typing its members is the array-level version of the same mistake.
 *
 * Every `JSON.parse`-producible value, in any argument or any nested position, is refused rather
 * than thrown on — including the two cases attempt 3 missed: a value whose `toString` is null
 * (which broke the refusal message itself) and a non-array in the `bindings` or
 * `proposedSurfaces` argument. Established by the generator described in the file header, not by
 * an enumeration.
 *
 * **Explicitly NOT covered:** a hostile object with a throwing accessor (`get ref() { throw }`).
 * `JSON.parse` cannot produce one, so it is not on the model-output path this module defends, and a
 * blanket try/catch to swallow it would hide real defects rather than classify them. Stated here
 * rather than left for a third verifier to find.
 */
export function shapeIssue(b: TaskSurfaceBinding): ValidationIssue | null {
  // FIRST, and this is the guard whose absence threw: the binding itself must be an object. One
  // check here fixes all three exported functions, because all three call this before touching
  // anything.
  if (!isObj(b)) {
    return err('SURFACE_BINDING_MALFORMED',
      `A binding is ${b === null ? 'null' : typeof b}, not an object. A dropped entry in a JSON `
      + 'array arrives exactly this way.');
  }
  const raw = b as unknown as Record<string, unknown>;
  const at = isStr(raw.taskId) ? raw.taskId : undefined;
  const bad = (m: string) => err('SURFACE_BINDING_MALFORMED', m, at);

  if (!isStr(raw.taskId) || blank(raw.taskId)) return bad('A binding carries no usable taskId.');
  if (raw.kind !== 'workspace' && raw.kind !== 'headless') {
    return bad(`Binding for ${raw.taskId} declares kind "${label(raw.kind)}"; the only states are `
      + '"workspace" and "headless". There is no third.');
  }
  if (raw.kind === 'headless') {
    return isStr(raw.reason) ? null
      : bad(`Headless binding for ${raw.taskId} carries no reason string.`);
  }

  if (!isObj(raw.ref)) {
    return bad(`Workspace binding for ${raw.taskId} carries no usable ref.`);
  }
  const r = raw.ref;
  for (const f of REF_STRINGS) {
    if (!isStr(r[f])) return bad(`Workspace binding for ${raw.taskId} has a non-string ${f}.`);
  }
  for (const f of REF_ARRAYS) {
    if (!Array.isArray(r[f])) return bad(`Workspace binding for ${raw.taskId} has a non-array ${f}.`);
  }
  // The ELEMENTS, not just the arrays. `permissionViews` is the one `refIssues` dereferences, so a
  // null member there was a live throw; the string arrays are typed for the same reason rather than
  // waiting to become one.
  for (const f of ['intendedRoles', 'records', 'decisions', 'requirementIds', 'taskIds'] as const) {
    if (!(r[f] as unknown[]).every(isStr)) {
      return bad(`Workspace binding for ${raw.taskId} has a non-string entry in ${f}.`);
    }
  }
  if (!(r.permissionViews as unknown[]).every(isPermissionView)) {
    return bad(`Workspace binding for ${raw.taskId} has a permissionViews entry that is not an `
      + 'object with a string roleId and a string-array visibleActions.');
  }
  if (r.audience !== 'internal' && r.audience !== 'customer') {
    return bad(`Workspace binding for ${raw.taskId} declares audience "${label(r.audience)}"; the `
      + 'only audiences are "internal" and "customer".');
  }
  if (typeof r.preservesNavigationState !== 'boolean') {
    return bad(`Workspace binding for ${raw.taskId} has a non-boolean preservesNavigationState.`);
  }
  return null;
}

/** Content rules for one well-shaped workspace ref. */
export function refIssues(
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
export function audienceIssues(sound: ReadonlyArray<TaskSurfaceBinding>): ValidationIssue[] {
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

/** Is owner acceptance present, complete, and authored by someone other than this turn? */
export function headlessAccepted(a: HeadlessAcceptance | null): boolean {
  return isObj(a)
    && isStr(a.rationale) && !blank(a.rationale)
    && isStr(a.acceptedBy) && !blank(a.acceptedBy)
    && a.origin === 'owner_recorded';
}

/** Present and complete, but self-supplied — a waiver the generator wrote for itself. */
export function headlessSelfSupplied(a: HeadlessAcceptance | null): boolean {
  return isObj(a)
    && isStr(a.rationale) && !blank(a.rationale)
    && isStr(a.acceptedBy) && !blank(a.acceptedBy)
    && a.origin === 'model_turn';
}
