/**
 * The Phase 7 corpus runner. NOT a test: it holds no `it` and asserts nothing.
 *
 * P7-T1.1. Takes a fixture descriptor, drives it through the lifecycle stages, and returns what
 * it ACTUALLY drove alongside the traceability report.
 *
 * ## The one property that makes this trustworthy
 *
 * **Every stage lands in exactly one of two lists, and the runner cannot return without placing
 * it.** `outcomes` carries one entry per stage in `CORPUS_STAGES`; `stagesDriven` and
 * `stagesNotReached` are derived views of that single list, and a not-reached entry REQUIRES a
 * reason.
 *
 * That is deliberate structure rather than diligence. The defect it rules out has already
 * happened in this programme: `applyMeasurements` once iterated a measurement map that was
 * EMPTY, so the only test for the loop never executed its body and **deleting the entire loop
 * left 850 of 850 tests green.** A verifier found it. A corpus runner that quietly skipped a
 * stage it could not reach would be the same defect wearing a bigger coat — the suite would
 * report a pass over a journey that never happened.
 *
 * ## ATTEMPT 1 SHIPPED THAT EXACT DEFECT, AND THIS IS THE CORRECTION
 *
 * The partition above was real, and it was not enough, because `driven` was a CONSTANT. One
 * boolean — `compositionError === null` — was fanned across all ten composed stages. The
 * verifier probed it with `declaration.origin: 'model_turn'`, which refuses at `agents` before
 * the handoff has run, and the runner still reported `effort`, `design` and `complete` as
 * driven, with `partitionIsTotal` returning **true**. Three mutants — deleting the coverage
 * rule, nulling `composed`, emptying `effortBases` — all stayed green at 12 of 12.
 *
 * So the partition was total over a vocabulary while being false about every member of it. The
 * correction is to derive each stage's outcome from the composition result rather than to
 * assert around a constant.
 *
 * ## How `driven` is now MEASURED, per stage
 *
 * The pipeline has two halves with genuinely different rules, which is why one boolean could
 * not express either. Both halves are read off `blueprintComposition.ts`:
 *
 * 1. **Generation** (`handoff` → `effort`) SHORT-CIRCUITS. `generateBlueprintOnce` returns early
 *    at the first refusing stage, so stages after it never execute. The refusing stage is named
 *    in `refusals[].stage`.
 * 2. **The surface checks** (`workspaces`, `workspace_states`, `controls`, `design`) run
 *    UNCONDITIONALLY. `composeBlueprint` says so in its own comment — "GENERATION FIRST, AND ITS
 *    REFUSALS ARE NOT FATAL TO THE SWEEP" — and `surfaceChecks` builds a `StageResult` for all
 *    four whatever generation did. A reviewer fixing a blueprint gets every blocker at once.
 *
 * So a generation stage refusing does NOT make `design` unreached, and reporting it that way
 * would be a second false claim in the opposite direction. The verifier's probe is itself the
 * evidence: its output carried refusals at `workspaces` AND `design` while generation had
 * stopped at `agents`. Those checks ran.
 *
 * ## Why `refusals[].stage` and not `draft.stage`
 *
 * `draft.stage` is the better-documented signal — "on failure this is the stage that refused,
 * NOT the next one" — but it is UNREADABLE in exactly the cases that matter:
 * `composeBlueprint` returns `draft: draft.refusals.length === 0 ? draft : null`. The draft is
 * nulled on any refusal, so every short-circuit case arrives with `draft === null`.
 * `refusals[].stage` survives, carries the same fact, and is what the composition result
 * actually hands a caller.
 *
 * ## What it drives today, and what it does not
 *
 * `composeBlueprint` already orchestrates the generation half, so this runner calls it rather
 * than re-implementing the pipeline — a second orchestrator would be a second place for the
 * stage vocabulary to drift, which is the duplicate-truth failure this phase has corrected
 * twice already.
 *
 * The five `DB_BACKED_STAGES` are reported NOT REACHED with the reason naming the two functions
 * that genuinely need a database. P7-T1.2 supplies them.
 */
import {
  composeBlueprint,
  type BlueprintCompositionInput,
  type ComposedBlueprint,
} from '../../generation/blueprintComposition';
import { GENERATION_STAGES, type GenerationStage } from '../../generation/blueprintGeneration';
import {
  CORPUS_STAGES,
  DB_BACKED_STAGES,
  SHORT_CIRCUIT_STAGES,
  SURFACE_CHECK_STAGES,
  TERMINAL_STAGE,
  type CorpusStage,
} from './corpusStages';
import { factoryValidate } from '../../../factory/factoryValidate';
import type { FactoryProject } from '../../../factory/contracts/factoryContract';

/**
 * The fields a fixture must supply, taken by indexed access from the real input type.
 *
 * `Pick` rather than a hand-written interface, so the field list cannot drift from
 * `BlueprintCompositionInput`'s. Attempt 1 claimed a missing field "becomes a compile error
 * here"; that claim was INERT for the reason given on `DB_BACKED_STAGES` — nothing typechecks
 * this file. Measured:
 * `node ../node_modules/typescript/bin/tsc --noEmit --listFilesOnly | grep -ci "lifecycle/__tests__"`
 * returned **0**. The `Pick` is still right, because it keeps one definition instead of two; it
 * is simply not a gate.
 */
export type FixtureFields = Pick<
  BlueprintCompositionInput,
  'understanding' | 'project' | 'allocation' | 'agents' | 'effort' | 'declaration' | 'targetAcceptance'
>;

export interface CorpusFixture {
  /** `A`, `B`, `C`, `D`, or a variant id like `B-multi-role`. */
  id: string;
  /** What this case must prove, in one line, from `reference-fixtures.md`. */
  proves: string;
  build: () => FixtureFields;
  /**
   * Overrides for the fields `composeBlueprint` needs but a fixture does not carry. A case that
   * exists to exercise workspace bindings supplies them here.
   */
  composition?: Partial<BlueprintCompositionInput>;
}

export interface StageOutcome {
  stage: CorpusStage;
  driven: boolean;
  /** REQUIRED when `driven` is false. A stage not reached for no stated reason is a defect. */
  reason?: string;
}

export interface TraceabilityReport {
  /**
   * Requirement-bearing SOURCE BLOCKS the project declares, by id. The denominator.
   *
   * Not the `understanding` items. Attempt 1 used those and matched them to task titles by
   * their first six significant words, which was crude, and worse, DEAD: it read
   * `composed.draft.tasks`, and `BlueprintDraft` HAS NO `tasks` FIELD. Its fields are `ok`,
   * `stage`, `advanced`, `refusals`, `handoff`, `measures`, `idsByLocator`, `attempt` and
   * `producedOnAttempt` — the first version of this comment said "only" and listed seven of
   * those nine, which is the kind of exhaustive claim that should not be made in passing.
   * `covered` was therefore `[]` for every input, which is why a mutant replacing the whole
   * computation with `const covered: string[] = []` changed nothing and stayed green.
   */
  requirementBlocks: string[];
  /** Blocks cited by at least one task. The denominator minus `uncovered`. */
  covered: string[];
  /**
   * Blocks no task cites, from the SHIPPED rule — `factoryValidate`'s `SOURCE_COVERAGE`,
   * documented on `FactoryTask.source_evidence` as "the SOURCE_COVERAGE anchor".
   */
  uncovered: string[];
  /**
   * `SOURCE_COVERAGE` messages whose block id would not parse. A REPORTED DIAGNOSTIC, not a
   * control — and it cannot currently be non-empty.
   *
   * The id is read out of the message because `err('SOURCE_COVERAGE', …)` is called without a
   * `stepId`, so the issue carries no subject field. An unparsed message lands here rather
   * than being swallowed, so that if the shipped message format ever changes, the run says so
   * instead of reporting an empty `uncovered`.
   *
   * WHAT IT IS NOT. An earlier version of this comment claimed it "makes a message-format
   * change loud". It does not, and a verifier proved it: deleting the push below leaves the
   * suite GREEN, because `factoryValidate` has exactly one `SOURCE_COVERAGE` call site with
   * one message format, so no real input reaches this list. The control that actually catches
   * format drift is the `covered`/`uncovered` assertions — breaking the regex turns them RED.
   * Kept because a future second call site would surface here instead of vanishing, and
   * `corpusRunner.test.ts` asserts the parse is EXHAUSTIVE over the issues the rule emits,
   * which is the strongest thing that can honestly be said about it.
   */
  unparsedCoverageIssues: string[];
  /**
   * What the customer STATED, by dimension. Recorded, NOT joined to the blocks.
   *
   * Keyed on `dimension`, measured. The first version filtered on
   * `classification === 'REQUIREMENT'` and returned ZERO, because that value does not exist: the
   * only classifications in the fixture tree are `FACT` and `DECISION`, and `req()` builds
   * `{ dimension: 'requirements', classification: 'FACT' }`. I was filtering on a vocabulary I
   * had invented.
   */
  statedRequirements: string[];
  /**
   * Requirement→story coverage: `null`, because it is NOT ASSESSABLE at generation.
   *
   * **`null`, never `[]`.** `storyTraceability.ts`'s header states the rule this follows:
   * returning `[]` "would report 'measured, no gaps' for data nobody measured, which is the gate
   * bypass `lifecycleEvidence.applyMeasurements` was rewritten to prevent." Stories do not exist
   * until the planning stage is driven, and planning is DB-backed.
   *
   * There is also no id-level path from a stated requirement to a task at this stage, measured:
   * the handoff mints locators as `` `${dimension}#${ordinal}` `` (`requirements#1`), while
   * `source_blocks[].locator` is a document locator (`'1.0'`), and the reference fixtures carry
   * `provenance` as the STRING `'source_document'`, so `provenance?.locator` is undefined.
   * Different schemes, no join.
   */
  storyCoverage: string[] | null;
  /** Why `storyCoverage` is null. Non-null exactly when `storyCoverage` is null. */
  storyCoverageReason: string | null;
}

export interface CorpusRun {
  fixtureId: string;
  /** One entry per `CORPUS_STAGES`, always. The invariant a caller asserts. */
  outcomes: StageOutcome[];
  stagesDriven: CorpusStage[];
  stagesNotReached: Array<{ stage: CorpusStage; reason: string }>;
  /** `null` when composition refused, per `ComposedBlueprint.draft`'s own contract. */
  composed: ComposedBlueprint | null;
  /** The generation stage that refused, or `null` when generation ran to `complete`. */
  generationStoppedAt: GenerationStage | null;
  traceability: TraceabilityReport;
  /** Recorded per fixture, as `reference-fixtures.md` requires. Not summarised. */
  workspaceCount: number;
  /** Every distinct effort basis the fixture declared, so `UNKNOWN` is visible. */
  effortBases: string[];
}

/**
 * The reason a `DB_BACKED_STAGES` entry is not reached.
 *
 * Attempt 1 said "needs a database", which OVERSTATED the blocker and the verifier caught it:
 * `prerequisiteGaps`, `evaluateTransition` and `storyTraceability`'s three functions are pure and
 * DB-free. Only the two named here actually need one.
 */
const DB_REASON =
  'needs a database: `approveBlueprint` writes the approval row and `publishedPlanState` reads '
  + 'the published plan. The pure parts of this half — `prerequisiteGaps`, `evaluateTransition` '
  + 'and `storyTraceability` — do NOT need one. P7-T1.2 supplies the DB-backed half; this is not '
  + 'a silent skip.';

/** The pre-check that refuses BEFORE the handoff runs, so it reaches no earlier stage. */
const PRE_HANDOFF_REFUSAL = 'DECLARATION_SELF_SUPPLIED';

/**
 * Per-stage outcomes for the two composed halves.
 *
 * This is the function attempt 1 did not have. Each stage's outcome is derived from the
 * composition result; nothing is fanned out from a single boolean.
 *
 * ## WHAT `driven` MEANS FOR THE REFUSING STAGE ITSELF
 *
 * `driven` means **the pipeline did work attributed to that stage and produced a judgement**.
 * It does NOT mean every validator named for that stage executed. The distinction only shows
 * up on the refusing stage, and it shows up three ways, all measured by the attempt-2 verifier
 * by mocking the eight stage validators and comparing real execution against this output:
 *
 * | Case                          | Reported | The named validator that did NOT run |
 * |-------------------------------|----------|--------------------------------------|
 * | `DECLARATION_SELF_SUPPLIED`   | `agents` | `validateAgentScoping`               |
 * | `EFFORT_TASK_UNACCOUNTED`     | `effort` | `measureAutomation`                  |
 * | `EFFORT_TASK_UNKNOWN`         | `effort` | `measureAutomation`                  |
 *
 * In all three the stage is reported DRIVEN, because real work ran and refused: the
 * declaration-provenance guard for `agents`, and the reconciliation loop for `effort` — and
 * the reconciliation IS effort-stage work, sitting before `measureAutomation` in the same
 * stage. The alternative, reporting the refusing stage as not-driven, would mean a refusal
 * nobody could attribute to anything.
 *
 * This is the production module's own `stage` attribution reported faithfully rather than
 * second-guessed. The verifier's other seven cases matched execution exactly, and in no case
 * is a stage AFTER a short-circuit reported driven, nor an executed stage reported not-driven.
 */
function composedOutcomes(composed: ComposedBlueprint): {
  outcomes: StageOutcome[];
  stoppedAt: GenerationStage | null;
} {
  const refusedStages = new Set(composed.refusals.map((r) => r.stage));
  // The pre-check lives at `agents` but fires before the handoff, so the stages BEFORE it never
  // ran either. Detected by its code, which is the only thing that distinguishes it: a normal
  // `agents` refusal means handoff, process and allocation all passed first.
  const preHandoff = composed.refusals.some((r) => r.code === PRE_HANDOFF_REFUSAL);

  // Generation short-circuits at the FIRST refusing stage in execution order.
  const stopIdx = SHORT_CIRCUIT_STAGES.findIndex((s) => refusedStages.has(s));
  const stoppedAt = stopIdx === -1 ? null : SHORT_CIRCUIT_STAGES[stopIdx];

  const outcomes: StageOutcome[] = [];

  SHORT_CIRCUIT_STAGES.forEach((stage, idx) => {
    if (preHandoff) {
      // Only the refusing stage produced a judgement. Everything else is genuinely unreached.
      outcomes.push(refusedStages.has(stage)
        ? { stage, driven: true }
        : {
          stage,
          driven: false,
          reason: `the ${PRE_HANDOFF_REFUSAL} pre-check refused before the handoff ran, so this `
            + 'stage never executed',
        });
      return;
    }
    if (stopIdx === -1 || idx <= stopIdx) {
      // Ran: either generation completed, or this stage is at/before the one that refused.
      outcomes.push({ stage, driven: true });
      return;
    }
    outcomes.push({
      stage,
      driven: false,
      reason: `generation stopped at '${stoppedAt}', so this stage never executed`,
    });
  });

  // The surface checks ran — `composeBlueprint` calls `surfaceChecks` unconditionally.
  for (const stage of SURFACE_CHECK_STAGES) outcomes.push({ stage, driven: true });

  outcomes.push(stoppedAt === null && !preHandoff
    ? { stage: TERMINAL_STAGE, driven: true }
    : {
      stage: TERMINAL_STAGE,
      driven: false,
      reason: `generation refused at '${stoppedAt}', so it never reached its terminal marker`,
    });

  return { outcomes, stoppedAt };
}

/** What the customer stated, in the `requirements` dimension. Recorded, not joined. */
function statedRequirementsOf(fields: FixtureFields): string[] {
  const items = fields.understanding as ReadonlyArray<{ dimension?: string; value?: string }>;
  return items
    .filter((i) => i.dimension === 'requirements')
    .map((i) => String(i.value ?? ''))
    .filter((v) => v.length > 0);
}

/** Strict on purpose: a message that does not match is reported, not dropped. */
const SOURCE_COVERAGE_MESSAGE = /^requirement block (\S+) is cited by no task$/;

/**
 * Requirement-block coverage, measured with the SHIPPED rule.
 *
 * `factoryValidate` is the instrument, not a reimplementation of it. Its `SOURCE_COVERAGE` loop
 * is the one place that decides whether a requirement block is cited, and `processValidation.ts`
 * already spreads `factoryValidate(project)` at the `process` stage — so an uncited requirement
 * block is a real refusal in the real pipeline, not a corpus-only notion.
 */
function requirementCoverage(project: FactoryProject): Pick<
  TraceabilityReport, 'requirementBlocks' | 'covered' | 'uncovered' | 'unparsedCoverageIssues'
> {
  const requirementBlocks = project.source_blocks
    .filter((b) => b.kind === 'requirement')
    .map((b) => b.id);

  const uncovered: string[] = [];
  const unparsedCoverageIssues: string[] = [];
  for (const issue of factoryValidate(project)) {
    if (issue.code !== 'SOURCE_COVERAGE') continue;
    const match = SOURCE_COVERAGE_MESSAGE.exec(issue.message);
    if (match === null) unparsedCoverageIssues.push(issue.message);
    else uncovered.push(match[1]);
  }

  const uncoveredSet = new Set(uncovered);
  return {
    requirementBlocks,
    covered: requirementBlocks.filter((id) => !uncoveredSet.has(id)),
    uncovered,
    unparsedCoverageIssues,
  };
}

/**
 * Drive one fixture as far as it can go, and report exactly how far that was.
 *
 * NEVER THROWS for a refusal. A composition that refuses is a RESULT — several corpus cases exist
 * precisely to be refused — so the refusal lands in `composed.refusals` and the stages that ran
 * still count as driven. It throws only if the apparatus itself is broken, which is a different
 * thing and must not be confusable with a case failing.
 */
export function runCorpusCase(fixture: CorpusFixture): CorpusRun {
  const fields = fixture.build();

  let composed: ComposedBlueprint | null = null;
  let compositionError: string | null = null;
  try {
    composed = composeBlueprint({
      ...fields,
      bindings: [],
      workspaceStates: [],
      policies: [],
      design: null,
      ...(fixture.composition ?? {}),
    } as BlueprintCompositionInput);
  } catch (err: unknown) {
    // The apparatus broke, not the case. Recorded as a reason on every composed stage rather
    // than swallowed, so the run reports "not reached" instead of a silent empty result.
    compositionError = `composeBlueprint threw: ${(err as { message?: string })?.message ?? String(err)}`;
  }

  const composedHalf = composed === null
    ? {
      outcomes: [...GENERATION_STAGES].map((stage) => ({
        stage,
        driven: false,
        reason: compositionError ?? 'composition did not run',
      })),
      stoppedAt: null,
    }
    : composedOutcomes(composed);

  const outcomes: StageOutcome[] = [
    ...composedHalf.outcomes,
    ...DB_BACKED_STAGES.map((stage) => ({ stage, driven: false, reason: DB_REASON })),
  ];

  const bases = (fields.effort as ReadonlyArray<{ basis?: string }> | undefined) ?? [];

  return {
    fixtureId: fixture.id,
    outcomes,
    stagesDriven: outcomes.filter((o) => o.driven).map((o) => o.stage),
    stagesNotReached: outcomes
      .filter((o) => !o.driven)
      .map((o) => ({ stage: o.stage, reason: o.reason ?? 'NO REASON RECORDED' })),
    composed,
    generationStoppedAt: composedHalf.stoppedAt,
    traceability: {
      ...requirementCoverage(fields.project as FactoryProject),
      statedRequirements: statedRequirementsOf(fields),
      storyCoverage: null,
      storyCoverageReason:
        'NOT ASSESSABLE at generation: no stories exist until the planning stage is driven, and '
        + 'planning is DB-backed. `storyTraceability.requirementsWithoutStory` is the instrument '
        + 'once P7-T1.2 drives it. Null rather than an empty list, because an empty list would '
        + 'report "measured, no gaps" for data nobody measured.',
    },
    workspaceCount: ((fixture.composition?.workspaceStates ?? []) as ReadonlyArray<unknown>).length,
    effortBases: [...new Set(bases.map((e) => String(e.basis ?? 'UNRECORDED')))].sort(),
  };
}

/**
 * The invariant every caller asserts: the outcome list is a TOTAL PARTITION of `CORPUS_STAGES`.
 *
 * Exported as a function rather than left to each test, because a test that forgot to check it
 * would be the exact hole the partition exists to close.
 *
 * NOTE what this does and does not prove. It proves every stage is ACCOUNTED FOR. It says
 * nothing about whether each `driven` flag is CORRECT — attempt 1 passed this check while
 * reporting three stages driven that never executed. The per-stage truth is asserted separately,
 * against a fixture that short-circuits.
 */
export function partitionIsTotal(run: CorpusRun): boolean {
  const accounted = new Set([
    ...run.stagesDriven,
    ...run.stagesNotReached.map((s) => s.stage),
  ]);
  return run.outcomes.length === CORPUS_STAGES.length
    && accounted.size === CORPUS_STAGES.length
    && run.stagesDriven.length + run.stagesNotReached.length === CORPUS_STAGES.length
    && run.stagesNotReached.every((s) => s.reason !== 'NO REASON RECORDED' && s.reason.length > 0);
}
