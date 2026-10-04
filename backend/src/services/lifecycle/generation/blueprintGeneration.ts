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
  idsByLocator,
  type HandoffResult,
} from './sourceHandoff';
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
  priorIds?: ReadonlyMap<string, string>;
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
  idsByLocator: Map<string, string>;
  attempt: number;
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
    idsByLocator: new Map<string, string>(),
    attempt: 1,
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
  const ids = idsByLocator(handoff);
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

    if (candidate.ok) return candidate;
    if (candidate.refusals.length < best.refusals.length) best = candidate;
    else best.attempt = attempt;  // kept the better draft; record that the attempt happened
  }
  return best;
}

/** Work tasks with no corroborated allocation. Surfaced so a caller need not re-derive it. */
export function unresolvedAllocation(input: BlueprintGenerationInput): number {
  return unknownAllocationCount(input.project, input.allocation);
}
