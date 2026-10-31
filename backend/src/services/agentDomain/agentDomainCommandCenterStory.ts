/**
 * STORY-000 for an agent-domain project -- the Command Center every builder builds first.
 *
 * Owner instruction, 30 October 2026: "Everyone should be building a Command Center as Story 000
 * so they can understand what all they will be building."
 *
 * ## Why this exists separately from `sbp/commandCenterStory.ts`
 *
 * The SBP Command Center is generated from a student's `BuildPlan` -- requirements, measures,
 * guardrails, systems of record. An agent-domain project has none of those: it has capabilities,
 * an autonomy ladder, legacy dispositions, an `ai_agents` row and a tool-grant queue. Adapting a
 * `BuildPlan` out of a `ProvisionPlan` would have produced a page whose every panel read "your
 * plan does not name a thing", which is honest and useless.
 *
 * So the SHAPE is shared and the CONTENT is domain-native. The story id and the title are imported
 * from the SBP module rather than retyped, because a Command Center that reads differently from
 * every other Command Center in the product is the drift this split would otherwise cause.
 *
 * ## Why the story id carries the domain prefix and the title does not
 *
 * Platform-wide, `student_tasks.story_id` is per-project and the Command Center is plainly
 * `STORY-000`. The ten domain projects use a globally unique convention instead --
 * `<domain>.RESEARCH-1-SYSTEM-CLASSES`, `<domain>.CAP.<key>` -- and a test asserts that every
 * story id across all ten is distinct. That invariant is worth more than matching the bare string:
 * it is what stopped a stale browser tab matching on `story_id` alone and overwriting eighteen
 * published tasks belonging to another project. So the id is `<domain>.STORY-000` and the TITLE is
 * the platform's own `STORY-000 ... Build your Command Center`, which is what a human reads.
 *
 * `isDomainCommandCenterStoryId` is exported so no caller has to know that rule twice.
 *
 * ## It fulfils no capability, on purpose
 *
 * `capability_id` is null and a shared-foundation reason is given instead, for the same reason the
 * SBP one is kept out of the traceability gate: the Command Center is not part of the system the
 * builder is making, it is the window onto it.
 *
 * Pure functions only. No I/O, no clock, no randomness.
 */

import { COMMAND_CENTER_STORY_ID, COMMAND_CENTER_TITLE } from '../sbp/commandCenterStory';
import { AUTONOMY_LEVELS, AUTONOMY_MEANINGS } from './autonomyLadder';
import type { AgentDomain } from './agentDomainRegistry';
import type { DomainCapabilityMatrix } from './capabilityRecord';

/** The bare platform id, re-exported so a caller never has to import two modules to get it. */
export { COMMAND_CENTER_STORY_ID, COMMAND_CENTER_TITLE };

/** `marketing` -> `marketing.STORY-000`. The one place the prefix rule lives. */
export function domainCommandCenterStoryId(domainKey: string): string {
  return `${domainKey}.${COMMAND_CENTER_STORY_ID}`;
}

/**
 * Does this `story_id` name a domain project's Command Center?
 *
 * Suffix-matched rather than equality-checked against a built string, so a caller holding only the
 * row can answer it without first knowing which domain it belongs to. Anchored on the separator so
 * a future `SOMETHING-STORY-000` cannot pass.
 */
export function isDomainCommandCenterStoryId(storyId: string): boolean {
  return storyId.endsWith(`.${COMMAND_CENTER_STORY_ID}`);
}

/** Why a story with no capability is legitimate. Asserted non-empty by the integrity suite. */
export const COMMAND_CENTER_SHARED_FOUNDATION_REASON =
  'The Command Center fulfils no capability of this domain because it is not part of the system '
  + 'being built -- it is the window onto it. Every builder gets the same one so the programme can '
  + 'be taught, reviewed and demonstrated as one thing, and so a builder can see the whole of what '
  + 'they are walking their agent through before they start walking it.';

/**
 * What "done" means, in the Given/When/Then shape the portal's own acceptance block renders.
 *
 * WRITTEN BECAUSE AN EMPTY ONE IS WORSE THAN A MISSING STORY. `student_tasks.acceptance` is
 * nullable JSONB, and the portal hides the entire "Done means" section when it is empty -- so a
 * story shipped without it reads as a task with no definition of done rather than as a task whose
 * criteria failed to load. The ten domain projects were provisioned with `acceptance` NULL on all
 * 503 stories; this is the first one that carries it.
 *
 * Every criterion is checkable by looking at the page. None of them can be satisfied by marking
 * the story complete.
 */
export const COMMAND_CENTER_ACCEPTANCE: ReadonlyArray<string> = Object.freeze([
  'Given the Command Center, when it is opened, then all six panels render and each one names the'
  + ' endpoint it read.',
  'Given a panel whose endpoint returned nothing, when it renders, then it says so in words and is'
  + ' visibly distinct from a panel that is still loading.',
  'Given the autonomy ladder panel, when it renders, then all ten rungs are present with the'
  + ' owner\'s wording, and each capability\'s ceiling is marked against the rung it stops at.',
  'Given a capability above `autonomy:R2` with no granted tools, when its authority is shown, then'
  + ' the page shows the effective authority `effectiveAuthority()` returns and the reason'
  + ' `no_tool_grants`, not the authority the capability record asks for.',
  'Given the governance panel, when a tool request is shown, then nothing on the page states or'
  + ' implies that filing it granted anything.',
  'Trust -- no panel shows a number, a grant, a rung or a result this domain has not actually'
  + ' produced.',
]);

/** The human whose review closes this story. Never the builder, and never an agent. */
export const COMMAND_CENTER_VALIDATION_DEPENDENCY =
  'Reviewed by the domain\'s accountable human against the page itself, on the evidence the page '
  + 'renders. Marking this story complete is not evidence that it is done.';

const bullets = (items: ReadonlyArray<string>, empty = '_none recorded_'): string =>
  (items.length === 0 ? empty : items.map((i) => `- ${i}`).join('\n'));

/** The ten rungs, with the owner's wording, rendered for the prompt. */
function ladderTable(): string {
  return [
    '| Rung | What it means |',
    '|---|---|',
    ...AUTONOMY_LEVELS.map((l) => `| \`autonomy:${l}\` | ${AUTONOMY_MEANINGS[l]} |`),
  ].join('\n');
}

/** Distinct autonomy stages this domain's capabilities actually name, in ladder order. */
export function autonomyStagesUsedBy(m: DomainCapabilityMatrix): string[] {
  const seen = new Set<string>();
  for (const c of m.capabilities) {
    if (typeof c.starting_autonomy === 'string') seen.add(c.starting_autonomy);
    if (typeof c.max_permitted_autonomy === 'string') seen.add(c.max_permitted_autonomy);
    for (const r of c.release_behaviour) {
      if (typeof r.autonomy === 'string') seen.add(r.autonomy);
    }
  }
  const order = AUTONOMY_LEVELS.map((l) => `autonomy:${l}`);
  return [...seen].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** How many `release_behaviour[]` entries this domain already has written for it. */
export function releaseBehaviourCount(m: DomainCapabilityMatrix): number {
  return m.capabilities.reduce((n, c) => n + c.release_behaviour.length, 0);
}

/**
 * The brief a builder reads on the story page, written against THIS domain's measured figures.
 *
 * The numbers live here and are deliberately NOT repeated in the prompt: two copies of a figure
 * drift, and then nobody knows which is true. The prompt says how to build; this says what is
 * true today.
 */
export function commandCenterBrief(d: AgentDomain, m: DomainCapabilityMatrix): string {
  const capCount = m.capabilities.length;
  const humanDecisions = m.capabilities.filter((c) => c.human_decision).length;
  const blocked = m.capabilities.filter((c) => c.blocked_by.length > 0).length;
  const stages = autonomyStagesUsedBy(m);
  const behaviours = releaseBehaviourCount(m);
  const agent = m.agent_name
    ? `\`${m.agent_name}\`, which already exists as a row in \`ai_agents\``
    : 'the AI employee this project will define, which does not exist yet';

  return [
    'Build one page that shows what you are building and how far along it is, so you can see your',
    'own domain and demonstrate from it.',
    '',
    `**Your domain** is ${d.title} (\`${d.domain_key}\`). **Your employee** is ${agent}.`,
    `**Your accountable human** is ${m.accountable_human}.`,
    '',
    `**The scope you are being handed:** ${capCount} researched capabilities, of which`,
    `${humanDecisions} are permanently human decisions that no autonomy level ever automates, and`,
    `${blocked} carry a recorded blocker. ${m.legacy_dispositions.length} legacy agent rows have a`,
    `disposition recorded against this domain. Capability research was recorded ${m.researched_at}.`,
    '',
    `**The ladder you will walk it down:** ten rungs, \`autonomy:R0\` to \`autonomy:R9\`. Your`,
    `capabilities name ${stages.length} distinct rungs between them`,
    `(${stages.join(', ') || 'none recorded'}), and ${behaviours} per-rung behaviours with their own`,
    'acceptance criteria are already written into the capability records. Those are not yours to',
    'invent; they are yours to read, render and then satisfy one rung at a time.',
    '',
    '**Nothing here is validated yet.** Every capability is `draft` until your accountable human',
    'has reviewed it. This page must show that state honestly rather than rendering a plan as a',
    'plan that somebody agreed to.',
  ].join('\n');
}

/**
 * The Claude Code prompt attached to the story.
 *
 * Built from the live module surface -- the real admin endpoints, the real ladder constants, the
 * real refusal rules -- rather than from a template, so a renamed route or a changed rung turns
 * into a failing test here instead of a builder following a path that no longer exists.
 */
export function commandCenterPromptForDomain(
  d: AgentDomain,
  m: DomainCapabilityMatrix,
): string {
  const tools = [...new Set(m.capabilities.flatMap((c) => [...c.required_tools]))].slice(0, 12);

  return [
    `# ${COMMAND_CENTER_TITLE} -- ${d.title}`,
    '',
    'This is Claude Code work, and the product is a page in this repository. It is the first thing',
    'you build and the last thing you delete: every later story reports into it.',
    '',
    '## The specification is the brief on this story, not this prompt',
    '',
    "Read the brief above this prompt on the story page. It names your domain's real counts, your",
    'accountable human and your employee. **Those numbers are not repeated here on purpose:** a',
    'second copy drifts from the first, and then nobody knows which is true. Work from the brief.',
    '',
    '## The six panels, and the question each one answers',
    '',
    '**1. Your employee -- "does it exist, and what is it allowed to do?"**',
    '',
    `Read \`GET /api/admin/agent-domains-mine\`. Render the agent's \`agent_name\`, whether it is`,
    '`enabled`, its `autonomy_level`, how many tools are granted to it, and when its autonomy was',
    'last set and by whom. If the agent does not appear, say so in those words and do not draw an',
    'empty card that looks like a loading state. An agent with no identity rows renders as nothing,',
    'and a panel that cannot tell "no agent" from "still fetching" is the panel that wasted a day.',
    '',
    '**2. Your capability inventory -- "what am I actually building?"**',
    '',
    `Read \`GET /api/admin/agent-domains/${d.domain_key}\` and`,
    `\`GET /api/admin/agent-domains/${d.domain_key}/coverage\`. One row per capability showing its`,
    'name, `classification`, `implementation_state`, `requirement_validation_state`,',
    '`starting_autonomy`, `max_permitted_autonomy`, and a clear mark on the ones where',
    '`human_decision` is true. Sort by nothing clever: the order the records come in is the order',
    'research recorded them.',
    '',
    '**3. The autonomy ladder -- "where is this going?"**',
    '',
    'Render all ten rungs, in the owner\'s own words, with your employee\'s current rung marked and',
    'each capability\'s ceiling marked against the rung it stops at:',
    '',
    ladderTable(),
    '',
    'Rungs above a capability\'s ceiling are drawn as unreachable for that capability rather than as',
    'future work. A ceiling is a decision somebody made with a reason, and the reason is on the',
    'record -- show it.',
    '',
    '**4. Per-rung behaviour -- "what does the next rung require of me?"**',
    '',
    'Each capability record carries `release_behaviour[]`: one entry per rung, each with a',
    '`behaviour` and its own `acceptance_criteria`. Render them under their rung. This is the panel',
    'that turns the ladder from a diagram into a list of things to do, and none of it is invented',
    'by you -- it is already written down.',
    '',
    '**5. Your governance queue -- "what am I waiting on a human for?"**',
    '',
    'Read `GET /api/admin/agent-domain-change-requests-mine`. Show change requests and tool',
    'requests separately, with status, who proposed, who decided and when. A tool request is how',
    'you ask for a capability your agent needs; it grants nothing by itself, and this panel must',
    'not imply that filing one did.',
    '',
    '**6. What is not available -- "what would I be lying about?"**',
    '',
    'A panel that names the gaps, because the gaps are the work. Specifically:',
    '',
    bullets([
      'Coordinated handoff between two agents does not exist in this platform today, so the rung'
      + ' that asks for it -- `autonomy:R8` -- is unreachable by fact rather than by choice. Say'
      + ' so; do not draw it as merely incomplete.',
      'A capability whose `requirement_validation_state` is `draft` has not been agreed by anyone.',
      'A capability with an empty `release_behaviour[]` has no defined next rung, and defining it'
      + ' is the first piece of work on it.',
      'Anything this page cannot source from a real endpoint is left blank and labelled, never'
      + ' filled with a plausible example.',
    ]),
    '',
    '## The rules this page must not break',
    '',
    '**Tool grants are the throttle, and they are not yours.** `effectiveAuthority()` in',
    '`backend/src/services/agentDomain/autonomyLadder.ts` forces any capability above `autonomy:R2`',
    'back down to `autonomy:R2` when no tools are granted, with the reason `no_tool_grants`. Read',
    'that function before you render any authority figure, and render what it returns rather than',
    'what the capability record asks for. The two differ on purpose.',
    '',
    '**Finishing work does not promote anything.** `NON_PROMOTING_SIGNALS` in',
    '`promotionCriteria.ts` names the four things that must never raise autonomy: a story marked',
    'complete, elapsed time, a conversation that went well, and a mocked test passing. This page',
    'may show progress; it may never show progress as authority. A named human promotes an agent,',
    'one rung at a time, on evidence.',
    '',
    '**Draft is not approved.** Render `draft` as draft everywhere. No panel may read as though a',
    'manager has signed anything off.',
    '',
    `## Tools your capabilities say they will need`,
    '',
    bullets(tools, '_none recorded yet, which is itself worth showing_'),
    '',
    'None of these is granted today. Each one is a request you file and a human approves.',
    '',
    '## Evidence this story is done',
    '',
    'Cite the real thing: a named passing test, a screenshot of the rendered page beside the',
    'endpoint response it was built from, or a file:line. **None of these count:** this story being',
    'marked complete, elapsed time, a conversation that went well, or a mocked test passing.',
    `${m.accountable_human} evaluates the evidence.`,
  ].join('\n');
}
