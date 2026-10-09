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
 * functions, and in P4-T5 the vocabulary moved on again to `./workspaceBindingTypes`, so
 * that neither file breaches the 12-symbol export ceiling;
 * there is no cycle, and no module re-exports another, so no file pays for a facade.
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
 * **The claim is backed by a GENERATOR, and SCOPED to what that generator demonstrably
 * reaches.** `__tests__/workspaceMapping.test.ts` builds a corpus from a seeded deterministic
 * JSON generator plus the known-falsifying literals, splices every value into every position
 * in a **hand-written** position table, and asserts zero throws. Same seed, same corpus,
 * every run.
 *
 * **"Hand-written" is stated, not glossed.** An earlier version said "a derived table",
 * which was false: the **keyspace** and the **leaf value space** are derived from these two
 * source files, but the position table is a literal array someone wrote. A verifier caught the
 * overstatement in the very commit that existed to fix overstatement.
 *
 * **No count appears here, under Amendment 3.** The previous version stated a count of the
 * position table and the tables had already grown past it — a stale number inside the
 * sentence written to correct a stale number. Two tests enforce the rule instead of
 * carefulness: one fails if a module header states a present-tense count of the apparatus,
 * and one fails on a duplicate position entry (the table had carried `ref.records[0]` twice).
 *
 * What makes the hand-written list safe is not derivation but a **per-position positive
 * control**: the suite fails and NAMES any position that cannot be reached past its guard.
 * The aggregate version of that control passed while 5 of 27 positions were dead — an average
 * hiding five zero rows. A position missing from the table is still a gap, and that residual
 * limit is recorded rather than claimed away.
 *
 * **Why "scoped" is load-bearing and not hedging.** The fifth falsification of this sentence
 * was not a missing guard — it was that the generator *structurally could not reach* the
 * defect: 0 of 414 corpus values could clear the project guard, because the keyspace was a list
 * I wrote and it contained no `tasks`, `roles`, `requirements`, `id` or `title`. A generator
 * over a hand-listed keyspace is a hand-written enumeration wearing a better costume.
 *
 * So two things changed. The keyspace is now **DERIVED from the dereference sites in these
 * two source files** rather than listed, and a test fails if the generator cannot reach a
 * property name the module actually reads. And a **positive control on the generator itself**
 * asserts that a non-zero number of corpus values reach each guarded body — so a blind spot
 * of this kind cannot recur silently.
 *
 * The standing rule, with the keyspace-derivation clause, is in `plan-phase4.md`.
 *
 * **Out of scope, stated rather than discovered:** an object with a throwing accessor (`get ref()
 * { throw }`) or one built by `Object.create(null)`. Neither is `JSON.parse`-producible, so
 * neither is on the model-output path, and a blanket try/catch would hide real defects rather
 * than classify them.
 */

import type { ValidationIssue } from '../../factory/factoryValidate';

import type {
  HeadlessAcceptance,
  SurfaceAudience,
  SurfaceCode,
  TaskSurfaceBinding,
} from './workspaceBindingTypes';

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
 * ## The bound, scoped to what the generator provably reaches
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
 * Every `JSON.parse`-producible value is refused rather than thrown on, in these positions:
 * the `bindings` argument and every position nested under it; the `proposedSurfaces`
 * argument; the `project` argument, its `tasks`/`roles`/`requirements` arrays and their
 * elements’ `id`, `title` and `kind`; and the `headlessAcceptance` argument.
 *
 * **That list is the claim.** It is not a summary of a broader guarantee — it is exactly what
 * the generator reaches. **Every position in the tables carries a per-position reach
 * control**, and the two whole-argument positions the claim also names (`proposedSurfaces`,
 * `headlessAcceptance`) have their own reach controls as of this commit — a verifier found
 * them named in the claim with none, so "each position carries a control" had been false for
 * two of them.
 *
 * Anything outside the list is unproven, and an unproven position is how this sentence
 * became false five times.
 *
 * **Which mechanism does which job, because crediting the wrong one is its own error.**
 * Reach is delivered by a **valid exemplar seeded per position**, not by the derived leaf
 * literals: three positions (`<binding itself>`, `ref`, `ref.permissionViews[0]`) require
 * the value to BE a valid structure, which random substitution essentially never produces.
 * Mutation-proven — removing the derived literals leaves the suite fully green, while
 * removing one exemplar makes the per-position control fail by name. The derivation broadens
 * the hostile corpus (union-shaped values get tried everywhere); it is **not** what fixed
 * the zero-reach problem, and an earlier draft of this note said it was.
 *
 * Out of scope, by construction rather than oversight: a throwing accessor and
 * `Object.create(null)`, neither of which `JSON.parse` can produce.
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
