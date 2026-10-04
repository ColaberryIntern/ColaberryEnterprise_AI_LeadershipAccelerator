/**
 * P3-T6 — the orchestration T1-T5 were built for, and the obligations their verifiers recorded.
 *
 * Five stages, each gating the next: handoff (T1), process validation (T2), allocation (T3), agent
 * scoping (T4), effort measures (T5). A failure at any stage leaves a **recoverable draft** with
 * the reason attached and **does not advance the stage** — asserted on the returned state, not on a
 * log line.
 *
 * NO MODEL CALL HAPPENS HERE. The model's output arrives as input. That is what makes the fixtures
 * deterministic and the suite runnable in CI with no network, and it mirrors how
 * `lifecycleExecution` takes an injected store and clock rather than reaching for the real ones.
 * A live-generation evaluation is a separate, authorised exercise.
 *
 * REPAIR IS BOUNDED, TARGETED AND MONOTONE, mirroring `planRepair`'s discipline rather than
 * inventing a third mechanism — *"targeted, not a re-roll"*, merged by id so the good parts
 * survive, capped at `MAX_REPAIR_ATTEMPTS = 3` per CLAUDE.md's Stall Detection, and failing closed
 * with the violations recorded. `gateAndRepair` itself is **not** reused: it operates on a
 * `BuildPlan` and gates against `sourceText` via `gatePlan`, so it cannot take a blueprint. The
 * plan said to reuse the function; the honest reuse is of the pattern and the cap.
 *
 * FOUR OBLIGATIONS FROM THE T1-T5 VERIFIERS, each discharged here and each asserted:
 *   1. ID stability on replay — a second run over an unchanged understanding must not read as
 *      "30 lost and 30 invented".
 *   2. The auto-rationale must not self-certify — this orchestrator never calls `deriveAllocation`
 *      to fill a gap, because a derived rationale satisfies `ALLOCATION_RATIONALE` by construction.
 *   3. The capability declaration must not come from the same model turn as the roster.
 *   4. `belowTarget` is a tri-state and is read as `!== true`, never as falsy.
 */

import {
  buildSourceHandoff,
  itemsByLocator,
  type HandoffResult,
} from './sourceHandoff';
import type { SourceItem } from '../sourceIdentity';
import { validateProcess, type ReworkBounds } from './processValidation';
import { validateAllocation, unknownAllocationCount } from './allocation';
import { validateAgentScoping, type ScopedAgent } from './agentScoping';
import type { CapabilityDeclaration } from './capabilityRegistry';
import {
  measureAutomation,
  checkTargetDisclosure,
  type AutomationMeasure,
  type EffortAssessment,
  type TargetAcceptance,
} from './effortMeasures';
import type { ValidationIssue } from '../../factory/factoryValidate';
import type { FactoryProject, AllocationRow } from '../../factory/contracts/factoryContract';
import type { UnderstandingItem } from '../../delivery/projectUnderstanding';
import type { ManifestRefs } from '../adapters/manifestRefs';

/** Matches `planRepair.MAX_REPAIR_ATTEMPTS` and CLAUDE.md's Stall Detection. */
export const MAX_GENERATION_ATTEMPTS = 3;

export const GENERATION_STAGES = [
  'handoff',
  'process',
  'allocation',
  'agents',
  'effort',
  'complete',
] as const;
export type GenerationStage = (typeof GENERATION_STAGES)[number];

/**
 * Where a capability declaration came from.
 *
 * `model_turn` is refused as a gating declaration. `CAPABILITY_UNDECLARED` and
 * `CAPABILITY_LABEL_UNDECLARED` check a roster against a declaration, so a generator emitting
 * **both** can declare whatever it invents — the check has force only if the declaration was
 * authored earlier by a different actor. The P3-T4 verifier made exactly this point.
 */
export type DeclarationOrigin = 'approved_blueprint' | 'model_turn';

export interface DeclarationSource {
  declaration: CapabilityDeclaration;
  origin: DeclarationOrigin;
}

export interface BlueprintGenerationInput {
  understanding: ReadonlyArray<UnderstandingItem>;
  project: FactoryProject;
  /** Stated by the model. Never derived here — see obligation 2 in the header. */
  allocation: ReadonlyArray<AllocationRow>;
  agents: ReadonlyArray<ScopedAgent>;
  effort: ReadonlyArray<EffortAssessment>;
  declaration: DeclarationSource;
  reworkBounds?: ReworkBounds;
  /** `(locator -> id)` from a previous run. Absent on a first run. */
  priorIds?: ReadonlyMap<string, SourceItem>;
  targetAcceptance?: TargetAcceptance | null;
  refs?: ManifestRefs;
}

export interface Refusal {
  stage: GenerationStage;
  code: string;
  message: string;
  subject?: string;
}

export interface BlueprintDraft {
  ok: boolean;
  /** The stage reached. On failure this is the stage that refused, NOT the next one. */
  stage: GenerationStage;
  /** False whenever anything refused. The stage does not advance on a failure. */
  advanced: boolean;
  refusals: Refusal[];
  /** Always returned, even on refusal: the draft is recoverable, not discarded. */
  handoff: HandoffResult | null;
  measures: AutomationMeasure | null;
  /** Feed into the next run's `priorIds` so a replay is identity-stable. */
  idsByLocator: Map<string, SourceItem>;
  /**
   * ATTEMPTS MADE, which is not the same as the attempt that produced this draft.
   *
   * The P3-T6 verifier found these had been conflated: on a repair that regressed, the kept
   * draft was produced on attempt 1 and returned carrying `attempt: 3`. Both numbers are
   * worth having and only one field existed, so `producedOnAttempt` now carries the other.
   * Acceptance item 2's word is "attributable", and a single ambiguous number is not.
   */
  attempt: number;
  /** The attempt whose output this draft actually is. Equals `attempt` on a clean run. */
  producedOnAttempt: number;
}

const toRefusals = (stage: GenerationStage, issues: ReadonlyArray<ValidationIssue>): Refusal[] =>
  issues.map((i) => ({ stage, code: i.code, message: i.message, subject: i.stepId }));

/**
 * Run one generation attempt.
 *
 * Stops at the first stage that refuses. That is deliberate: a process graph that fails validation
 * makes every downstream number meaningless, and reporting allocation problems computed over an
 * incoherent graph wastes a reviewer's attention on symptoms. Within a stage, every issue is
 * reported.
 */
export function generateBlueprintOnce(input: BlueprintGenerationInput): BlueprintDraft {
  const refusals: Refusal[] = [];
  const base = {
    handoff: null as HandoffResult | null,
    measures: null as AutomationMeasure | null,
    idsByLocator: new Map<string, SourceItem>(),
    attempt: 1,
    producedOnAttempt: 1,
  };

  // Obligation 3: a declaration produced alongside the roster cannot gate it.
  if (input.declaration.origin !== 'approved_blueprint') {
    return {
      ...base,
      ok: false,
      stage: 'agents',
      advanced: false,
      refusals: [{
        stage: 'agents',
        code: 'DECLARATION_SELF_SUPPLIED',
        message: 'the capability declaration came from the same model turn as the roster, so it '
          + 'cannot gate it: a generator emitting both can declare whatever it invents. Pass the '
          + 'declaration through from the approved blueprint.',
      }],
    };
  }

  // ── handoff (T1) ────────────────────────────────────────────────────────────
  const handoff = buildSourceHandoff(input.understanding, input.priorIds ?? new Map());
  const ids = itemsByLocator(handoff);
  if (handoff.overflow) {
    return {
      ...base,
      handoff,
      idsByLocator: ids,
      ok: false,
      stage: 'handoff',
      advanced: false,
      refusals: [{
        stage: 'handoff',
        code: 'HANDOFF_OVERFLOW',
        message: handoff.refusedReason ?? 'the handoff refused',
      }],
    };
  }

  // ── process graph (T2) ──────────────────────────────────────────────────────
  const process = validateProcess(input.project, input.reworkBounds ?? {})
    .filter((i) => i.severity === 'error');
  if (process.length) {
    return {
      ...base, handoff, idsByLocator: ids, ok: false, stage: 'process', advanced: false,
      refusals: toRefusals('process', process),
    };
  }

  // ── allocation (T3) ─────────────────────────────────────────────────────────
  //
  // Obligation 2: `deriveAllocation` is deliberately NOT called to fill gaps. It emits
  // `rationale: "derived from the … PERFORMER assignment"`, which satisfies ALLOCATION_RATIONALE by
  // construction — so auto-filling would make "all human is a recorded decision" certify itself,
  // every task carrying a rationale and none carrying a reason. An absent allocation stays absent
  // and is counted as unknown.
  const allocation = validateAllocation(input.project, input.allocation)
    .filter((i) => i.severity === 'error');
  if (allocation.length) {
    return {
      ...base, handoff, idsByLocator: ids, ok: false, stage: 'allocation', advanced: false,
      refusals: toRefusals('allocation', allocation),
    };
  }

  // ── agents (T4) ─────────────────────────────────────────────────────────────
  const scoping = validateAgentScoping(
    input.agents.flatMap((a) => [...a.owns]),
    input.agents,
    input.declaration.declaration,
    input.refs,
  );
  if (!scoping.ok) {
    refusals.push(
      ...scoping.scoping.map((v) => ({ stage: 'agents' as const, code: v.code, message: v.message, subject: v.subject })),
      ...scoping.capability.map((v) => ({ stage: 'agents' as const, code: v.code, message: v.message, subject: v.agentId })),
    );
    return { ...base, handoff, idsByLocator: ids, ok: false, stage: 'agents', advanced: false, refusals };
  }

  // ── reconciliation ──────────────────────────────────────────────────────────
  //
  // THE STAGES SHARED AN INPUT BUNDLE AND WERE NEVER RECONCILED, which the P3-T6 verifier
  // demonstrated: removing one of two effort assessments produced `coverage {assessed: 1,
  // total: 1}`, `ok: true`, no refusals. A work task simply left out of the effort list read as
  // 100% coverage, because T5 can only measure what it is handed and has no view of the project.
  //
  // That made this a sequence of five calls rather than a pipeline. The reconciliation is what
  // makes it one: the effort list must account for every work task the process graph declares.
  const workTaskIds = input.project.tasks
    .filter((t) => t.kind === 'TASK' || t.kind === 'DECISION')
    .map((t) => t.id);
  const assessed = new Set(input.effort.map((e) => e.taskId));
  const unaccounted = workTaskIds.filter((id) => !assessed.has(id));
  // THE MIRROR OF THE LINE ABOVE, and the direction that inflates the headline number.
  //
  // Measured by the attempt-2 verifier: a single effort row for a task that exists NOWHERE in
  // the project took the manual-only fixture from a measured 0% AI share to 97.9%, reported
  // coverage as 3/3, and flipped `belowTarget` from true to false - clearing the below-target
  // disclosure entirely. One fabricated row turned a deliberately-manual blueprint into an
  // almost-fully-automated one that passed every gate.
  //
  // And a row whose class disagrees with its allocation row let the AI share be computed from
  // a classification the allocation gate - where SENSITIVITY_AUTONOMY lives - never approved.
  const declaredWork = new Set(workTaskIds);
  const allocByTask = new Map(input.allocation.map((r) => [r.task_id, r]));
  const effortProblems: Refusal[] = [];
  for (const e of input.effort) {
    if (!declaredWork.has(e.taskId)) {
      effortProblems.push({
        stage: 'effort',
        code: 'EFFORT_TASK_UNKNOWN',
        subject: e.taskId,
        message: `effort is assessed for task ${e.taskId}, which the process graph does not `
          + 'declare. Minutes attributed to a task that does not exist land in the denominator '
          + 'and the numerator both, so they move every share while assessing nothing.',
      });
      continue;
    }
    const row = allocByTask.get(e.taskId);
    if (row && row.execution_class !== e.executionClass) {
      effortProblems.push({
        stage: 'effort',
        code: 'EFFORT_CLASS_DISAGREES',
        subject: e.taskId,
        message: `task ${e.taskId} is allocated '${row.execution_class}' but its effort is `
          + `assessed as '${e.executionClass}'. The AI share would be computed from a `
          + 'classification the allocation gate never approved.',
      });
    }
  }
  if (effortProblems.length) {
    return {
      ...base, handoff, idsByLocator: ids, ok: false, stage: 'effort', advanced: false,
      refusals: effortProblems,
    };
  }

  if (unaccounted.length) {
    return {
      ...base, handoff, idsByLocator: ids, ok: false, stage: 'effort', advanced: false,
      refusals: unaccounted.map((id) => ({
        stage: 'effort' as const,
        code: 'EFFORT_TASK_UNACCOUNTED',
        subject: id,
        message: `task ${id} is in the process graph but absent from the effort list, so it would `
          + 'be invisible to the coverage denominator. Omitting a task is not the same as assessing '
          + 'it and finding nothing: the first inflates every share, the second lowers coverage.',
      })),
    };
  }

  // ── effort (T5) ─────────────────────────────────────────────────────────────
  const measures = measureAutomation(input.effort);
  // Obligation 4: `!== true`, never falsy. `null` means unmeasurable, not "target met".
  const disclosure = checkTargetDisclosure(measures, input.targetAcceptance ?? null);
  const effortRefusals: Refusal[] = [
    ...measures.issues.map((i) => ({ stage: 'effort' as const, code: i.code, message: i.message, subject: i.subject })),
    ...disclosure.map((i) => ({ stage: 'effort' as const, code: i.code, message: i.message, subject: i.subject })),
  ];
  if (effortRefusals.length) {
    return {
      ...base, handoff, measures, idsByLocator: ids,
      ok: false, stage: 'effort', advanced: false, refusals: effortRefusals,
    };
  }

  return {
    ...base, handoff, measures, idsByLocator: ids,
    ok: true, stage: 'complete', advanced: true, refusals: [],
  };
}

/**
 * Run with bounded, monotone repair.
 *
 * `repair` is supplied by the caller — the orchestrator never calls a model itself. Monotone:
 * an attempt is kept only if it strictly reduces the refusal count, mirroring `planRepair`'s rule
 * that a candidate must improve on the best so far. An unrepairable draft fails closed with its
 * refusals recorded, because shipping a blueprint with a known gap is what this exists to prevent.
 */
export function generateBlueprint(
  input: BlueprintGenerationInput,
  repair?: (draft: BlueprintDraft, attempt: number) => BlueprintGenerationInput | null,
): BlueprintDraft {
  let best = generateBlueprintOnce(input);
  if (best.ok || !repair) return best;

  for (let attempt = 2; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const revised = repair(best, attempt);
    if (!revised) break;

    // Identity must survive a repair too, or the integrity check fires on a successful fix.
    const candidate = generateBlueprintOnce({ ...revised, priorIds: best.idsByLocator });
    candidate.attempt = attempt;
    candidate.producedOnAttempt = attempt;

    if (candidate.ok) return candidate;
    if (candidate.refusals.length < best.refusals.length) best = candidate;
    // Kept the better (earlier) draft. `attempt` records that the work happened;
    // `producedOnAttempt` keeps pointing at the run this draft actually came from.
    else best.attempt = attempt;
  }
  return best;
}

/** Work tasks with no corroborated allocation. Surfaced so a caller need not re-derive it. */
export function unresolvedAllocation(input: BlueprintGenerationInput): number {
  return unknownAllocationCount(input.project, input.allocation);
}
