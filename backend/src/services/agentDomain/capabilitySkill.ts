/**
 * `docs/agent/capability.md` — the per-stage instructions a builder's Claude Code reads.
 *
 * ## What this is, and what it honestly is not
 *
 * It is the complete brief for every stage of one capability, in the builder's own repository,
 * where their Claude Code session can read it cold. It is NOT a registered slash command: the
 * platform cannot make `/capability` exist on somebody else's machine. `docs/agent/README.md`
 * names this file as the entry point and carries the one line that installs it as a real command
 * locally, and T014 records the one decision that would close the remaining gap.
 *
 * ## Why it is in `docs/` and NOT in `.claude/skills/`
 *
 * `PATH_ALLOWLIST` in `renderDocs.ts` is `[CLAUDE.md, docs/, .colaberry/, artifacts/]` and
 * `renderDocs` **throws a `RenderError` on any unlisted path**. An earlier plan cycle chose
 * `.claude/skills/capability/SKILL.md`, which matches none of the four — it would have broken
 * document sync for all seven builders on the first run after deploy.
 *
 * And `.claude/agents/` sits in `STUDENT_OWNED_PREFIXES` precisely so the platform never writes
 * over builder-authored `.claude/` content. Widening the allowlist to reach into `.claude/` is a
 * decision about which parts of a builder's repository the platform may own, and that is Ali's,
 * not a side effect of shipping a prompt.
 *
 * ## The one rule every prompt here obeys
 *
 * **It never asks the builder what they do by hand.** Ali's correction, 17 Nov 2026: they do not
 * hold the job, and a list built from guesses about somebody else's week is how the first attempt
 * went wrong. Four candidates arrive from four named sources and the builder chooses. A test
 * asserts the emitted body contains none of the question forms that would break this.
 */

import { BUILDER_STAGES, GATE_SIZE_BY_RUNG } from './builderPath';
import { AUTONOMY_LEVELS, AUTONOMY_MEANINGS, type AutonomyLevel } from './autonomyLadder';
import { CANDIDATE_STAGES, isOwnerTurn } from './candidateStages';
import { STAGE_STORY_SUFFIX } from './builderPathStories';

/** Where the skill body lands. Allowlisted via `docs/`, so `renderDocs` cannot throw on it. */
export const CAPABILITY_SKILL_PATH = 'docs/agent/capability.md';

/** Everything this module emits. Asserted to be entirely inside `docs/`. */
export const CAPABILITY_SKILL_PATHS: ReadonlyArray<string> = Object.freeze([
  CAPABILITY_SKILL_PATH,
]);

/**
 * The four places a candidate comes from, and what each is worth.
 *
 * Named individually rather than as "four sources", because the whole point is that a builder can
 * tell them apart: the person who holds the job knows something the research does not, and a
 * scored suggestion is a starting point rather than an instruction.
 */
export const CANDIDATE_SOURCE_GUIDE: ReadonlyArray<{ key: string; label: string; weight: string }> =
  Object.freeze([
    {
      key: 'research',
      label: 'Your own research',
      weight: 'You read the domain. Strongest on what the product can do, weakest on what the '
        + 'work actually feels like week to week.',
    },
    {
      key: 'manager',
      label: 'The person who holds the job',
      weight: 'They do this work. Treat anything from here as the most reliable signal on the '
        + 'list, and the one worth a conversation if it surprises you.',
    },
    {
      key: 'owner',
      label: 'Ali',
      weight: 'He is deciding what the agent is for. A candidate from here may be less obvious '
        + 'and more important than the rest.',
    },
    {
      key: 'suggested',
      label: 'Scored against this rung',
      weight: 'Generated and scored against the rung\'s criteria. A starting point, not an '
        + 'instruction: it has never watched anybody do the job.',
    },
  ]);

function gateTable(): string {
  return [
    '| Rung | What it means | Capabilities the agent must do, watched |',
    '|---|---|---|',
    ...AUTONOMY_LEVELS.map((r: AutonomyLevel) =>
      `| \`${r}\` | ${AUTONOMY_MEANINGS[r]} | ${GATE_SIZE_BY_RUNG[r]} |`),
  ].join('\n');
}

function sourcesSection(): string {
  return [
    '## Where the four candidates come from',
    '',
    'You are **not** being asked what you do by hand. You do not hold this job, and a list built',
    'from guesses about somebody else\'s week is how the first attempt at this went wrong. Four',
    'candidates arrive, each labelled with where it came from, and you choose one.',
    '',
    ...CANDIDATE_SOURCE_GUIDE.flatMap((s) => [
      `**${s.label}** (\`${s.key}\`)`,
      '',
      s.weight,
      '',
    ]),
    'Four at a time, in parallel, so you are never waiting on a decision that is not yours to',
    'make. If one stalls, start the next.',
    '',
  ].join('\n');
}

/** One prompt per stage, in path order. Every one names the artifact that stage produces. */
function stagePrompts(): string {
  return BUILDER_STAGES.flatMap((s, i) => {
    const suffix = STAGE_STORY_SUFFIX[s.stage];
    return [
      `## Stage ${i + 1} of ${BUILDER_STAGES.length}: ${s.title}`,
      '',
      `**Stage key:** \`${s.stage}\``,
      `**Whose move:** ${s.owned_by}`,
      `**Produces:** \`${s.artifact_path}\``,
      suffix
        ? `**Board row:** the story ending \`${suffix}\``
        : '**Board row:** none, deliberately. Nothing is owed by you here, and a task telling you '
          + 'to wait is how a board fills up with items nobody can finish.',
      '',
      s.meaning,
      '',
      '### What to do',
      '',
      ...stageInstructions(s.stage),
      '',
      '### Done when',
      '',
      s.artifact_is_done_when,
      '',
      isOwnerTurn(s.stage)
        ? 'This stage is **not yours to clear**. Write what is needed, then start another '
          + 'candidate rather than waiting.'
        : `Write \`${s.artifact_path}\` and the checklist in \`docs/agent/README.md\` ticks on the `
          + 'next document sync. Nothing else can tick it: there is no flag and no API call.',
      '',
    ];
  }).join('\n');
}

/** The per-stage body. Long on purpose: this is the brief, not a label. */
function stageInstructions(stage: string): string[] {
  switch (stage) {
    case 'proposed':
      return [
        '1. Read all four candidates and the source label on each.',
        '2. Pick ONE. Write down why this one before the other three, in a paragraph.',
        '3. Run it past the product front door and record the answer: `in_app`, `partly`,',
        '   `api_only` or `not_built`, with the feature it matched when it matched one.',
        '',
        'That answer decides which way the path forks, so do not skip it and do not guess it. The',
        'app may already do this, may half do it, may have the machinery with no screen, or may',
        'not do it at all. Those are four different next steps and only two of them are yours.',
      ];
    case 'scope_sheet_owed':
      return [
        'The front door said the product cannot do this at all. That is the only state that is a',
        'build request, and it is also where the most expensive mistake is available: arguing for',
        'a tool nobody can tell whether worked.',
        '',
        'Answer three questions before anybody writes code:',
        '',
        '1. **Who acts on the output** — a person, by name, in the people record\'s spelling. Not',
        '   a role, not "the team".',
        '2. **What number decides it worked** — one threshold, stated so somebody else could',
        '   check it.',
        '3. **What the system already records that would produce that number** — and if nothing',
        '   does, say so plainly. The measurement is then part of the build, not an afterthought.',
      ];
    case 'platform_owed':
      return [
        'The app has the endpoints for this and nobody built the page, or it does part of the job',
        'and whether that part is enough is not yours to settle. Either way the next move is',
        'Ali\'s and **you are not blocked on yourself**.',
        '',
        'What you owe is a request that is BUILDABLE: name the screen and the route it would live',
        'at, not the frustration. Do **not** write a scope sheet — a scope sheet argues something',
        'should exist, and most of this already does.',
        '',
        'Once it is approved, Ali builds the page, you test it until it does the job, and only',
        'then are you doing this by hand.',
      ];
    case 'screen_built':
      return [
        'The screen exists now. Use it on real work until it does the job, or say plainly that it',
        'does not.',
        '',
        'Testing it IS the work at this stage, not a formality before the work. A clean report',
        'with nothing to say is a sign it was not really used.',
      ];
    case 'by_hand_pending':
      return [
        'The app already does this. Do it by hand yourself first, start to finish, on real inputs',
        'producing the real outcome.',
        '',
        'Record the run: what you entered, what came out, how long it took, every judgement call',
        'you made, and at least one way the real work differed from how it is written down.',
        '',
        'Everything after this stage is a judgement about work you have personally done. That is',
        'the whole reason it comes first.',
      ];
    case 'proven_by_hand':
      return [
        'You have done it by hand, so you know what it costs. Now ask for the tool, with the',
        'evidence rather than the idea.',
        '',
        'Cite the run you recorded. The request carries six field groups, and the manual-today',
        'section is the one that has to point at that run rather than describe the work in',
        'general.',
        '',
        'Filing a request grants nothing. A named human other than you records a decision on it,',
        'and a decline counts as a decision.',
      ];
    case 'tool_requested':
      return [
        'The request is filed and sitting with Ali. Record its id so the decision can be found',
        'later without searching.',
        '',
        'Then **start another candidate**. Nothing here is yours to move, and waiting is not work.',
      ];
    case 'agent_watched':
      return [
        'Approved. The agent runs it and you watch.',
        '',
        'Compare at least one agent run against the by-hand run you recorded, on the same inputs,',
        'including the exceptions. State whether the threshold from the scope sheet was met.',
        '',
        'Every run in the evidence window is approved by a named human before it takes effect,',
        'and the record shows who. **This stage is the gate** — doing a capability by hand is real',
        'progress and it is not this.',
      ];
    default:
      // Unreachable while the test comparing this switch against CANDIDATE_STAGES passes.
      throw new Error(`CapabilitySkillMissingStage: ${stage}`);
  }
}

/**
 * The file.
 *
 * Pure and deterministic: no clock, no randomness, no I/O. A timestamp here would make every
 * document sync commit a file whose only change is the time, which is the rule `renderDocs`
 * states about its own manifest.
 */
export function capabilitySkillBody(): string {
  return [
    '# `/capability` — taking one capability all the way down the path',
    '',
    'This is the brief for every stage of one capability. Your Claude Code session can read it',
    'from this repository with no access to the portal.',
    '',
    '**It is a document, not an installed command.** The platform cannot register a slash command',
    'on your machine. `docs/agent/README.md` says how to install it as one locally if you want to;',
    'either way the instructions below are the same.',
    '',
    '---',
    '',
    sourcesSection(),
    '---',
    '',
    `# The ${BUILDER_STAGES.length} stages`,
    '',
    'One capability at a time. Each stage produces a file, and the checklist in',
    '`docs/agent/README.md` ticks a stage only when that file is present — there is no flag and no',
    'API call that marks one done.',
    '',
    stagePrompts(),
    '---',
    '',
    '# The gate for each rung',
    '',
    'A rung is cleared when this many capabilities in your domain are being done by the agent,',
    'watched. The number rises with the rung on purpose: an early rung asks you to get one thing',
    'all the way through, a late one asks whether you can do it reliably.',
    '',
    gateTable(),
    '',
  ].join('\n');
}

/** The emitted files, for `renderDocs` to append to its shared list. */
export function capabilitySkillFiles(): Array<{ path: string; content: string }> {
  return [{ path: CAPABILITY_SKILL_PATH, content: capabilitySkillBody() }];
}

/**
 * There is deliberately NO re-export of the stage list here.
 *
 * An earlier version exported `COVERED_STAGES = CANDIDATE_STAGES` with the comment "exported so
 * the test can compare the switch's coverage against the enum". Nothing imported it: the test
 * imports `CANDIDATE_STAGES` from `./candidateStages` directly, which is the right source. So the
 * export was dead and its comment named a consumer that did not exist.
 *
 * Removed rather than wired up, because a re-export is the weaker option either way: a test
 * comparing this module's switch against a list THIS module publishes could be satisfied by
 * trimming both together. Reading the enum from its own module is what makes the coverage
 * assertion mean something.
 */
