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
 * So `stagesDriven.length + stagesNotReached.length === CORPUS_STAGES.length` is an invariant a
 * caller asserts, and a stage nobody accounted for is a FAILURE rather than an absence.
 *
 * ## What it drives today, and what it does not
 *
 * `composeBlueprint` already orchestrates the generation half (`handoff` through `design`), so
 * this runner calls it rather than re-implementing the pipeline — a second orchestrator would be
 * a second place for the stage vocabulary to drift, which is the duplicate-truth failure this
 * phase has corrected twice already.
 *
 * `approval`, `planning` and `verification` need a database. They are reported as NOT REACHED
 * with that as the stated reason, which is honest and checkable. P7-T1.2 supplies them.
 */
import {
  composeBlueprint,
  type BlueprintCompositionInput,
  type ComposedBlueprint,
} from '../../generation/blueprintComposition';
import { GENERATION_STAGES } from '../../generation/blueprintGeneration';

/**
 * Every stage a corpus case can be driven through.
 *
 * The generation stages are SPREAD from `GENERATION_STAGES` rather than retyped, so this list
 * follows that vocabulary instead of drifting from it. The three appended stages are the ones
 * that live outside the generation module.
 */
export const CORPUS_STAGES = [
  ...GENERATION_STAGES,
  'approval',
  'planning',
  'verification',
] as const;

export type CorpusStage = (typeof CORPUS_STAGES)[number];

/**
 * The fields a fixture must supply, taken by indexed access from the real input type.
 *
 * `Pick` rather than a hand-written interface: a field added to `BlueprintCompositionInput` that
 * a fixture must provide becomes a compile error here, instead of a fixture silently missing it.
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
  /** Requirement-bearing understanding items, by their stated value. */
  mustHave: string[];
  /** Those that reached a task in the composed draft. */
  covered: string[];
  /** Those that did not. The list that matters. */
  uncovered: string[];
}

export interface CorpusRun {
  fixtureId: string;
  /** One entry per `CORPUS_STAGES`, always. The invariant a caller asserts. */
  outcomes: StageOutcome[];
  stagesDriven: CorpusStage[];
  stagesNotReached: Array<{ stage: CorpusStage; reason: string }>;
  /** `null` when composition refused before producing a draft. */
  composed: ComposedBlueprint | null;
  traceability: TraceabilityReport;
  /** Recorded per fixture, as `reference-fixtures.md` requires. Not summarised. */
  workspaceCount: number;
  /** Every distinct effort basis the fixture declared, so `UNKNOWN` is visible. */
  effortBases: string[];
}

/** Which stages `composeBlueprint` is responsible for. Everything else is appended above. */
const COMPOSED_STAGES: ReadonlySet<string> = new Set(GENERATION_STAGES);

/**
 * Requirement-bearing understanding items.
 *
 * Keyed on `dimension`, MEASURED rather than assumed. The first version filtered on
 * `classification === 'REQUIREMENT'` and returned ZERO, because that value does not exist:
 * the only classifications in the fixture tree are `FACT` (3 occurrences) and `DECISION` (3),
 * and `req()` builds `{ dimension: 'requirements', classification: 'FACT' }`. I was filtering
 * on a vocabulary I had invented.
 *
 * It was caught because the test asserts `mustHave.length > 0` instead of only checking the
 * partition. An empty requirement list reports "nothing uncovered", which is the shape of
 * bypass this programme keeps finding: absence read as a clean result.
 *
 * Not a keyword rule over the text, deliberately. A keyword rule would classify by vocabulary,
 * and the standing finding is that a keyword rule cannot do a semantic job.
 */
function mustHaveOf(fields: FixtureFields): string[] {
  const items = fields.understanding as ReadonlyArray<{ dimension?: string; value?: string }>;
  return items
    .filter((i) => i.dimension === 'requirements')
    .map((i) => String(i.value ?? ''))
    .filter((v) => v.length > 0);
}

/** Task titles in the composed draft, which is what a requirement has to reach. */
function taskTitles(composed: ComposedBlueprint | null): string[] {
  const draft = composed?.draft as { tasks?: ReadonlyArray<{ title?: string }> } | null | undefined;
  return (draft?.tasks ?? []).map((t) => String(t.title ?? ''));
}

/**
 * Drive one fixture as far as it can go, and report exactly how far that was.
 *
 * NEVER THROWS for a refusal. A composition that refuses is a RESULT — several corpus cases exist
 * precisely to be refused — so the refusal lands in `composed.refusals` and the stage still counts
 * as driven. It throws only if the apparatus itself is broken, which is a different thing and
 * must not be confusable with a case failing.
 */
export function runCorpusCase(fixture: CorpusFixture): CorpusRun {
  const fields = fixture.build();
  const outcomes: StageOutcome[] = [];

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

  for (const stage of CORPUS_STAGES) {
    if (COMPOSED_STAGES.has(stage)) {
      outcomes.push(compositionError === null
        ? { stage, driven: true }
        : { stage, driven: false, reason: compositionError });
      continue;
    }
    // The three stages outside the generation module. P7-T1.2 supplies them; until then the
    // reason is stated rather than the stage being omitted.
    outcomes.push({
      stage,
      driven: false,
      reason: 'needs a database; supplied by P7-T1.2, not silently skipped',
    });
  }

  const mustHave = mustHaveOf(fields);
  const titles = taskTitles(composed).join('   ').toLowerCase();
  // A requirement counts as covered when a task title carries its first six significant words.
  // Crude on purpose and stated as such: T1.2 replaces it with the real `fulfills` linkage once
  // the planning stage is driven. Recorded here so the limit is visible rather than implied.
  const covered = mustHave.filter((r) => {
    const probe = r.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
    return probe.length > 0 && probe.every((w) => titles.includes(w));
  });

  const bases = (fields.effort as ReadonlyArray<{ basis?: string }> | undefined) ?? [];

  return {
    fixtureId: fixture.id,
    outcomes,
    stagesDriven: outcomes.filter((o) => o.driven).map((o) => o.stage),
    stagesNotReached: outcomes
      .filter((o) => !o.driven)
      .map((o) => ({ stage: o.stage, reason: o.reason ?? 'NO REASON RECORDED' })),
    composed,
    traceability: {
      mustHave,
      covered,
      uncovered: mustHave.filter((r) => !covered.includes(r)),
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
