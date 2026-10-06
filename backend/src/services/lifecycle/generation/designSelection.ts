/**
 * designSelection — what was chosen, and what the chosen design must be able to demonstrate.
 *
 * §4.5: "Required prototype journeys: normal success, approval, rejection/revision,
 * uncertain/failed AI result, and human takeover. Approval records reference the selected
 * variant and visual contract revision."
 *
 * ## The honest limit, stated before anything else
 *
 * A journey here is a DECLARED path over a structure: a list of (task, workspace, action) steps
 * that the selected design claims to support. It is not a rendered interaction, and nothing in
 * this module clicks anything. There is no surface to click until Phase 5. §4.5 also says "a
 * screenshot or matching domain vocabulary alone does not establish usability", and a declared
 * journey does not either — what it does is make the claim checkable and name the gap, instead
 * of leaving "can be demonstrated" as an untested sentence in a brief.
 *
 * ## One structure is an answer, not a failure
 *
 * `MIN_VARIANTS` is 2, and a short linear process can honestly admit only one shape. Refusing
 * there would strand the manual-only case, which is the one Phase 3 built a fixture for. Padding
 * to two would ship the "one proposal presented as a choice" that `deliveryDesignLoop.ts`
 * already warns about, with the warning suppressed.
 *
 * So the sole structure is RECORDED, with a rationale and a named human who accepted it. That is
 * the shape this repo already uses for a below-target AI share: the honest answer proceeds, and
 * it proceeds visibly. `ALTERNATIVES_NO_STRUCTURE` is reserved for ZERO structures, which is not
 * a thin design — it means the process graph produced nothing a human can stand in front of.
 *
 * ## Why the acceptance carries an origin
 *
 * Same reason as `HeadlessAcceptance` in `workspaceBindingChecks`: a generator that emits both
 * the design and its own waiver can declare whatever it invents. `origin: 'model_turn'` is
 * refused, so the waiver costs a real human decision rather than a string literal.
 */

import { MIN_VARIANTS } from '../../delivery/deliveryDesignLoop';
import type { ValidationIssue } from '../../factory/factoryValidate';
import type { AlternativeSet, DesignAlternative, DesignPatternKey } from './designAlternatives';
import type { AcceptanceOrigin } from './workspaceBindingChecks';
import { isStr, label } from './workspaceBindingChecks';

/** The five §4.5 names, verbatim in meaning. Not a set this module chose the size of. */
export const JOURNEY_KINDS = [
  'normal_success',
  'approval',
  'rejection_or_revision',
  'uncertain_or_failed_ai',
  'human_takeover',
] as const;
export type JourneyKind = (typeof JOURNEY_KINDS)[number];

/**
 * A journey is DECLARED with steps, or declared NOT APPLICABLE with a reason and an acceptor.
 *
 * The second branch is not a loophole, it is the manual-only case. A project with no agent has
 * no "uncertain AI result" to show and nothing for a human to take over from, and a rule that
 * demanded those journeys anyway would be punishing the honest answer — the same mistake as
 * demanding an agent roster from Fixture D. What it must not be is SILENT, which is why the
 * waiver carries the same rationale/acceptor/origin triple as every other waiver in this phase.
 */
export type JourneyDeclaration =
  | {
      kind: JourneyKind;
      status: 'declared';
      steps: ReadonlyArray<{ taskId: string; workspaceId: string; action: string }>;
    }
  | { kind: JourneyKind; status: 'not_applicable'; why: string; acceptedBy: string; origin: AcceptanceOrigin };

/** A human's recorded acceptance of something the system cannot justify on its own. */
export interface SelectionAcceptance {
  rationale: string;
  acceptedBy: string;
  origin: AcceptanceOrigin;
}

export interface SelectionInput {
  set: AlternativeSet;
  chosenAlternativeId: string;
  /** §4.5: the approval record references this. `null` is refused, never defaulted to 1. */
  visualContractRevision: number | null;
  journeys: ReadonlyArray<JourneyDeclaration>;
  /** Required when the set holds fewer than `MIN_VARIANTS` structures. */
  soleStructureAcceptance?: SelectionAcceptance | null;
}

/**
 * The selection record.
 *
 * `selectedDesignRef` carries the chosen variant AND the visual contract revision in one
 * string, because §4.5 requires the approval to reference both and a ref that carried only the
 * variant would let the contract move underneath an approval without the ref changing.
 */
export interface SelectedDesign {
  selectedDesignRef: string;
  pattern: DesignPatternKey;
  visualContractRevision: number;
  /** Non-null exactly when this design was the only structure available. */
  soleStructureAcceptance: SelectionAcceptance | null;
  journeysDeclared: ReadonlyArray<JourneyKind>;
  journeysNotApplicable: ReadonlyArray<JourneyKind>;
}

export const SELECTION_CODES = [
  'ALTERNATIVES_NO_STRUCTURE',
  'SELECTION_SOLE_STRUCTURE_UNACCEPTED',
  'SELECTION_ACCEPTANCE_SELF_SUPPLIED',
  'SELECTION_CHOICE_UNKNOWN',
  'SELECTION_VISUAL_CONTRACT_REVISION_MISSING',
  'JOURNEY_UNDECLARED',
  'JOURNEY_KIND_UNKNOWN',
  'JOURNEY_DUPLICATED',
  'JOURNEY_STEPS_EMPTY',
  'JOURNEY_STEP_OFF_DESIGN',
  'JOURNEY_WAIVER_UNEXPLAINED',
  'JOURNEY_WAIVER_SELF_SUPPLIED',
] as const;
export type SelectionCode = (typeof SELECTION_CODES)[number];

const err = (code: SelectionCode, message: string, stepId?: string): ValidationIssue =>
  ({ code, message, stepId, severity: 'error' });

const filled = (v: unknown): boolean => isStr(v) && v.trim().length > 0;

/**
 * A real type guard, not an `includes` on a widened array.
 *
 * The widened form compiles but narrows nothing, so every later use of the value stays `string`.
 * That is how three type errors reached a GREEN test run: `ts-jest` runs with
 * `isolatedModules`, which strips types without checking them, so jest cannot see this class of
 * mistake at all and only `tsc --noEmit` can.
 */
const isJourneyKind = (v: unknown): v is JourneyKind =>
  isStr(v) && (JOURNEY_KINDS as ReadonlyArray<string>).includes(v);

/**
 * Check the five journeys against the chosen alternative.
 *
 * A step must name a task AND the workspace that actually serves it in this structure. Checking
 * only the task id would accept a journey that walks through a screen this design does not have,
 * which is how a demo script drifts from the design it claims to demonstrate.
 */
function journeyIssues(
  journeys: ReadonlyArray<JourneyDeclaration>,
  chosen: DesignAlternative,
): { issues: ValidationIssue[]; declared: JourneyKind[]; waived: JourneyKind[] } {
  const issues: ValidationIssue[] = [];
  const declared: JourneyKind[] = [];
  const waived: JourneyKind[] = [];
  const seen = new Set<string>();
  const servedBy = new Map<string, Set<string>>();
  for (const s of chosen.surfaces) {
    if (!servedBy.has(s.taskId)) servedBy.set(s.taskId, new Set());
    servedBy.get(s.taskId)!.add(s.workspaceId);
  }

  for (const j of Array.isArray(journeys) ? journeys : []) {
    const kind = j?.kind;
    if (!isJourneyKind(kind)) {
      // Refused, not skipped. Skipping was the first version, and a mutation replacing this
      // guard with a bare string check survived the whole suite — because a silently dropped
      // entry is indistinguishable from one that was never sent. A typo'd `human_take_over`
      // would vanish and the only trace would be a JOURNEY_UNDECLARED for a different name.
      issues.push(err('JOURNEY_KIND_UNKNOWN', `Journey kind ${label(kind)} is not one of the five §4.5 requires, so it cannot be checked against the design.`));
      continue;
    }
    if (seen.has(kind)) {
      issues.push(err('JOURNEY_DUPLICATED', `Journey '${kind}' is declared more than once; the record cannot say which one holds.`, kind));
      continue;
    }
    seen.add(kind);

    if (j.status === 'not_applicable') {
      if (!filled(j.why) || !filled(j.acceptedBy)) {
        issues.push(err('JOURNEY_WAIVER_UNEXPLAINED', `Journey '${kind}' is waived with no reason or no named acceptor.`, kind));
      } else if (j.origin !== 'owner_recorded') {
        issues.push(err('JOURNEY_WAIVER_SELF_SUPPLIED', `Journey '${kind}' is waived by origin ${label(j.origin)}; a generator cannot accept its own waiver.`, kind));
      } else {
        waived.push(kind);
      }
      continue;
    }

    // Typed as `unknown` fields rather than trusting the declared shape: `Array.isArray` on a
    // `ReadonlyArray` narrows to `any[]`, which would make every field access unchecked.
    const steps: ReadonlyArray<{ taskId?: unknown; workspaceId?: unknown } | null> =
      Array.isArray(j.steps) ? j.steps : [];
    if (steps.length === 0) {
      issues.push(err('JOURNEY_STEPS_EMPTY', `Journey '${kind}' is declared with no steps, which claims a path without describing one.`, kind));
      continue;
    }
    // Both `isStr` operands are LOAD-BEARING AT RUNTIME, and each has its own isolating test.
    //
    // An earlier version of this comment claimed the opposite: that `servedBy` being typed
    // `Map<string, Set<string>>` meant a non-string key missed it either way, so dropping either
    // operand could not change an answer. **That was false and a verifier falsified it.** The
    // map is populated verbatim from caller-supplied `chosen.surfaces`, and a type annotation
    // does not constrain runtime keys: hand it a surface whose `taskId` is `7` and the map really
    // holds the key `7`, the lookup really hits, and the step is ACCEPTED — with a
    // `selectedDesignRef` attached to a journey that walks through a screen named by a number.
    //
    // The lesson is narrower than "be careful": an argument that an operand cannot matter has to
    // be about runtime values, and reasoning from a declared type is not that argument. It is the
    // same mistake as trusting a green `ts-jest` run, which strips types without checking them.
    const off = steps.filter((s) => {
      const t = s?.taskId;
      const w = s?.workspaceId;
      return !isStr(t) || !isStr(w) || !servedBy.get(t)?.has(w);
    });
    if (off.length > 0) {
      issues.push(err('JOURNEY_STEP_OFF_DESIGN', `Journey '${kind}' walks through ${off.length} step(s) the selected design does not serve, first at task ${label(off[0]?.taskId)} on workspace ${label(off[0]?.workspaceId)}.`, kind));
      continue;
    }
    declared.push(kind);
  }

  for (const kind of JOURNEY_KINDS) {
    if (!seen.has(kind)) {
      issues.push(err('JOURNEY_UNDECLARED', `Journey '${kind}' is neither declared nor waived. §4.5 requires all five, and silence is the one answer that records nothing.`, kind));
    }
  }
  return { issues, declared, waived };
}

/**
 * Issues about the SET being selected from, independent of the journeys declared on it.
 *
 * `count` comes from the SANITISED array the caller already built, not from
 * `input.set.alternatives.length`. Reading the raw field would let a non-array with a `length` —
 * a string, say — report a count the rest of the function cannot act on.
 */
function setIssues(
  input: SelectionInput,
  chosen: DesignAlternative | undefined,
  count: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (count === 0) {
    issues.push(err('ALTERNATIVES_NO_STRUCTURE', 'The process graph yields no structure a human can stand in front of, so there is nothing to select.'));
    return issues;
  }
  if (chosen === undefined) {
    issues.push(err('SELECTION_CHOICE_UNKNOWN', `No alternative with id ${label(input?.chosenAlternativeId)} is in the generated set.`));
  }
  if (typeof input?.visualContractRevision !== 'number' || !Number.isInteger(input.visualContractRevision)) {
    issues.push(err('SELECTION_VISUAL_CONTRACT_REVISION_MISSING', 'The approval record must reference a visual contract revision; it cannot be defaulted, or the contract can move underneath an approval.'));
  }
  if (count < MIN_VARIANTS) {
    const a = input?.soleStructureAcceptance;
    if (!a || !filled(a.rationale) || !filled(a.acceptedBy)) {
      issues.push(err('SELECTION_SOLE_STRUCTURE_UNACCEPTED', `Only ${count} structure(s) exist, below the ${MIN_VARIANTS} a comparable decision needs. That is recordable, but it needs a rationale and a named acceptor.`));
    } else if (a.origin !== 'owner_recorded') {
      issues.push(err('SELECTION_ACCEPTANCE_SELF_SUPPLIED', `The sole-structure acceptance has origin ${label(a.origin)}; a generator cannot accept its own thin option set.`));
    }
  }
  return issues;
}

/**
 * Record the selected design, or refuse with named codes.
 *
 * Returns `selected: null` whenever any issue is raised, so a caller cannot read a ref out of a
 * refused selection. That matters downstream: `selectedDesignRef` is what clears
 * `design_variant_not_selected` in `lifecyclePrerequisites`, and a ref produced alongside a
 * refusal would clear a blocking gap on the strength of a record that was rejected.
 */
export function selectDesign(input: SelectionInput): { selected: SelectedDesign | null; issues: ValidationIssue[] } {
  const alternatives = Array.isArray(input?.set?.alternatives) ? input.set.alternatives : [];
  const chosen = alternatives.find((a) => a?.alternativeId === input?.chosenAlternativeId);

  const issues = setIssues(input, chosen, alternatives.length);
  if (chosen === undefined) return { selected: null, issues };

  const j = journeyIssues(input.journeys, chosen);
  issues.push(...j.issues);
  if (issues.length > 0) return { selected: null, issues };

  const revision = input.visualContractRevision as number;
  return {
    selected: {
      selectedDesignRef: `${chosen.alternativeId}@vc${revision}`,
      pattern: chosen.pattern,
      visualContractRevision: revision,
      soleStructureAcceptance: alternatives.length < MIN_VARIANTS ? input.soleStructureAcceptance ?? null : null,
      journeysDeclared: j.declared,
      journeysNotApplicable: j.waived,
    },
    issues: [],
  };
}
