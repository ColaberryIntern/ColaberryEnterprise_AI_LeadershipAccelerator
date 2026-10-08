/**
 * Compose a blueprint: run the generation pipeline, then the four checks it never reached.
 *
 * WHAT THIS IS NOT. It is not "the orchestrator". `generateBlueprint` already is that, and it
 * already runs `validateProcess`, `validateAllocation` and `validateAgentScoping` across its
 * staged retry loop. P5-T1.4's task line called this file "NEW: calls the validators in order,
 * collects refusals", and building that would have produced a SECOND orchestration truth for one
 * pipeline — the duplicate-truth failure that the `manifestRefs.ts` correction in this phase
 * exists to prevent. This CONSUMES `generateBlueprint`.
 *
 * WHY THE FOUR WERE NEVER WIRED, which is not an oversight. `BlueprintGenerationInput` carries
 * `understanding, project, allocation, agents, effort, declaration`. The four take collections it
 * has no field for: task-surface bindings, workspace state declarations, control policies, and a
 * design selection. Composition therefore takes a WIDER input than generation. That is the seam,
 * and it is the reason a separate module is right even though a separate orchestrator would not
 * have been.
 *
 * WHY A SEPARATE FILE RATHER THAN MORE OF `blueprintGeneration.ts`: that module is at 11 of the
 * 12 public symbols CLAUDE.md allows. Adding this surface to it would breach the ceiling, which
 * is a measured reason rather than a stylistic one.
 *
 * THE MAPPING IS THE HAZARD, AND IT IS WHERE A BUG WOULD BE SILENT. The four validators return
 * `ValidationIssue` (`{code, message, stepId?, severity}`); the pipeline refuses with `Refusal`
 * (`{stage, code, message, subject?}`). Something has to map one to the other, and a mapper that
 * drops an issue drops a validation ERROR — worse than a crash, because the blueprint then
 * composes cleanly while the thing the check existed for is unrecorded.
 *
 * So: `refusesComposition` is TOTAL over `Severity`, with an `assertNever` default. Every issue
 * lands in exactly one of `refusals` or `advisories`, nothing is filtered away, and a third
 * severity added upstream becomes a compile error here rather than a silent drop.
 *
 * Measured while writing this: all four validators currently emit `severity: 'error'` and nothing
 * else. A test asserting "a warning does not refuse" would therefore be VACUOUS against pipeline
 * output, so the test for that branch constructs a `warning` issue DIRECTLY. That is standing
 * rule 10, and this task is where it would have been easy to ship the opposite.
 *
 * FAILURE PATH. Pure and synchronous; nothing here does I/O, so there is nothing to time out or
 * retry — the retry budget belongs to `generateBlueprint`, which owns the staged loop. A
 * validator that throws is NOT caught: an exception from a check is a contract violation of that
 * check, and swallowing it would report a clean composition built on an unrun validator.
 */
import { Severity, ValidationIssue } from '../../factory/factoryValidate';
import {
  BlueprintDraft,
  BlueprintGenerationInput,
  GenerationStage,
  Refusal,
  generateBlueprint,
} from './blueprintGeneration';
import { ControlPolicy, validateControlSpec } from './controlSpecification';
import { SelectedDesign, SelectionInput, selectDesign } from './designSelection';
import { HeadlessAcceptance, TaskSurfaceBinding } from './workspaceBindingTypes';
import { validateTaskSurfaces } from './workspaceMapping';
import { WorkspaceStateDeclaration, validateWorkspaceStates } from './workspaceStateChecks';

/** Structured JSON to stdout, per CLAUDE.md's Observability Framework. */
function log(fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'backend',
    ...fields,
  }));
}

export interface BlueprintCompositionInput extends BlueprintGenerationInput {
  /** Task-to-surface bindings, or explicit headless markers. Checked by `validateTaskSurfaces`. */
  bindings: ReadonlyArray<TaskSurfaceBinding>;
  /** Required when a task is bound headless. `null` means none was recorded, not "fine". */
  headlessAcceptance?: HeadlessAcceptance | null;
  workspaceStates: ReadonlyArray<WorkspaceStateDeclaration>;
  policies: ReadonlyArray<ControlPolicy>;
  /** Roles a policy may name. Empty means every named role is unknown, which is a refusal. */
  roleIds?: ReadonlySet<string>;
  /** `null` when no design has been selected yet, which refuses at the `design` stage. */
  design: SelectionInput | null;
  /**
   * Minted at the entry point and threaded through every log line. `manifestWriter` records the
   * absence of one as a deviation; this module takes it as an input instead, because its only
   * caller is an HTTP route that has one.
   */
  correlationId?: string | null;
}

export interface ComposedBlueprint {
  /** `null` when generation itself refused: there is nothing to check the surfaces of. */
  draft: BlueprintDraft | null;
  selectedDesign: SelectedDesign | null;
  /** Everything that blocks. Ordered by stage, generation's own refusals first. */
  refusals: ReadonlyArray<Refusal>;
  /**
   * Issues that do NOT block, carried rather than filtered. An issue the mapper discarded would
   * be a validation result nobody can see, so every issue lands in exactly one of the two lists.
   */
  advisories: ReadonlyArray<Refusal>;
}

/**
 * Does an issue of this severity BLOCK composition?
 *
 * Total over `Severity` on purpose. The `default` is unreachable today and exists so that adding
 * a third severity upstream is a compile error here instead of an issue silently treated as
 * advisory. `assertNever` is the mechanism: `never` accepts nothing, so a widened union fails to
 * assign.
 */
export function refusesComposition(severity: Severity): boolean {
  switch (severity) {
    case 'error':
      return true;
    case 'warning':
      return false;
    default: {
      const unreachable: never = severity;
      throw new Error(`unhandled ValidationIssue severity: ${String(unreachable)}`);
    }
  }
}

/**
 * `ValidationIssue` -> `Refusal`, carrying the stage the check belongs to.
 *
 * `stepId` becomes `subject` because that is what the field means on a refusal: the thing the
 * reader has to go and look at. Dropping it would leave a reviewer with a code and no referent.
 */
export function asRefusal(stage: GenerationStage, issue: ValidationIssue): Refusal {
  return {
    stage,
    code: issue.code,
    message: issue.message,
    ...(issue.stepId === undefined ? {} : { subject: issue.stepId }),
  };
}

/** One check: its stage, and the issues it produced. */
interface StageResult {
  stage: GenerationStage;
  issues: ReadonlyArray<ValidationIssue>;
}

/**
 * Split every issue into the list that blocks and the list that does not.
 *
 * EXPORTED, and that is the point rather than a convenience. Inlined in `composeBlueprint`, the
 * advisory branch was unreachable from any test: all four validators emit `severity: 'error'`
 * today, so deleting the advisory push entirely left the whole suite green. A mutation proved it.
 * The branch is real — a validator that starts warning would hit it — so the fix is to make it
 * drivable, not to note the gap and move on.
 *
 * Nothing is filtered here. Every issue lands in exactly one list, because an issue the mapper
 * discarded is a validation result nobody can see.
 */
export function partitionIssues(
  results: ReadonlyArray<StageResult>,
): { refusals: Refusal[]; advisories: Refusal[] } {
  const refusals: Refusal[] = [];
  const advisories: Refusal[] = [];
  for (const { stage, issues } of results) {
    for (const issue of issues) {
      (refusesComposition(issue.severity) ? refusals : advisories).push(asRefusal(stage, issue));
    }
  }
  return { refusals, advisories };
}

/**
 * Run the four checks, and return the design selection ALONGSIDE them.
 *
 * ONE `selectDesign` call, not two. An earlier version called it here for the issues and
 * again below for the selected design, which left a second expression that could be
 * hardcoded to `null` with every test still green — a verifier did exactly that and it
 * survived. Returning both halves of one call removes the operand rather than asserting
 * around it: there is no longer a second place for the answer to come from.
 */
function surfaceChecks(input: BlueprintCompositionInput): {
  results: StageResult[];
  selected: SelectedDesign | null;
} {
  const design = input.design;
  const chosen = design === null ? null : selectDesign(design);
  const results: StageResult[] = [
    {
      stage: 'workspaces',
      issues: validateTaskSurfaces(
        input.project,
        input.bindings,
        input.headlessAcceptance ?? null,
      ),
    },
    {
      stage: 'workspace_states',
      issues: validateWorkspaceStates(input.bindings, input.workspaceStates),
    },
    {
      stage: 'controls',
      issues: validateControlSpec(input.policies, input.roleIds ?? new Set()),
    },
    {
      stage: 'design',
      issues: chosen === null
        // Not an empty list. A missing selection is a refusal, because every downstream
        // approval binds to a design and LC-10 cannot be satisfied without one.
        ? [{
          code: 'DESIGN_NOT_SELECTED',
          message: 'No design alternative has been selected, so there is nothing to approve.',
          severity: 'error' as Severity,
        }]
        : chosen.issues,
    },
  ];
  return { results, selected: chosen === null ? null : chosen.selected };
}

export function composeBlueprint(input: BlueprintCompositionInput): ComposedBlueprint {
  const correlationId = input.correlationId ?? null;
  const draft = generateBlueprint(input);

  // GENERATION FIRST, AND ITS REFUSALS ARE NOT FATAL TO THE SWEEP. Running the surface checks
  // anyway is deliberate: a reviewer fixing a blueprint wants every blocker at once, not the
  // first stage's worth and then another round trip. The draft is still reported as refused.
  const checks = surfaceChecks(input);
  const split = partitionIssues(checks.results);
  const refusals: ReadonlyArray<Refusal> = [...draft.refusals, ...split.refusals];
  const advisories: ReadonlyArray<Refusal> = split.advisories;

  const selected = checks.selected;

  log({
    level: refusals.length === 0 ? 'info' : 'warn',
    event: 'blueprint_composed',
    correlation_id: correlationId,
    outcome: refusals.length === 0 ? 'success' : 'failure',
    ...(refusals.length === 0 ? {} : { error_class: 'BlueprintCompositionRefused' }),
    refusal_count: refusals.length,
    advisory_count: advisories.length,
    stages_refused: [...new Set(refusals.map((r) => r.stage))],
    design_selected: selected !== null,
  });

  return {
    draft: draft.refusals.length === 0 ? draft : null,
    selectedDesign: selected,
    refusals,
    advisories,
  };
}
