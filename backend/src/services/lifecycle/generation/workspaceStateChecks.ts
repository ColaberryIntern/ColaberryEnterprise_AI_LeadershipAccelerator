/**
 * workspaceStateChecks — the three states a surface has, and whether a human can reach its
 * actions from a keyboard. PURE, no I/O.
 *
 * §4.5: "Verify actual interactions, empty/loading/error states, and permission-specific views"
 * and "preserve responsive behavior, keyboard navigation, contrast, reduced motion, and clear
 * status labels."
 *
 * P4-T1 gave a workspace a job, roles, records, decisions, a deep link and permission views. It
 * said nothing about what the surface looks like when there is nothing in it, when it is waiting,
 * or when it has failed — and nothing about whether the actions it declares can be reached
 * without a mouse. Those are the gaps this module closes.
 *
 * ## Why the declaration is per WORKSPACE, not per binding
 *
 * A binding is per task, and several tasks legitimately bind to the same workspace with different
 * actions. States belong to the surface, so putting them on `WorkspaceRef` would let two bindings
 * disagree about the same workspace's error state, and nothing could say which one held. Keyed by
 * `workspaceId`, a contradiction is impossible to express rather than merely discouraged.
 *
 * ## All three states are required, unconditionally
 *
 * The task packet asked for an error state "for a workspace with a failure path". This requires
 * all three for every workspace instead, and the stricter rule is the honest one: any surface can
 * fail to load, so every surface has a failure path whether the process graph models one or not.
 * Deriving "has a failure path" from the transitions would have been a cleverness that silently
 * exempts exactly the surfaces nobody modelled carefully.
 *
 * ## The contrast rule is a CHECK, and the allow-list is measured
 *
 * `docs/project-lifecycle/ux-review-phase4.md` measured the design system's token pairs with
 * `scripts/checkTokenContrast.js`, and six of twelve fall below WCAG AA 4.5:1 for normal text —
 * including two of the four pairs in the repo's own four-state status family. A status label is
 * normal text, so a declaration naming one of those pairs would ship an inaccessible label.
 *
 * `AA_LABEL_PAIRS` is the default allow-list. It is a VALUE this module ships rather than
 * something it computes, because reading a frontend stylesheet from a backend service at runtime
 * would be the wrong coupling entirely. What keeps it honest is the test: it derives the
 * AA-passing set from `tokens.css` itself and asserts this list against it, so the list cannot
 * drift from the file it describes without a named failure.
 */

import type { ValidationIssue } from '../../factory/factoryValidate';
import { err as surfaceErr, isObj, isStr, label } from './workspaceBindingChecks';
import type { TaskSurfaceBinding } from './workspaceBindingTypes';

/** The three states §4.5 names. A surface has all three; none of them is optional. */
export const WORKSPACE_STATES = ['empty', 'loading', 'error'] as const;
export type WorkspaceState = (typeof WORKSPACE_STATES)[number];

/**
 * A text/background token pair for a status label.
 *
 * Token NAMES, never hex. `/baseline-ui`'s rule is "never hardcode hex values", and a contract
 * carrying `#FB2832` would also be unverifiable against the token file — the name is what can be
 * checked, and the name is what survives a palette change.
 */
export interface StatusLabelTokens {
  textToken: string;
  bgToken: string;
}

/**
 * One workspace's states and keyboard surface.
 *
 * `keyboardReachableActions` is checked BOTH ways against the actions the bindings declare for
 * this workspace: an action nobody can reach is refused, and a reachable action nobody declared
 * is refused too. Only the first direction is the accessibility requirement; the second exists
 * because a one-directional check can be satisfied by padding the list, which is the same trick
 * as an empty array standing in for a decision.
 */
export interface WorkspaceStateDeclaration {
  workspaceId: string;
  states: ReadonlyArray<{ state: WorkspaceState; label: string; tokens: StatusLabelTokens }>;
  keyboardReachableActions: ReadonlyArray<string>;
}

/**
 * Token pairs measured at or above WCAG AA 4.5:1 and suitable for a label.
 *
 * Derived from `node scripts/checkTokenContrast.js` on 2026-10-06. The focus-ring pair
 * (`--color-primary-light` on `--color-bg`, 6.22:1) passes but is deliberately absent: it is a
 * non-text boundary, and listing it would invite a label in the brand colour, which at
 * `--color-primary` itself is 3.85:1 and fails.
 *
 * Absent and deliberately so: `--status-partial-*` (3.61:1) and `--status-verified-*` (3.95:1),
 * which are two of the four pairs in the repo's own status family. That is a finding about the
 * design system, recorded in the register for the owner of the token file.
 */
export const AA_LABEL_PAIRS: ReadonlyArray<StatusLabelTokens> = [
  { textToken: '--status-matched-text', bgToken: '--status-matched-bg' },
  { textToken: '--status-unmapped-text', bgToken: '--status-unmapped-bg' },
  { textToken: '--n700', bgToken: '--n100' },
  { textToken: '--n900', bgToken: '--n50' },
  { textToken: '--color-text', bgToken: '--color-bg' },
];

export const STATE_CODES = [
  'STATE_DECLARATION_MALFORMED',
  'STATE_WORKSPACE_UNDECLARED',
  'STATE_WORKSPACE_UNKNOWN',
  'STATE_DECLARATION_DUPLICATE',
  'STATE_MISSING',
  'STATE_DUPLICATE',
  'STATE_LABEL_BLANK',
  'STATE_LABEL_CONTRAST_UNSAFE',
  'ACTION_NOT_KEYBOARD_REACHABLE',
  'KEYBOARD_ACTION_UNDECLARED',
] as const;
export type StateCode = (typeof STATE_CODES)[number];

const err = (code: StateCode, message: string, stepId?: string): ValidationIssue =>
  // Reuses P4-T1's constructor so the issue shape stays identical across the phase. The cast is
  // the one concession: `surfaceErr` is typed to `SurfaceCode`, and widening that union to admit
  // this module's codes would make a surface-code typo compile over there.
  surfaceErr(code as never, message, stepId);

const blank = (v: unknown): boolean => !isStr(v) || v.trim().length === 0;

/** Compare a pair by its two field VALUES, which arrive as `unknown` and stay that way. */
const samePair = (text: unknown, bg: unknown, p: StatusLabelTokens): boolean =>
  p.textToken === text && p.bgToken === bg;

/** Workspaces the bindings actually reference, with the actions declared on each. */
function declaredSurfaces(bindings: ReadonlyArray<TaskSurfaceBinding>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const b of bindings) {
    if (!isObj(b) || b.kind !== 'workspace' || !isObj(b.ref)) continue;
    const id = (b.ref as { workspaceId?: unknown }).workspaceId;
    const action = (b.ref as { action?: unknown }).action;
    if (!isStr(id)) continue;
    if (!out.has(id)) out.set(id, new Set());
    if (isStr(action)) out.get(id)!.add(action);
  }
  return out;
}

/** The three-state half, for one declaration. */
function stateIssues(
  workspaceId: string,
  d: Record<string, unknown>,
  allowed: ReadonlyArray<StatusLabelTokens>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const states: ReadonlyArray<Record<string, unknown>> = Array.isArray(d.states) ? d.states : [];

  for (const s of states) {
    if (!isObj(s) || !isStr(s.state) || !(WORKSPACE_STATES as ReadonlyArray<string>).includes(s.state)) {
      issues.push(err('STATE_DECLARATION_MALFORMED',
        `Workspace '${workspaceId}' declares a state ${label(isObj(s) ? s.state : s)}, which is not one of `
        + `${WORKSPACE_STATES.join(', ')}.`, workspaceId));
      continue;
    }
    if (seen.has(s.state)) {
      issues.push(err('STATE_DUPLICATE',
        `Workspace '${workspaceId}' declares the '${s.state}' state twice; the record cannot say which holds.`,
        workspaceId));
      continue;
    }
    seen.add(s.state);

    if (blank(s.label)) {
      issues.push(err('STATE_LABEL_BLANK',
        `Workspace '${workspaceId}' state '${s.state}' has no label. §4.5 requires a clear status `
        + 'label, and a state distinguishable only by colour or motion is not one.', workspaceId));
    }
    // Two operands, not four. An earlier draft also tested `isStr(t.textToken)` and
    // `isStr(t.bgToken)`, and both were inert: a non-string token name cannot match any pair on
    // the allow-list either, so neither could ever be the operand that decided an answer, and no
    // test could isolate it. `isObj` stays because without it `samePair` dereferences undefined
    // and throws. Amendment 4, category 2.
    const t = s.tokens;
    if (!isObj(t) || !allowed.some((p) => samePair(t.textToken, t.bgToken, p))) {
      issues.push(err('STATE_LABEL_CONTRAST_UNSAFE',
        `Workspace '${workspaceId}' state '${s.state}' labels with ${label(isObj(t) ? t.textToken : t)} on `
        + `${label(isObj(t) ? t.bgToken : t)}, which is not a pair measured at WCAG AA 4.5:1 or above.`,
        workspaceId));
    }
  }

  // Per state, never "some states are missing": a human fixing this needs the name.
  for (const state of WORKSPACE_STATES) {
    if (!seen.has(state)) {
      issues.push(err('STATE_MISSING',
        `Workspace '${workspaceId}' declares no '${state}' state. All three are required: any `
        + 'surface can be empty, can be waiting, and can fail.', workspaceId));
    }
  }
  return issues;
}

/** The keyboard half, checked in both directions against the bindings. */
function keyboardIssues(
  workspaceId: string,
  d: Record<string, unknown>,
  actions: Set<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const reachable = new Set<string>(
    (Array.isArray(d.keyboardReachableActions) ? d.keyboardReachableActions : []).filter(isStr),
  );
  for (const a of [...actions].sort()) {
    if (!reachable.has(a)) {
      issues.push(err('ACTION_NOT_KEYBOARD_REACHABLE',
        `Workspace '${workspaceId}' declares the action '${a}' but does not list it as reachable `
        + 'from a keyboard. A focus style cannot help an action that has no keyboard path.',
        workspaceId));
    }
  }
  for (const a of [...reachable].sort()) {
    if (!actions.has(a)) {
      issues.push(err('KEYBOARD_ACTION_UNDECLARED',
        `Workspace '${workspaceId}' lists '${a}' as keyboard-reachable, but no binding declares `
        + 'that action here. Checking only one direction would let the list be padded.',
        workspaceId));
    }
  }
  return issues;
}

/**
 * Validate the state and keyboard declarations against the workspaces the bindings reference.
 *
 * `allowed` is a parameter rather than a constant read so a caller can supply a re-measured list
 * when the token file changes, and so the test can prove the check fires on a pair it rejects
 * without editing the shipped default.
 */
export function validateWorkspaceStates(
  bindings: ReadonlyArray<TaskSurfaceBinding>,
  declarations: ReadonlyArray<WorkspaceStateDeclaration>,
  allowed: ReadonlyArray<StatusLabelTokens> = AA_LABEL_PAIRS,
): ValidationIssue[] {
  // Fail CLOSED on an unusable container, exactly as `validateTaskSurfaces` does: reporting
  // "nothing to check" on a malformed argument turns a broken input into a pass.
  if (!Array.isArray(bindings) || !Array.isArray(declarations)) {
    return [err('STATE_DECLARATION_MALFORMED',
      `Expected two arrays; got bindings ${label(bindings)} and declarations ${label(declarations)}. `
      + 'Nothing can be validated against those, so this refuses rather than reporting compliance.')];
  }

  const issues: ValidationIssue[] = [];
  const surfaces = declaredSurfaces(bindings);
  const byId = new Map<string, Record<string, unknown>>();

  for (const d of declarations) {
    if (!isObj(d) || !isStr(d.workspaceId)) {
      issues.push(err('STATE_DECLARATION_MALFORMED',
        `A state declaration has workspaceId ${label(isObj(d) ? d.workspaceId : d)}, which is not a string.`));
      continue;
    }
    // Bound once, narrowed once. Reading `d.workspaceId` repeatedly is what let a careless
    // rename put an out-of-scope identifier in three messages at once.
    const workspaceId: string = d.workspaceId;
    if (byId.has(workspaceId)) {
      issues.push(err('STATE_DECLARATION_DUPLICATE',
        `Workspace '${workspaceId}' has two state declarations; the later would silently win.`,
        workspaceId));
      continue;
    }
    byId.set(workspaceId, d);
    if (!surfaces.has(workspaceId)) {
      issues.push(err('STATE_WORKSPACE_UNKNOWN',
        `A state declaration names workspace '${workspaceId}', which no binding references.`,
        workspaceId));
    }
  }

  for (const [id, actions] of [...surfaces.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const d = byId.get(id);
    if (d === undefined) {
      issues.push(err('STATE_WORKSPACE_UNDECLARED',
        `Workspace '${id}' is bound to a task but declares no empty, loading or error state.`, id));
      continue;
    }
    issues.push(...stateIssues(id, d, allowed), ...keyboardIssues(id, d, actions));
  }
  return issues;
}
