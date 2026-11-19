/**
 * The builder path: what each of the eight stages is called, who owns it, and what it produces.
 *
 * This module is the single definition both sides read. The generator writes stories from it, the
 * flow controller answers "whose turn is it" from it, and the builder's own `/capability` entry
 * point renders its prompts from it. One definition, so a builder's Claude Code and Ali's queue
 * cannot disagree about what is owed.
 *
 * ## Every stage produces an ARTIFACT, and that is not decoration
 *
 * The old ladder's measured failure was 853 tasks above R0 with zero completions and 964 story
 * bodies byte-identical to their titles. Nothing in it could tell the difference between a rung
 * somebody had worked and a rung nobody had touched, because nothing it asked for left a trace.
 *
 * So each stage here names a path. A stage is finished when the file is there and says something;
 * it is not finished when somebody believes it is. The checklist in `builderPathChecklist.ts`
 * walks these paths, and every one of them sits inside `renderDocs`'s `PATH_ALLOWLIST` roots
 * (`docs/`, `.colaberry/`, `artifacts/`, `CLAUDE.md`) so a builder's repository will actually
 * accept them.
 *
 * ## Option C: the gate size varies by rung
 *
 * Ali chose option C over a fixed number. R0 asks for one capability the agent does under watch;
 * R9 asks for five. The ladder is supposed to get harder, and a constant gate makes the last rung
 * exactly as easy as the first, which is how a ladder stops meaning anything.
 */

import { AUTONOMY_LEVELS, type AutonomyLevel } from './autonomyLadder';
import { CANDIDATE_STAGES, type CandidateStage } from './candidateStages';

/** Who has to move for the candidate to leave this stage. */
export type BuilderPathSide = 'builder' | 'owner';

export interface BuilderPathStage {
  readonly stage: CandidateStage;
  /** What the stage is called in front of a builder. Plain words, no jargon. */
  readonly title: string;
  /** One sentence: what being here actually means. */
  readonly meaning: string;
  /** Whose move it is. Exactly one side, because a stage with two owners stalls. */
  readonly owned_by: BuilderPathSide;
  /**
   * The file this stage produces, relative to the builder's own repository.
   *
   * `{slug}` is the candidate's slug, substituted when the path is rendered. It stays a literal
   * here so the list can be compared, sorted and tested without a candidate in hand.
   */
  readonly artifact_path: string;
  /** What has to be true of that file for the stage to count as done. */
  readonly artifact_is_done_when: string;
}

/**
 * The eight stages in path order, one per `CANDIDATE_STAGES` entry.
 *
 * The order here is `CANDIDATE_STAGES`'s order and the test asserts that equality rather than
 * trusting it, because two lists in two files that are supposed to match are exactly the pair that
 * drifts.
 */
export const BUILDER_STAGES: ReadonlyArray<BuilderPathStage> = Object.freeze([
  {
    stage: 'proposed',
    title: 'Pick one from the list',
    meaning: 'Four candidates are on the table. Nobody has checked yet whether the product '
      + 'already does any of them.',
    owned_by: 'builder',
    artifact_path: 'artifacts/capability/{slug}/00-chosen.md',
    artifact_is_done_when: 'It names the candidate chosen, which of the four sources it came '
      + 'from, and in one paragraph why this one before the other three.',
  },
  {
    stage: 'scope_sheet_owed',
    title: 'Write the scope sheet',
    meaning: 'The product cannot do this at all. Before anybody builds anything, write down '
      + 'what the thing is, who acts on its output, and what number would say it worked.',
    owned_by: 'builder',
    artifact_path: 'artifacts/capability/{slug}/10-scope-sheet.md',
    artifact_is_done_when: 'It answers who acts on the output, what threshold decides success, '
      + 'and what the system already records that would produce that number.',
  },
  {
    stage: 'platform_owed',
    title: 'Waiting on the platform',
    meaning: 'The app has the machinery and no screen, or it half does this. Ali owes you a '
      + 'screen or a ruling. You are not blocked on yourself.',
    owned_by: 'owner',
    artifact_path: 'artifacts/capability/{slug}/20-what-is-missing.md',
    artifact_is_done_when: 'It names the exact screen or ruling needed and the route it would '
      + 'live at, so the request is buildable rather than a complaint.',
  },
  {
    stage: 'screen_built',
    title: 'Go and use what was built',
    meaning: 'The screen exists now. Use it until it does the job, or say plainly that it does '
      + 'not. Testing it is the work, not a formality before the work.',
    owned_by: 'builder',
    artifact_path: 'artifacts/capability/{slug}/30-tested-the-screen.md',
    artifact_is_done_when: 'It records what was done in the screen, what worked, and what did '
      + 'not. A clean pass with nothing to report is a sign it was not really used.',
  },
  {
    stage: 'by_hand_pending',
    title: 'Do it by hand, in the app',
    meaning: 'The app already does this. Do it yourself first. Everything downstream is a '
      + 'judgement about work you have personally done.',
    owned_by: 'builder',
    artifact_path: 'artifacts/capability/{slug}/40-doing-it-by-hand.md',
    artifact_is_done_when: 'It records the run: what was entered, what came out, how long it '
      + 'took, and what was annoying about it.',
  },
  {
    stage: 'proven_by_hand',
    title: 'Write the tool request',
    meaning: 'You have done it by hand and you know what it costs. Now ask for the tool, with '
      + 'the evidence rather than the idea.',
    owned_by: 'builder',
    artifact_path: 'artifacts/capability/{slug}/50-tool-request.md',
    artifact_is_done_when: 'It carries the six field groups the tool request asks for, and the '
      + 'manual-today section cites the run recorded at the previous stage.',
  },
  {
    stage: 'tool_requested',
    title: 'Waiting on a decision',
    meaning: 'The request is filed and sitting with Ali. Nothing here is yours to move.',
    owned_by: 'owner',
    artifact_path: 'artifacts/capability/{slug}/60-filed.md',
    artifact_is_done_when: 'It records the change request id, so the decision can be found '
      + 'later without searching.',
  },
  {
    stage: 'agent_watched',
    title: 'The agent does it, and you watch',
    meaning: 'Approved. The agent runs it and you check the output against what you produced by '
      + 'hand. This is the rung, and only this counts toward the gate.',
    owned_by: 'builder',
    artifact_path: 'artifacts/capability/{slug}/70-watched-runs.md',
    artifact_is_done_when: 'It compares at least one agent run against the by-hand run, and '
      + 'states whether the threshold from the scope sheet was met.',
  },
]);

/**
 * OPTION C: how many capabilities the agent must do under watch before the rung is cleared.
 *
 * Non-decreasing on purpose, and never zero. The early rungs are cheap because the point there is
 * to get one thing all the way through the path rather than to accumulate volume; the late rungs
 * cost more because by then the path is familiar and the thing being proven is reliability.
 *
 * The test asserts the key set against `AUTONOMY_LEVELS` **imported from `./autonomyLadder`**.
 * There are three constants of that name in this tree — the ten-rung one here, a four-value one in
 * `workforce/agentReactivationService.ts` and another four-value one in `types/inboxCase.ts` — so
 * importing the wrong one would silently produce a four-key table that still passed a naive count.
 */
export const GATE_SIZE_BY_RUNG: Readonly<Record<AutonomyLevel, number>> = Object.freeze({
  R0: 1,
  R1: 1,
  R2: 2,
  R3: 2,
  R4: 3,
  R5: 3,
  R6: 4,
  R7: 4,
  R8: 5,
  R9: 5,
});

/** The gate size for a rung, by its bare label. */
export function gateSizeForRung(rung: AutonomyLevel): number {
  return GATE_SIZE_BY_RUNG[rung];
}

/** The stage record for a candidate stage. Total: every stage has one. */
export function stageFor(stage: CandidateStage): BuilderPathStage {
  const found = BUILDER_STAGES.find((s) => s.stage === stage);
  // Unreachable while the test comparing the two lists passes, which is the point of that test.
  if (!found) throw new Error(`BuilderPathStageMissing: ${stage}`);
  return found;
}

/** The artifact path for a candidate, with `{slug}` replaced. */
export function artifactPathFor(stage: CandidateStage, slug: string): string {
  return stageFor(stage).artifact_path.replace('{slug}', slug);
}

/** Every stage this module knows, in path order, as bare keys. */
export const BUILDER_STAGE_KEYS: ReadonlyArray<CandidateStage> =
  Object.freeze(BUILDER_STAGES.map((s) => s.stage));

/** Exported so the test can compare against the enum rather than a copy of it. */
export const CANDIDATE_STAGE_KEYS: ReadonlyArray<CandidateStage> = CANDIDATE_STAGES;
