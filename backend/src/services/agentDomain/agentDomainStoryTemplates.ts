/**
 * Releases and stories for the ten AI employee domain projects.
 *
 * Run `20261007-school-agent-factory` (T12), session CC-20261006-a4k7.
 *
 * A release is a `student_task_lists` row and a story is a `student_tasks` row -- the repo's own
 * mapping (`internshipProjectGeneration.ts:28-29`). Nothing here invents a second shape for either.
 *
 * ## What each project gets
 *
 * **A release is a RUNG OF AUTONOMY, not a phase of work.** Phase 2 of
 * `docs/architecture/ai-workforce-management/AUTONOMY_RELEASE_MIGRATION.md`, decided by Ali on
 * 30 October 2026. Each project gets thirteen releases: the ten rungs `autonomy:R0` to
 * `autonomy:R9`, in the owner's own wording, plus the three original workstream releases kept
 * empty below them as the rollback path.
 *
 * Stories land on rungs like this:
 *
 *   autonomy:R0  the Command Center, the owner's five research/manager-discovery stories, the
 *                legacy migration plan, and every capability story -- because R0 is literally
 *                "Define the workflow, requirements, risks and human decisions", and all 443
 *                capabilities record `starting_autonomy: autonomy:R0`.
 *   autonomy:R1  .. R9   one story per `release_behaviour[]` entry, placed on that entry's own
 *                rung. 964 entries across the 443 records, each already carrying its behaviour
 *                and its acceptance criteria. This is the additive half of Phase 2.
 *   r0, r1, r2   kept, empty. One UPDATE per story restores the previous shape.
 *
 * Nothing here enables an agent, grants a tool or changes an autonomy level, and **finishing a
 * release promotes nobody** -- it makes a rung eligible for a named human to promote on evidence.
 * Story completion is recorded as a non-promoting signal precisely so that a ladder cannot decay
 * into a progress bar.
 *
 * ## Prompts are built from evidence, not from a template
 *
 * The amendment requires "full, domain-specific Claude Code prompts" carrying the human-operable
 * business process, its tool interface, and the agent behaviour that uses it. Every prompt here is
 * assembled from that capability's OWN record -- its workflow, inputs, outputs, exceptions, APIs,
 * source modules, tool list and per-release behaviour. That is why no two prompts are alike: a
 * shared boilerplate string would be a template wearing a prompt's clothes, and a test asserts no
 * two capabilities produce the same prompt body.
 *
 * ## Everything is draft, and story 4 sends nothing
 *
 * No manager has validated a capability, so every implementation story is `draft` with a visible
 * validation dependency naming the human. Story 4 arranges a manager interview as PROJECT WORK: it
 * carries no scheduling link, no calendar invite and no attendee list, and no module in this
 * directory imports a mail, calendar or Basecamp client. The owner was explicit -- create the work,
 * do not send invitations, do not claim a meeting is booked.
 */

import {
  AGENT_DOMAINS,
  type AgentDomain,
} from './agentDomainRegistry';
import {
  loadDomainMatrix,
  type CapabilityRecord,
  type DomainCapabilityMatrix,
  type ReleaseBehaviour,
} from './capabilityRecord';
import { AUTONOMY_MEANINGS, type AutonomyStage } from './autonomyLadder';
import {
  AUTONOMY_RELEASES,
  FOUNDATION_STAGE,
  LEGACY_RELEASES,
  RELEASES,
  RUNG_PLATFORM_GAP,
  bareLevel,
  releaseName,
  rungOf,
  type GeneratedRelease,
} from './agentDomainReleaseLadder';
import { bullets, promptFor } from './agentDomainCapabilityPrompt';
import { researchPromptFor } from './agentDomainResearchPrompts';
import {
  COMMAND_CENTER_SHARED_FOUNDATION_REASON,
  COMMAND_CENTER_TITLE,
  COMMAND_CENTER_VALIDATION_DEPENDENCY,
  commandCenterBrief,
  commandCenterPromptForDomain,
  domainCommandCenterStoryId,
} from './agentDomainCommandCenterStory';

export type StoryKind =
  | 'command_center' | 'research' | 'legacy_migration' | 'implementation' | 'release_behaviour';
export type StoryStatus = 'draft' | 'ready';

export interface GeneratedStory {
  /** Stable, matched on by prefix rather than title text, so a reworded title cannot break a test. */
  readonly story_id: string;
  readonly release_key: string;
  readonly kind: StoryKind;
  readonly title: string;
  readonly status: StoryStatus;
  readonly body: string;
  /** The capability this traces to, or null for a justified shared-foundation story. */
  readonly capability_id: string | null;
  /** Why a story with no capability is legitimate. Null when `capability_id` is set. */
  readonly shared_foundation_reason: string | null;
  readonly validation_dependency: string;
  /** The full, domain-specific Claude Code prompt. Empty only for research stories. */
  readonly claude_code_prompt: string;
  /**
   * The rung of the autonomy ladder this story sits on, namespaced `autonomy:R0`..`autonomy:R9`.
   *
   * Equal to `release_key` by construction, because Phase 2 made a release BE a rung. They are
   * kept as two fields rather than one because they answer different questions and a later phase
   * may legitimately separate them: `release_key` is where the row hangs, `autonomy_stage` is the
   * authority level the work belongs to. A test asserts they agree for every generated story, so
   * if they ever diverge it is because somebody meant it.
   */
  readonly autonomy_stage: AutonomyStage;
  /**
   * Acceptance criteria to write with the row, when the source data already carries them.
   *
   * Empty for every kind except `release_behaviour`, whose criteria are written per rung in the
   * capability records. The other kinds were backfilled separately by AF10.2 on 2026-10-21 and
   * re-deriving them here would fight a script that already owns that column.
   */
  readonly acceptance: ReadonlyArray<string>;
}

export interface DomainPlan {
  readonly domain_key: string;
  readonly releases: ReadonlyArray<GeneratedRelease>;
  readonly stories: ReadonlyArray<GeneratedStory>;
}

/** The owner's five, verbatim in intent. Prefixes are stable; titles may be reworded. */
const RESEARCH_PREFIXES = [
  'RESEARCH-1-SYSTEM-CLASSES',
  'RESEARCH-2-AGENT-ANATOMY',
  'RESEARCH-3-ROLE-AND-DA-TRANSITION',
  'RESEARCH-4-MANAGER-INTERVIEW',
  'RESEARCH-5-THREE-PROPOSED-TASKS',
] as const;


/** The five research stories, written against THIS domain rather than in the abstract. */
function researchStories(d: AgentDomain, m: DomainCapabilityMatrix): GeneratedStory[] {
  const who = d.manager_identity_id ? m.accountable_human : 'the accountable human (unresolved)';
  const employee = m.agent_name ? `${m.agent_name} (an AI employee that already exists)` : 'the AI employee this project will define (none exists yet)';
  const legacyCount = m.legacy_dispositions.length;
  const capCount = m.capabilities.length;

  const common = (prefix: string, title: string, body: string): GeneratedStory => {
    const storyId = `${d.domain_key}.${prefix}`;
    return {
      story_id: storyId,
      // R0 is literally "Define the workflow, requirements, risks and human decisions." That is
      // what these five stories are, which is why the migration design maps them here.
      release_key: FOUNDATION_STAGE,
      autonomy_stage: FOUNDATION_STAGE,
      acceptance: [],
      kind: 'research',
      title,
      status: 'draft',
      body,
      capability_id: null,
      shared_foundation_reason:
        'Research and manager-discovery work required of every domain by the owner, independent of any '
        + 'single capability.',
      validation_dependency: `${who} reviews the written output before any capability leaves draft.`,
      // A research story is still CLAUDE CODE WORK; its product is a committed document rather
      // than a feature. This used to be '' and `agentDomainProvisionPlan` substituted
      // HUMAN_WORK_STATEMENT, which told the intern there was nothing to run. See
      // `agentDomainResearchPrompts` for why that was wrong and what it cost.
      claude_code_prompt: researchPromptFor(storyId, {
        title,
        domainTitle: d.title,
        manager: m.accountable_human,
        storyId,
        release: releaseName(FOUNDATION_STAGE),
      }) ?? '',
    };
  };

  return [
    common(
      RESEARCH_PREFIXES[0],
      'Compare the five system classes, and place this domain among them',
      `Write a short, evidenced comparison of chatbots, fixed workflows, tool-using agents, agentic `
      + `systems and multi-agent systems. Then say which one **${d.title}** actually needs, and why.\n\n`
      + `Ground it in this domain, not in the abstract: it has **${capCount} candidate capabilities** `
      + `and **${legacyCount} inherited legacy records**. Of those capabilities, `
      + `${m.capabilities.filter((c) => c.human_decision).length} are reserved to a human at every `
      + `level. A comparison that does not change depending on that number has not been applied.\n\n`
      + `State explicitly which class this domain does NOT need, and what would have to change for `
      + `the next class up to be justified.`,
    ),
    common(
      RESEARCH_PREFIXES[1],
      'Map the nine anatomy elements onto this domain\'s agent',
      `Map each of reasoning, memory, inputs, communication, tools, procedures, coordination, `
      + `safeguards and verification onto **${employee}**.\n\n`
      + `For each element, answer with evidence or with "unknown": what exists today, what is `
      + `missing, and what the first honest version looks like. ${m.agent_name ? `Because this agent `
      + `already runs, separate what it DOES from what anyone has APPROVED -- those are different `
      + `questions and the gap between them is the finding.` : `Because no agent exists yet, every `
      + `element is a design question and "unknown" is an acceptable answer.`}\n\n`
      + `Coordination specifically: agent-to-agent handoff does NOT exist in this platform. Record `
      + `what coordination would require rather than describing it as available.`,
    ),
    common(
      RESEARCH_PREFIXES[2],
      `Document ${m.accountable_human}'s role, and which DA responsibilities transition`,
      `Study the employee's role as it is actually performed. Write down the existing Data Analyst `
      + `responsibilities in this domain and which of them are intended to transition to AI.\n\n`
      + `**A warning from discovery:** no document in this repository enumerates DA duties for ANY `
      + `domain. Three independent researchers confirmed this separately. So this story's honest `
      + `output may be "the source material does not exist, and here is what would have to be `
      + `written" -- which is a real deliverable. Do not infer a duty list from a job title.\n\n`
      + `Record each responsibility as: stays human / transitions to AI / splits, with the reason.`,
    ),
    common(
      RESEARCH_PREFIXES[3],
      `Prepare a 30-minute interview with ${m.accountable_human} and propose a weekly check-in`,
      `Produce the interview agenda and the questions, as project work.\n\n`
      + `**This story sends nothing.** No calendar invite, no scheduling link, no attendee list, no `
      + `email. Arranging the meeting is a human action taken outside this project, and this story is `
      + `complete when the agenda exists -- not when a meeting is booked. Any wording that implies a `
      + `meeting is scheduled is wrong.\n\n`
      + `Cover: which capabilities they want first, which must stay human forever, what "good" looks `
      + `like in measurable terms, and what they would want switched off immediately if it misbehaved.`
      + (d.can_reach_surface
        ? `\n\n${m.accountable_human} can reach the agent surface today, so the check-in can review real state.`
        : `\n\n**Blocker to raise in the interview:** ${m.accountable_human} cannot reach the agent `
          + `surface today. ${d.blocker ?? ''} Until that is fixed they cannot see what they are being `
          + `asked to validate.`),
    ),
    common(
      RESEARCH_PREFIXES[4],
      'Capture three proposed agent tasks with boundaries and completion evidence',
      `Pick three candidate tasks for this domain and write each one up with: the tools and data it `
      + `needs, its approval boundary, and what counts as evidence it completed correctly.\n\n`
      + `Choose from this domain's own draft capabilities rather than inventing tasks -- there are `
      + `${capCount} to choose from. For each, state the starting autonomy and the ceiling, and why `
      + `the ceiling is where it is.\n\n`
      + `**Completion evidence may not be any of these:** a story being marked done, time having `
      + `passed, a conversation that went well, or a mocked test passing. This platform already has `
      + `106 approval rows whose only recorded decider is a 4.25-hour timer, which is the failure `
      + `this requirement exists to prevent.`,
    ),
  ];
}

/** One legacy-migration story per domain, generated from its real dispositions. */
/**
 * STORY-000, the Command Center -- the FIRST story of the FIRST release, before any of this
 * domain's own work.
 *
 * Owner instruction, 30 October 2026: everyone builds one, so they can see the whole of what they
 * are being asked to build before they start building it. Its content lives in
 * `agentDomainCommandCenterStory.ts`; this function only places it.
 *
 * Position is not set here. `planProvision` counts stories within their cluster in array order, so
 * being first in the array IS being position 0 -- and the existing ten projects, whose rows are
 * already positioned 0..n, are shifted by the backfill rather than by this generator. See
 * `backfillAgentDomainCommandCenter.ts`.
 */
function commandCenterStory(d: AgentDomain, m: DomainCapabilityMatrix): GeneratedStory {
  return {
    story_id: domainCommandCenterStoryId(d.domain_key),
    // Stays first on the board, and R0 is where "understand what you are about to build" belongs.
    // Being first in this array IS being position 0 within the rung; see the note above.
    release_key: FOUNDATION_STAGE,
    autonomy_stage: FOUNDATION_STAGE,
    // Already carries six criteria in production, written by Phase 1's backfill, which owns them.
    acceptance: [],
    kind: 'command_center',
    title: COMMAND_CENTER_TITLE,
    // Draft like every other story: nothing on any of these projects has been accepted yet, and
    // the one story that rendered as further along than the rest would be the one nobody trusts.
    status: 'draft',
    body: commandCenterBrief(d, m),
    capability_id: null,
    shared_foundation_reason: COMMAND_CENTER_SHARED_FOUNDATION_REASON,
    validation_dependency: COMMAND_CENTER_VALIDATION_DEPENDENCY,
    claude_code_prompt: commandCenterPromptForDomain(d, m),
  };
}

function legacyMigrationStory(d: AgentDomain, m: DomainCapabilityMatrix): GeneratedStory {
  const by = new Map<string, number>();
  for (const row of m.legacy_dispositions) by.set(row.disposition, (by.get(row.disposition) ?? 0) + 1);
  const unknowns = m.legacy_dispositions.filter((r) => r.disposition === 'unknown');
  const retired = m.legacy_dispositions.filter((r) => r.disposition === 'retired');
  const superseded = m.legacy_dispositions.filter((r) => r.disposition === 'superseded');

  const total = m.legacy_dispositions.length;
  const summary = total === 0
    ? `**This domain inherits nothing.** Zero legacy agent records were assigned to it, verified `
      + `against the sliced 246-row inventory rather than assumed from an absence of evidence. An `
      + `empty legacy bucket is not an empty job: this domain still has ${m.capabilities.length} `
      + `candidate capabilities, built from the application, the manager's role and proposed new work.`
    : [...by.entries()].map(([k, v]) => `- **${k}**: ${v}`).join('\n');

  return {
    story_id: `${d.domain_key}.LEGACY-MIGRATION-PLAN`,
    // Same kind of work as the research five: deciding what the agent inherits before it does
    // anything. The migration design maps it to R0 for that reason.
    release_key: FOUNDATION_STAGE,
    autonomy_stage: FOUNDATION_STAGE,
    acceptance: [],
    kind: 'legacy_migration',
    title: 'Legacy migration plan',
    status: 'draft',
    capability_id: null,
    shared_foundation_reason:
      'Required of every project by spec §40. It describes the disposition of a whole inventory '
      + 'rather than the development of one capability.',
    validation_dependency:
      `${m.accountable_human} confirms each retirement before anything is decommissioned. A row `
      + `marked retired is a proposal until then.`,
    body:
      `Disposition of this domain's ${total} inherited legacy agent record(s).\n\n${summary}\n\n`
      + (superseded.length > 0
        ? `### Superseded (${superseded.length}) -- functionality carried forward\n`
          + bullets(superseded.map((r) => `\`${r.agent_name}\` -> ${r.capability_id ?? 'a capability'}: ${r.reason}`))
          + `\n\n`
        : '')
      + (retired.length > 0
        ? `### Retired (${retired.length}) -- and why each is safe to lose\n`
          + bullets(retired.map((r) => `\`${r.agent_name}\`: ${r.reason}`))
          + `\n\n**A \`retire\` marking is not self-justifying.** Across three domains in this `
          + `programme, 28 of 39 rows marked \`retire\` turned out to hold live, reachable code. Each `
          + `retirement above states why, and each needs the manager's confirmation.\n\n`
        : '')
      + (unknowns.length > 0
        ? `### Unresolved (${unknowns.length}) -- what would settle each\n`
          + bullets(unknowns.map((r) => `\`${r.agent_name}\`: ${r.reason}`))
          + `\n\nThese are recorded as \`unknown\` rather than guessed. "No useful legacy `
          + `functionality is silently lost" is the rule, and an unexamined row is exactly where loss `
          + `hides.\n\n`
        : '')
      + `### Not covered by this plan\n`
      + `The 21 legacy records whose \`proposed_owner_domain\` is \`unresolved\` belong to no domain `
      + `and are therefore not in any project's plan. Five of them are live production rows. They `
      + `need an owner decision, and naming that here is the point.`,
    // Claude Code work, same as every other story. See the r0 note above.
    claude_code_prompt: researchPromptFor(`${d.domain_key}.LEGACY-MIGRATION-PLAN`, {
      title: 'Legacy migration plan',
      domainTitle: d.title,
      manager: m.accountable_human,
      storyId: `${d.domain_key}.LEGACY-MIGRATION-PLAN`,
      release: releaseName(FOUNDATION_STAGE),
    }) ?? '',
  };
}


/** `internship.application_intake` -> `application_intake`. The id without its domain prefix. */
const shortCapabilityId = (capabilityId: string): string =>
  capabilityId.split('.').slice(1).join('.');

/** The id of the capability story a per-rung story hangs off. Kept in one place so they agree. */
const capabilityStoryId = (domainKey: string, capabilityId: string): string =>
  `${domainKey}.CAP.${shortCapabilityId(capabilityId)}`;

function implementationStories(d: AgentDomain, m: DomainCapabilityMatrix): GeneratedStory[] {
  return m.capabilities.map((c) => ({
    story_id: capabilityStoryId(d.domain_key, c.capability_id),
    // The capability's OWN recorded starting rung, refused rather than defaulted if it is not a
    // real one. Measured 2026-10-31: all 443 records start at `autonomy:R0`, so every capability
    // story lands on R0 today -- which is accurate, since none of this work has been validated by
    // a manager yet, and it is what `AUTONOMY_RELEASE_MIGRATION.md` predicted ("most are R0").
    release_key: rungOf(c.capability_id, 'starting_autonomy', c.starting_autonomy),
    autonomy_stage: rungOf(c.capability_id, 'starting_autonomy', c.starting_autonomy),
    // Backfilled by AF10.2 on 2026-10-21 for every existing row; that script owns the column for
    // these kinds. The per-rung stories below are different: their criteria are in the data.
    acceptance: [],
    kind: 'implementation' as StoryKind,
    title: c.name,
    // Nothing is validated, so nothing is ready.
    status: 'draft' as StoryStatus,
    body:
      `${c.business_outcome}\n\n`
      + `**Built today:** ${c.implementation_state}. **Requirement validated:** `
      + `${c.requirement_validation_state} -- ${c.validation_dependency}\n\n`
      + (c.blocked_by.length
        ? `**Blocked by**\n${bullets([...c.blocked_by])}\n\n`
        : '')
      + `Full build prompt is attached to this story.`,
    capability_id: c.capability_id,
    shared_foundation_reason: null,
    validation_dependency: c.validation_dependency,
    claude_code_prompt: promptFor(d, m, c),
  }));
}

/**
 * One story per `release_behaviour[]` entry -- **the additive half of Phase 2, and the half that
 * makes the ladder real.**
 *
 * Nothing here is invented. Every capability record already carries an array of
 * `{autonomy, behaviour, acceptance_criteria}`, written during the research pass: 964 entries
 * across the 443 records, spread over all ten rungs. Until now the generator read
 * `release_behaviour[0]`, interpolated three of its fields into one prompt string, and never
 * looked at the rest -- so roughly 520 entries with their own acceptance criteria were invisible
 * to the provisioner. This projects them into rows.
 *
 * The story id EXTENDS the capability story's id with the rung, so the relationship is visible in
 * the id itself and greppable from a board. That is also why `story_id` had to be widened: these
 * reach 81 characters, and at the old 60-char limit 221 pairs of them collided after truncation.
 *
 * A capability's starting rung is deliberately NOT skipped when it also appears in
 * `release_behaviour` (111 entries do). The capability story says "build this capability"; the
 * rung story says "reach this behaviour at this authority level, and here is how it is judged".
 * Those are different pieces of work with different acceptance, and their ids differ, so both
 * stand.
 */
function releaseBehaviourStories(d: AgentDomain, m: DomainCapabilityMatrix): GeneratedStory[] {
  const stories: GeneratedStory[] = [];
  for (const c of m.capabilities) {
    for (const rb of c.release_behaviour) {
      const stage = rungOf(c.capability_id, 'release_behaviour.autonomy', rb.autonomy);
      const level = bareLevel(stage);
      stories.push({
        story_id: `${capabilityStoryId(d.domain_key, c.capability_id)}.${stage}`,
        release_key: stage,
        autonomy_stage: stage,
        kind: 'release_behaviour',
        title: `${c.name} · ${level}`,
        status: 'draft',
        body:
          `**${level} · ${AUTONOMY_MEANINGS[level]}**\n\n${rb.behaviour}\n\n`
          + (RUNG_PLATFORM_GAP[level] ? `${RUNG_PLATFORM_GAP[level]}\n\n` : '')
          + `**How this is judged:** ${rb.acceptance_criteria}\n\n`
          + `Capability: \`${c.capability_id}\`. Its ceiling is **${c.max_permitted_autonomy}**`
          + `${c.max_autonomy_rationale ? ` -- ${c.max_autonomy_rationale}` : ''}.\n\n`
          + (c.human_decision
            ? `**This capability is a human decision.** It stays human-required at every rung, `
              + `forever. Reaching this rung lets the agent prepare, summarise and propose. It `
              + `never lets it decide.\n\n`
            : '')
          + `Reaching a rung makes it eligible for promotion by a named human, on evidence. `
          + `Finishing this story promotes nothing by itself.`,
        capability_id: c.capability_id,
        shared_foundation_reason: null,
        // The criteria are real, written per rung, and go on the row rather than being left for a
        // later backfill the way the first 503 stories were.
        acceptance: [rb.acceptance_criteria],
        validation_dependency: c.validation_dependency,
        claude_code_prompt: promptFor(d, m, c, rb),
      });
    }
  }
  return stories;
}

export function planForDomain(domainKey: string): DomainPlan {
  const d = AGENT_DOMAINS.find((x) => x.domain_key === domainKey);
  if (!d) throw new Error(`Unknown domain '${domainKey}'`);
  const m = loadDomainMatrix(domainKey);
  return {
    domain_key: domainKey,
    releases: RELEASES,
    stories: [
      commandCenterStory(d, m),
      ...researchStories(d, m),
      legacyMigrationStory(d, m),
      ...implementationStories(d, m),
      ...releaseBehaviourStories(d, m),
    ],
  };
}

export function planForAllDomains(): DomainPlan[] {
  return AGENT_DOMAINS.map((d) => planForDomain(d.domain_key));
}

export {
  RESEARCH_PREFIXES, RELEASES, AUTONOMY_RELEASES, LEGACY_RELEASES, FOUNDATION_STAGE,
  capabilityStoryId,
};
// Re-exported so the split out of this module is invisible to everything that imported from it.
export { NotAnAutonomyRungError, type GeneratedRelease } from './agentDomainReleaseLadder';
