/**
 * The stories the eight-stage path adds, and the per-rung gate stories option C requires.
 *
 * ## A separate module, because the one next door is already over the ceiling
 *
 * `agentDomainStoryTemplates.ts` is 620 lines against CLAUDE.md's 500-line ceiling at line 152.
 * Extending it would make a documented violation worse, so this extracts rather than extends.
 *
 * ## ADDITIVE, and the word means something specific here
 *
 * Ali: *"Don't delete anything they already have."* Nothing in this file removes or renames a
 * story id. The four existing ladder suffixes — `L1-BY-HAND`, `L2-IN-THE-APP`, `L3-TOOL-REQUEST`,
 * `L4-AGENT-WATCHED` — keep their ids, their titles and their bodies untouched, which is what lets
 * a verified tick survive. Kalkidan's verified `L1-BY-HAND` is the specific row this protects.
 *
 * That is also the condition `agentDomainBoardReconciler` turns into a REFUSAL rather than a
 * delete: it will not remove a row whose status is anything but `not_started`, or that carries a
 * `verified_at`. So a regression here is caught twice, once by this file's test against a
 * committed fixture of today's 558 ids, and once by the reconciler refusing to act.
 *
 * ## How the eight stages map onto story ids
 *
 * Four stages already had a story and keep it. Three gain one. One has none, deliberately.
 *
 * | Stage | Story | Why |
 * |---|---|---|
 * | `proposed` | NEW `L0-CHOOSE` | Picking from four candidates was never a task on the board |
 * | `scope_sheet_owed` | NEW `L0-SCOPE-SHEET` | The `not_built` fork had nowhere to land |
 * | `platform_owed` | NEW `L0-ASK-FOR-A-SCREEN` | The `api_only` fork Ali named as the missing piece |
 * | `screen_built` | `L2-IN-THE-APP` | Using the product with no agent involved IS this stage's work |
 * | `by_hand_pending` | `L1-BY-HAND` | Unchanged |
 * | `proven_by_hand` | `L3-TOOL-REQUEST` | What is owed once the by-hand run exists |
 * | `tool_requested` | none | A WAIT. Nothing is owed by the builder, so a task would be a lie |
 * | `agent_watched` | `L4-AGENT-WATCHED` | Unchanged |
 *
 * `tool_requested` having no story is the one entry worth arguing with, so: a board row asks
 * somebody to do something. At that stage the builder has done everything and Ali owes a decision,
 * and a row sitting in their list saying "wait" is how the old board accumulated 853 tasks above
 * R0 with zero completions. The flow controller still reports the stage with a sentence; it just
 * does not pretend to be work.
 */

import type { AgentDomain } from './agentDomainRegistry';
import type { CapabilityRecord, DomainCapabilityMatrix } from './capabilityRecord';
import {
  AUTONOMY_LEVELS,
  AUTONOMY_MEANINGS,
  AUTONOMY_NAMESPACE,
  type AutonomyLevel,
  type AutonomyStage,
} from './autonomyLadder';
import { GATE_SIZE_BY_RUNG, stageFor } from './builderPath';
import { CANDIDATE_STAGES, type CandidateStage } from './candidateStages';
import { type LadderStory, STEP_SUFFIX } from './agentDomainCapabilityLadder';

/**
 * Every stage's story id suffix, or `null` for the one stage that is a wait.
 *
 * The four reused values are READ from `STEP_SUFFIX` rather than retyped, so a rename there cannot
 * silently fork the two lists. A hardcoded copy here is exactly how the additive guarantee would
 * be broken by an edit that looked safe.
 */
export const STAGE_STORY_SUFFIX: Readonly<Record<CandidateStage, string | null>> = Object.freeze({
  proposed: 'L0-CHOOSE',
  scope_sheet_owed: 'L0-SCOPE-SHEET',
  platform_owed: 'L0-ASK-FOR-A-SCREEN',
  screen_built: STEP_SUFFIX.in_the_app,
  by_hand_pending: STEP_SUFFIX.by_hand,
  proven_by_hand: STEP_SUFFIX.tool_request,
  tool_requested: null,
  agent_watched: STEP_SUFFIX.agent_watched,
});

/** The suffixes this module introduces. Everything else was already on the board. */
export const NEW_STAGE_SUFFIXES: ReadonlyArray<string> = Object.freeze([
  'L0-CHOOSE', 'L0-SCOPE-SHEET', 'L0-ASK-FOR-A-SCREEN',
]);

/** The stage each new suffix belongs to, in path order. */
const NEW_STAGES: ReadonlyArray<CandidateStage> = Object.freeze([
  'proposed', 'scope_sheet_owed', 'platform_owed',
]);

const ORDER_RULE =
  'This step belongs to one capability and runs in its place in the path. A later step opened '
  + 'before its predecessor is finished is the thing the path exists to prevent -- say so and go '
  + 'back rather than working ahead.';

function chooseBody(d: AgentDomain, c: CapabilityRecord): string {
  return [
    `**${stageFor('proposed').title}.** ${stageFor('proposed').meaning}`,
    '',
    'You are NOT being asked what you do by hand. You do not hold this job, and a list built from '
    + 'guesses about somebody else\'s week is how the first attempt at this went wrong.',
    '',
    'Four candidates arrive from four places, and each one says where it came from: your own '
    + 'research, the person who actually holds the job, Ali, and suggestions scored against this '
    + `rung's criteria. Read all four against \`${c.capability_id}\` and pick ONE.`,
    '',
    'Then run your pick past the front door before anything else, because the answer decides which '
    + 'way the path forks. The app may already do it, may half do it, may have the machinery with '
    + 'no screen, or may not do it at all. Those are four different next steps and only one of '
    + 'them is yours to start.',
    '',
    `The four candidates are per domain, in parallel, so nobody waits on Ali to begin. Yours are on `
    + `the \`${d.domain_key}\` candidate list.`,
    '',
    ORDER_RULE,
  ].join('\n');
}

function scopeSheetBody(c: CapabilityRecord): string {
  return [
    `**${stageFor('scope_sheet_owed').title}.** ${stageFor('scope_sheet_owed').meaning}`,
    '',
    'The front door said the product cannot do this. That is the ONLY state that is a build '
    + 'request, and it is also the state where the most expensive mistake is available: arguing '
    + 'for a tool nobody can tell whether worked.',
    '',
    'So the scope sheet answers three questions before anybody writes code:',
    '',
    '1. **Who acts on the output.** A person, by name, in the people record\'s own spelling. Not a '
    + 'role, not "the team".',
    '2. **What number decides it worked.** One threshold, stated so somebody else could check it.',
    '3. **What the system already records that would produce that number.** If nothing does, the '
    + 'measurement is part of the build, not an afterthought.',
    '',
    `For \`${c.capability_id}\`. If you cannot answer the third question, say so plainly here `
    + 'rather than inventing a metric that happens to be available.',
    '',
    ORDER_RULE,
  ].join('\n');
}

function askForAScreenBody(c: CapabilityRecord): string {
  return [
    `**${stageFor('platform_owed').title}.** ${stageFor('platform_owed').meaning}`,
    '',
    'This is the fork that was missing. The app has the endpoints for this and nobody built the '
    + 'page, or it does part of the job and whether the part it does is enough is not yours to '
    + 'settle. Either way the next move belongs to Ali, and you are not blocked on yourself.',
    '',
    'What you owe is a request that is BUILDABLE, which means naming the screen and the route it '
    + 'would live at, not describing a frustration. Once it is approved Ali builds the page, you '
    + 'test it until it does the job, and only then are you doing this by hand.',
    '',
    `For \`${c.capability_id}\`. Do NOT write a scope sheet for this: a scope sheet argues that `
    + 'something should exist, and most of this already does.',
    '',
    'While you wait, start another candidate. Four run in parallel for exactly this reason.',
    '',
    ORDER_RULE,
  ].join('\n');
}

const BODY: Readonly<Record<string, (d: AgentDomain, c: CapabilityRecord) => string>> = {
  proposed: (d, c) => chooseBody(d, c),
  scope_sheet_owed: (_d, c) => scopeSheetBody(c),
  platform_owed: (_d, c) => askForAScreenBody(c),
};

const ACCEPTANCE: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  proposed: [
    'One candidate was chosen from a list of four, and the record names which of the four sources '
    + 'it came from.',
    'The choice is written down with one paragraph saying why this one before the other three.',
    'The candidate was run past the product front door and the answer is recorded as one of '
    + 'in_app, partly, api_only or not_built, with the feature it matched when it matched one.',
  ],
  scope_sheet_owed: [
    'The scope sheet names the person who will act on the output, by name rather than by role.',
    'It states one threshold that decides whether the capability worked.',
    'It names what the system already records that would produce that number, or says plainly that '
    + 'nothing does and that the measurement is part of the build.',
  ],
  platform_owed: [
    'A change request exists against this domain naming the screen or the ruling needed, and the '
    + 'route it would live at.',
    'The request does NOT argue that the capability should exist, because the product already does '
    + 'most of it.',
    'A second candidate was started while this one waits, so the builder is not idle on a decision '
    + 'that is not theirs.',
  ],
});

/**
 * The three new stories for one capability, in path order.
 *
 * Shaped as `LadderStory` so `capabilityLadderStoriesFor` can push them through the adapter it
 * already has, rather than a second adapter that could drift from the first.
 */
export function builderPathStories(
  d: AgentDomain, _m: DomainCapabilityMatrix, c: CapabilityRecord, stage: AutonomyStage,
): LadderStory[] {
  const base = `${d.domain_key}.CAP.${c.capability_id.split('.').slice(1).join('.')}`;
  return NEW_STAGES.map((s, i) => {
    const suffix = STAGE_STORY_SUFFIX[s];
    if (!suffix) throw new Error(`BuilderPathStoryMissingSuffix: ${s}`);
    return {
      step: 'by_hand' as const,
      // Negative, so these sort BEFORE the four existing steps without renumbering any of them.
      // Renumbering would change titles that already carry "1", "2", "3", "4" and that people have
      // been reading for a month.
      step_number: i - NEW_STAGES.length,
      story_id: `${base}.${suffix}`,
      title: `${c.name} · 0.${i + 1} · ${stageFor(s).title.toLowerCase()}`,
      body: BODY[s](d, c),
      acceptance: [...ACCEPTANCE[s]],
      autonomy_stage: stage,
      claude_code_prompt: '',
    };
  });
}

/** One gate story. `index` is 1-based, out of the rung's gate size. */
export interface GateStory {
  readonly story_id: string;
  readonly title: string;
  readonly body: string;
  readonly acceptance: ReadonlyArray<string>;
  readonly autonomy_stage: AutonomyStage;
  readonly rung: AutonomyLevel;
  readonly index: number;
  readonly gate_size: number;
}

/**
 * OPTION C ON THE BOARD: one story per capability the rung's gate requires.
 *
 * Ali chose option C over a fixed number, so R0 asks for one capability the agent does under watch
 * and R9 asks for five. That has to be visible and countable on the board or it is a number in a
 * constant file nobody can see. `GATE_SIZE_BY_RUNG[rung]` stories per rung, numbered, so a builder
 * can tell "two of four done" from "something is broken".
 *
 * These are SHARED FOUNDATION stories: they trace to the rung rather than to one capability,
 * because the gate is a fact about the rung and which capabilities satisfy it is the builder's
 * choice. `capability_id` is therefore null and the reason is stated, which is the shape
 * `commandCenterStory` already uses for the same situation.
 */
export function gateStories(d: AgentDomain, rung: AutonomyLevel): GateStory[] {
  const size = GATE_SIZE_BY_RUNG[rung];
  const autonomy_stage = `${AUTONOMY_NAMESPACE}${rung}` as AutonomyStage;
  return Array.from({ length: size }, (_v, k) => {
    const index = k + 1;
    return {
      story_id: `${d.domain_key}.GATE.${rung}.${index}`,
      title: `${rung} gate · ${index} of ${size} · a capability the agent does, watched`,
      body: [
        `**The gate for ${rung}.** ${AUTONOMY_MEANINGS[rung]}`,
        '',
        `This rung is cleared when **${size} capabilit${size === 1 ? 'y' : 'ies'}** in this domain `
        + 'have been through the whole path and are being done by the agent under watch. This is '
        + `number ${index} of those ${size}.`,
        '',
        'Which capabilities count is your choice, not a list handed to you. What does not count: a '
        + 'capability you have only done by hand. Doing it by hand is real progress and it is not '
        + 'this: the gate asks whether the AGENT does it, and whether somebody watched.',
        '',
        'The number rises with the rung on purpose. An early rung asks you to get one thing all the '
        + 'way through; a late one asks whether you can do it reliably.',
      ].join('\n'),
      acceptance: [
        'A capability in this domain has reached the watched stage: the agent produced the outcome '
        + 'and a named human approved the run before it took effect.',
        'Its output was compared against the by-hand run recorded earlier in the same path, and '
        + 'the differences are written down.',
        `It is not a capability already counted toward another ${rung} gate story.`,
      ],
      autonomy_stage,
      rung,
      index,
      gate_size: size,
    };
  });
}

/**
 * Every gate story for every rung, in rung order.
 *
 * NOT what the generator emits. A domain sits on one rung at a time and `planForDomain`
 * emits only that rung's gate, because emitting all ten would add 300 rows across the ten
 * boards and undo the condensation this restructure exists for. This exists so the per-rung
 * sizes can be asserted across the whole ladder without standing up ten domains at ten
 * different rungs.
 */
export function allGateStories(d: AgentDomain): GateStory[] {
  return AUTONOMY_LEVELS.flatMap((rung) => gateStories(d, rung));
}

/**
 * How many gate stories the whole ladder emits for one domain: the sum of every rung's gate size.
 *
 * Exported so the test can assert the total without re-adding the table by hand, which is how a
 * test ends up agreeing with a typo.
 */
export const TOTAL_GATE_STORIES: number =
  AUTONOMY_LEVELS.reduce((n, r) => n + GATE_SIZE_BY_RUNG[r], 0);

/** Sanity: every stage has a decision about its story, and only one stage is a wait. */
export const STAGES_WITHOUT_A_STORY: ReadonlyArray<CandidateStage> = Object.freeze(
  CANDIDATE_STAGES.filter((s) => STAGE_STORY_SUFFIX[s] === null),
);
