/**
 * The corpus stage vocabulary, and nothing else.
 *
 * Split out of `corpusRunner.ts` because that file reached **13 exported symbols** against the
 * hard ceiling of 12 in `CLAUDE.md`'s Modular Composition Rule, whose instruction is explicit:
 * "When a file or function exceeds the hard ceiling, the next change to it MUST split it before
 * adding new code." Attempt 2 added four stage constants and crossed the line; this is that split.
 * Calibrated with the repo's own count — `blueprintGeneration.ts` sits at 11, which is the figure
 * `blueprintComposition.ts` cites as binding.
 *
 * It is also the better seam. Every symbol here answers "which stages exist and who owns them",
 * which is a different question from "how far did this fixture get".
 *
 * ## Nothing here is retyped
 *
 * The three generation slices are derived from `GENERATION_STAGES` and the database-backed names
 * are real members of `LIFECYCLE_STAGES`. That matters because attempt 1 of P7-T1.1 appended
 * `'approval'`, `'planning'` and `'verification'` — a THIRD stage vocabulary, two of whose three
 * strings exist nowhere in the system, and nothing caught it because nothing compared the names
 * against the system's own. `corpusRunner.test.ts` now does, at runtime.
 */
import { GENERATION_STAGES, type GenerationStage } from '../../generation/blueprintGeneration';
import { type LifecycleStage } from '../../lifecycleStages';

export type CorpusStage = GenerationStage | LifecycleStage;

/**
 * The generation stages that SHORT-CIRCUIT, in execution order.
 *
 * Sliced, never retyped. Measured: `generateBlueprintOnce` returns a `stage` of only `handoff`,
 * `process`, `allocation`, `agents`, `effort` (and `complete` on success) — enumerated with
 * `sed -n '147,300p' blueprintGeneration.ts | grep -oE "stage: '[a-z_]+'" | sort -u`.
 */
export const SHORT_CIRCUIT_STAGES: ReadonlyArray<GenerationStage> =
  GENERATION_STAGES.slice(0, GENERATION_STAGES.indexOf('effort') + 1);

/**
 * The surface checks, which run whatever generation did.
 *
 * Also sliced. `GENERATION_STAGES`' own comment records why these four live in the generation
 * vocabulary at all: P5-T1.4 added them "for the four checks the generation input could not
 * reach", deliberately in the one stage list rather than a private one inside
 * `blueprintComposition.ts`.
 */
export const SURFACE_CHECK_STAGES: ReadonlyArray<GenerationStage> = GENERATION_STAGES.slice(
  GENERATION_STAGES.indexOf('workspaces'),
  GENERATION_STAGES.indexOf('design') + 1,
);

/** Generation's terminal success marker. Reached only when no generation stage refused. */
export const TERMINAL_STAGE: GenerationStage = 'complete';

/**
 * The stages that need a database, named from the REAL lifecycle vocabulary.
 *
 * The plan's prose names the journey as "approval → planning → verification";
 * `LIFECYCLE_STAGES` names the actual stages. The mapping, stated rather than assumed:
 *
 * | The plan's word | The real stage(s)                                   |
 * |-----------------|-----------------------------------------------------|
 * | approval        | `awaiting_blueprint_approval`, `blueprint_approved` |
 * | planning        | `planning`, `plan_ready`                            |
 * | verification    | `release_review`                                    |
 *
 * `LifecycleStage` would make a misspelling a compile error — except **nothing typechecks this
 * file**: `backend/tsconfig.json` excludes every `__tests__` directory and ts-jest transpiles
 * with `isolatedModules`. Measured, not assumed:
 * `node ../node_modules/typescript/bin/tsc --noEmit --listFilesOnly | grep -ci "lifecycle/__tests__"`
 * returns **0**. So the annotation documents intent and `corpusRunner.test.ts` asserts membership
 * in `LIFECYCLE_STAGES` at RUNTIME, which is the control that actually fires.
 */
export const DB_BACKED_STAGES: ReadonlyArray<LifecycleStage> = [
  'awaiting_blueprint_approval',
  'blueprint_approved',
  'planning',
  'plan_ready',
  'release_review',
];

/** Every stage a corpus case can be driven through. */
export const CORPUS_STAGES: ReadonlyArray<CorpusStage> = [
  ...GENERATION_STAGES,
  ...DB_BACKED_STAGES,
];
