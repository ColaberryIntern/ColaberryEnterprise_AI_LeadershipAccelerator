/**
 * The four-step capability ladder: do it by hand, do it in the app, request the tool, then let the
 * agent do it watched.
 *
 * Ali's ruling, 13 November 2026, in his own words: *"For any task they come up with, they should
 * do it manually 1st so they can understand what's it like. They have to be able to do it via the
 * app and then request a tool that can do the same thing. You start off one at a time and you build
 * and grow and then add more and more functionality -- not try to push an adult out the womb."*
 *
 * ## What this replaces, and why
 *
 * Until now a capability projected one story per `release_behaviour[]` entry -- its behaviour
 * repeated once per rung of the autonomy ladder. Measured against production on 2026-11-13 that
 * produced **964 behaviour stories across ten domains, of which zero had ever been completed by
 * anybody**, while all 100 completions in the entire programme sat at R0. Marketing carried 177
 * stories for 64 distinct behaviours; admissions and curriculum 2.9 copies of each behaviour. Every
 * one of those 964 rows had a `description` byte-identical to its `title`, averaging 51 characters,
 * so a builder opening one was handed four words. None of them mentioned doing the work by hand
 * (0 of 964) or requesting a tool (0 of 964) -- which is why, with a working tool-request path in
 * the product, **not one tool request has ever been filed**.
 *
 * That backlog described the finished agent. It did not describe a path to one. A rung is a level
 * of authority a capability EARNS on evidence; enumerating every rung up front turns the ladder
 * into a to-do list and puts R5 stories in front of a builder who has never once done the task.
 *
 * ## The shape instead
 *
 * One capability at a time, four stories, in this order, all four sitting on the capability's own
 * starting rung because none of this is promotion:
 *
 *   L1 BY HAND        perform the workflow yourself and write down what it was actually like
 *   L2 IN THE APP     produce the same outcome through the product, no agent, no database edit
 *   L3 TOOL REQUEST   file for the tool, citing L1 and L2 as the evidence; a human decides
 *   L4 AGENT WATCHED  the agent does it at its starting rung with a human approving each run
 *
 * L3 is the gate the owner actually sees, and it is reachable today: an intern POSTs
 * `/api/admin/agent-domain-change-requests-mine` behind the `dashboard` section every domain
 * builder already holds, and an admin decides at `.../decide`. Verified against `origin/main` on
 * 2026-11-13 -- the filing form is `AdminChangeRequestsPage.tsx`. **A step of this ladder must
 * never ask for something the product cannot do**; that is the failure this module exists to end,
 * so if a future step needs a surface that does not exist, the step becomes a build story rather
 * than an instruction.
 *
 * Nothing here enables an agent, grants a tool or moves an autonomy level. Finishing L4 makes the
 * NEXT capability startable; it promotes nobody.
 */

import type { AgentDomain } from './agentDomainRegistry';
import type { CapabilityRecord, DomainCapabilityMatrix } from './capabilityRecord';
import { bullets, promptFor } from './agentDomainCapabilityPrompt';
import { bareLevel, rungOf } from './agentDomainReleaseLadder';
import type { AutonomyStage } from './autonomyLadder';

/** The four steps, in the only order they are allowed to happen in. */
export type LadderStep = 'by_hand' | 'in_the_app' | 'tool_request' | 'agent_watched';

export const LADDER_STEPS: ReadonlyArray<LadderStep> = Object.freeze([
  'by_hand', 'in_the_app', 'tool_request', 'agent_watched',
]);

/** The id suffix for each step. Short, greppable from a board, stable across rewordings. */
export const STEP_SUFFIX: Readonly<Record<LadderStep, string>> = Object.freeze({
  by_hand: 'L1-BY-HAND',
  in_the_app: 'L2-IN-THE-APP',
  tool_request: 'L3-TOOL-REQUEST',
  agent_watched: 'L4-AGENT-WATCHED',
});

/** What each step is for, in one line, shown at the top of its story. */
export const STEP_INTENT: Readonly<Record<LadderStep, string>> = Object.freeze({
  by_hand: 'Understand the work by doing it yourself, before anything automates it.',
  in_the_app: 'Prove the product can already do it, with no agent involved.',
  tool_request: 'Ask for the tool, and let a human decide whether the agent may have it.',
  agent_watched: 'Let the agent do it at its starting rung, with a human approving every run.',
});

export interface LadderStory {
  readonly step: LadderStep;
  readonly step_number: number;
  readonly story_id: string;
  readonly title: string;
  readonly body: string;
  readonly acceptance: ReadonlyArray<string>;
  readonly autonomy_stage: AutonomyStage;
  readonly claude_code_prompt: string;
}

/** The one sentence every step repeats, so the order cannot be read as a suggestion. */
const ORDER_RULE =
  'The four steps of this capability run in order. A later step opened before its predecessor is '
  + 'complete is the thing this ladder exists to prevent -- say so and go back rather than working '
  + 'ahead.';

function byHandBody(c: CapabilityRecord): string {
  return [
    `**${STEP_INTENT.by_hand}**`,
    ``,
    `Do this capability yourself, by hand, once, end to end. Not a simulation and not a `
      + `description -- the real task, with the real inputs, producing the real outcome.`,
    ``,
    `**The outcome you are producing**`,
    c.business_outcome,
    ``,
    `**The workflow as it was recorded during research.** Treat this as a claim to be tested, `
      + `not as instructions. Where it is wrong or incomplete, that difference is the single most `
      + `valuable thing this story produces.`,
    bullets([...c.workflow]),
    ``,
    `**What goes in**`,
    bullets([...c.inputs]),
    ``,
    `**What comes out**`,
    bullets([...c.outputs]),
    ``,
    `**Exceptions the research expects you to hit**`,
    bullets([...c.exceptions], '_none recorded -- if you hit one anyway, that is a finding_'),
    ``,
    `**Write a run log.** It is the deliverable of this story and every later step cites it. `
      + `Record the date, how long it actually took, each step you really performed, every `
      + `judgment call you made and what you based it on, and at least one thing that was harder, `
      + `slower or more ambiguous than the workflow above implies.`,
    ``,
    c.human_decision
      ? `**This capability is a human decision.** Pay particular attention to what you decided `
        + `and why -- that judgment is the part an agent will never be allowed to take over, at `
        + `any rung, and your log is the record of what it consists of.`
      : `While you work, keep asking which parts are mechanical and which need judgment. That `
        + `split is what the tool request in step 3 will be argued from.`,
    ``,
    ORDER_RULE,
  ].join('\n');
}

function inTheAppBody(c: CapabilityRecord): string {
  const pages = [...c.application_pages];
  return [
    `**${STEP_INTENT.in_the_app}**`,
    ``,
    `Produce the same outcome a second time, using only the product. No agent, no script, and no `
      + `direct database edit. If you cannot finish it this way, that is not a failure of this `
      + `story -- it is the finding, and it is what this story is for.`,
    ``,
    `**The pages this capability was recorded against**`,
    bullets(
      pages,
      '_no application pages recorded -- establishing whether any surface exists is this '
        + 'story\'s first job, and "none" is a legitimate, reportable answer_',
    ),
    ``,
    c.apis.length
      ? `**APIs behind those pages**, for reading when a page behaves in a way you did not `
        + `expect:\n${bullets([...c.apis])}`
      : `No APIs are recorded for this capability.`,
    ``,
    `**Compare against your run log from step 1.** Same inputs, same outcome? Where the product `
      + `made you do something the manual route did not, or could not do something the manual `
      + `route could, write it down as a named gap: what you were trying to do, which page, and `
      + `what happened instead.`,
    ``,
    `**A gap found here is a result, not a blocker.** Record it, and say plainly whether the `
      + `capability can be completed in the product today. An agent cannot be given a tool for `
      + `something the product itself cannot do, so an honest "not yet" here saves the whole `
      + `capability from being automated on top of a hole.`,
    ``,
    ORDER_RULE,
  ].join('\n');
}

function toolRequestBody(d: AgentDomain, m: DomainCapabilityMatrix, c: CapabilityRecord): string {
  return [
    `**${STEP_INTENT.tool_request}**`,
    ``,
    `File a tool request for this capability, and let it be decided. This is a real governance `
      + `gate with a real human on the other side of it, not paperwork.`,
    ``,
    `**How to file it.** Open the Change Requests page in the admin and file one against `
      + `\`${d.domain_key}\`, the domain you own. It posts to `
      + `\`POST /api/admin/agent-domain-change-requests-mine\`. `
      + `${m.accountable_human} or an admin decides it at `
      + `\`POST /api/admin/agent-domain-change-requests/:id/decide\`. You cannot decide your own.`,
    ``,
    `**The tools this capability was recorded as needing**`,
    bullets(
      [...c.required_tools],
      '_none recorded -- then say which tool you now believe is needed, in your own words, '
        + 'based on what steps 1 and 2 showed you_',
    ),
    ``,
    `**What the request has to say**, and all of it comes from work you have already done:`,
    bullets([
      'The exact thing the tool would do, in one sentence.',
      'Why it is needed, citing your step 1 run log -- what was slow, repetitive or error-prone.',
      'What you proved in step 2: that the product can already produce this outcome by hand, '
        + 'or exactly which gap stops it.',
      'The scope: what the tool may touch and what it must never touch.',
      'Who approves a run, and what happens when the tool is wrong.',
    ]),
    ``,
    c.human_decision
      ? `**This capability is a human decision**, so the request must say in its own words that `
        + `the tool prepares and proposes and never decides. A request that does not say so should `
        + `be declined.`
      : `Say explicitly which parts of the work the tool takes and which stay with a person.`,
    ``,
    `**A declined request is a completed story.** The decision is the outcome, not the approval. `
      + `Record what was decided and why, and if it was declined, what would have to change.`,
    ``,
    ORDER_RULE,
  ].join('\n');
}

function agentWatchedBody(c: CapabilityRecord, stage: AutonomyStage): string {
  const first = c.release_behaviour[0];
  const level = bareLevel(stage);
  return [
    `**${STEP_INTENT.agent_watched}**`,
    ``,
    `Only start this once step 3 has a recorded decision and the tool exists. The agent now does `
      + `the capability at **${level}**, its own starting rung, with a named human approving `
      + `every single run before it takes effect.`,
    ``,
    first
      ? `**The behaviour to reach**\n${first.behaviour}\n\n`
        + `**How it is judged**\n${first.acceptance_criteria}`
      : `**No release behaviour was recorded for this capability**, so judge it against the `
        + `business outcome and your own step 1 run log: the agent produces the same outcome you `
        + `produced by hand, on the same inputs, and a human sees every run before it counts.`,
    ``,
    `**Measure it against your run log, not against a feeling.** Same inputs, same outcome, and `
      + `the exceptions from step 1 handled the way you handled them. A run that differs is `
      + `evidence, and it belongs in the record whether or not it is convenient.`,
    ``,
    `**This capability's ceiling is ${c.max_permitted_autonomy}.**`
      + `${c.max_autonomy_rationale ? ` ${c.max_autonomy_rationale}` : ''}`,
    ``,
    c.human_decision
      ? `**This capability is a human decision and stays one at every rung, forever.** The agent `
        + `may prepare, summarise and propose. It never decides. There is no rung at which that `
        + `changes.`
      : `Higher rungs are not part of this story and are not tasks. A rung is earned by a named `
        + `human on evidence, after this one is working and has a record behind it.`,
    ``,
    `**When this passes, the capability is done and the next one starts.** One at a time is the `
      + `point: pick the next capability with your manager and open its step 1.`,
  ].join('\n');
}

/**
 * The four stories for one capability, in order.
 *
 * All four sit on the capability's recorded `starting_autonomy` -- measured 2026-10-31, all 443
 * records start at `autonomy:R0`. That is deliberate and not a placeholder: doing the task by hand
 * and filing a tool request are not performed at a level of agent authority at all, and the one
 * story that IS about the agent acting is explicitly about its STARTING rung. Spreading these four
 * across rungs would recreate the cross-product this module replaced.
 */
export function capabilityLadderStories(
  d: AgentDomain, m: DomainCapabilityMatrix, c: CapabilityRecord,
): LadderStory[] {
  const stage = rungOf(c.capability_id, 'starting_autonomy', c.starting_autonomy);
  const base = `${d.domain_key}.CAP.${c.capability_id.split('.').slice(1).join('.')}`;
  const first = c.release_behaviour[0];

  const spec: Readonly<Record<LadderStep, { title: string; body: string; acceptance: string[] }>> = {
    by_hand: {
      title: `${c.name} · 1 · do it by hand`,
      body: byHandBody(c),
      acceptance: [
        'The capability was performed end to end by hand, producing its real outcome on real '
          + 'inputs.',
        'A run log exists recording the date, the elapsed time, each step actually performed, '
          + 'every judgment call made, and at least one way the recorded workflow differed from '
          + 'what the work was really like.',
      ],
    },
    in_the_app: {
      title: `${c.name} · 2 · do it in the app`,
      body: inTheAppBody(c),
      acceptance: [
        'The same outcome was produced a second time using only the product, with no agent, no '
          + 'script and no direct database edit -- or the exact step that made this impossible is '
          + 'written down as a named gap.',
        'The app route was compared against the step 1 run log, and every difference between them '
          + 'is recorded.',
      ],
    },
    tool_request: {
      title: `${c.name} · 3 · request the tool`,
      body: toolRequestBody(d, m, c),
      acceptance: [
        'A change request for a tool exists against this domain, filed by the builder, naming the '
          + 'tool, its scope, what it must never touch, and who approves a run.',
        'The request cites the step 1 run log and the step 2 result as its evidence.',
        'A named human other than the builder has recorded a decision on it. A decline counts; an '
          + 'undecided request does not.',
      ],
    },
    agent_watched: {
      title: `${c.name} · 4 · agent does it, watched`,
      body: agentWatchedBody(c, stage),
      acceptance: [
        ...(first ? [first.acceptance_criteria] : []),
        'The agent produced the same outcome as the step 1 run log, on the same inputs, including '
          + 'the exceptions recorded there.',
        'Every run in the evidence window was approved by a named human before it took effect, '
          + 'and the record shows who.',
      ],
    },
  };

  return LADDER_STEPS.map((step, i) => ({
    step,
    step_number: i + 1,
    story_id: `${base}.${STEP_SUFFIX[step]}`,
    title: spec[step].title,
    body: spec[step].body,
    acceptance: spec[step].acceptance,
    autonomy_stage: stage,
    // The capability-wide prompt for the three human steps; the rung-focused one for the step
    // where the agent actually acts, so it carries that behaviour rather than the whole ladder.
    claude_code_prompt: step === 'agent_watched' && first
      ? promptFor(d, m, c, first)
      : promptFor(d, m, c),
  }));
}
