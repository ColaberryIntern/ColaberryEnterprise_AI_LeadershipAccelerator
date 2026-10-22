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
 *   r0  Discovery and validation -- the owner's five research/manager-discovery stories, plus the
 *       manager-interview and workflow-validation stories the amendment asks for.
 *   r1  Legacy migration plan -- spec §40. Generated from that domain's real dispositions, so it
 *       says which rows migrate, which are retired or superseded and why, and which are `unknown`.
 *   r2  Capability development -- one story per capability, each traced to its `capability_id`.
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
} from './capabilityRecord';
import { researchPromptFor } from './agentDomainResearchPrompts';

export type StoryKind = 'research' | 'legacy_migration' | 'implementation';
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
}

export interface GeneratedRelease {
  readonly cluster: string;
  readonly name: string;
  readonly position: number;
}

export interface DomainPlan {
  readonly domain_key: string;
  readonly releases: ReadonlyArray<GeneratedRelease>;
  readonly stories: ReadonlyArray<GeneratedStory>;
}

const RELEASES: ReadonlyArray<GeneratedRelease> = [
  { cluster: 'r0', name: 'Discovery and validation', position: 0 },
  { cluster: 'r1', name: 'Legacy migration plan', position: 1 },
  { cluster: 'r2', name: 'Capability development', position: 2 },
];

/** The release's display name for a cluster key, for the prompt header. */
const releaseName = (cluster: string): string =>
  RELEASES.find((r) => r.cluster === cluster)?.name ?? cluster;

/** The owner's five, verbatim in intent. Prefixes are stable; titles may be reworded. */
const RESEARCH_PREFIXES = [
  'RESEARCH-1-SYSTEM-CLASSES',
  'RESEARCH-2-AGENT-ANATOMY',
  'RESEARCH-3-ROLE-AND-DA-TRANSITION',
  'RESEARCH-4-MANAGER-INTERVIEW',
  'RESEARCH-5-THREE-PROPOSED-TASKS',
] as const;

function bullets(items: ReadonlyArray<string>, empty = '_none recorded_'): string {
  if (items.length === 0) return empty;
  return items.map((i) => `- ${i}`).join('\n');
}

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
      release_key: 'r0',
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
        release: releaseName('r0'),
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
    release_key: 'r1',
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
      release: releaseName('r1'),
    }) ?? '',
  };
}

/** A real, capability-specific Claude Code prompt, assembled from that capability's own record. */
function promptFor(d: AgentDomain, m: DomainCapabilityMatrix, c: CapabilityRecord): string {
  const first = c.release_behaviour[0];
  return [
    `# ${c.name}`,
    ``,
    `**Domain:** ${d.title} · **Capability:** \`${c.capability_id}\``,
    `**Accountable human:** ${m.accountable_human} · **Validation state:** ${c.requirement_validation_state}`,
    `**Built today:** ${c.implementation_state} · **Source:** ${c.classification}`,
    ``,
    `## The business outcome`,
    c.business_outcome,
    ``,
    `Intended users: ${c.intended_users.length ? c.intended_users.join(', ') : 'unknown'}.`,
    ``,
    `## The human-operable process, as it works now`,
    `This must be operable by a person before an agent touches it. If a human cannot do it by hand`,
    `against the surfaces below, the agent version has nothing to stand on.`,
    ``,
    `**Workflow**`,
    bullets(c.workflow, '_unknown -- establishing this IS the first task_'),
    ``,
    `**Inputs**`,
    bullets(c.inputs),
    ``,
    `**Outputs**`,
    bullets(c.outputs),
    ``,
    `**Exceptions that must be handled**`,
    bullets(c.exceptions, '_none recorded -- treat that as a gap, not as "none exist"_'),
    ``,
    `## The tool interface`,
    `**Tools this capability requires** (none is one of the eight default-denied capabilities;`,
    `anything that would need one is listed under blockers instead)`,
    bullets(c.required_tools),
    ``,
    `**Application surfaces**`,
    bullets([...c.application_pages, ...c.apis], '_none -- a surface may need building first_'),
    ``,
    `**Source modules**`,
    bullets(c.source_modules),
    ``,
    `**Dependencies**`,
    bullets(c.dependencies),
    ``,
    `## The agent behaviour that uses it`,
    `Starting autonomy **${c.starting_autonomy}**; ceiling **${c.max_permitted_autonomy}**.`,
    c.max_autonomy_rationale ? `Why that ceiling: ${c.max_autonomy_rationale}` : '',
    c.human_decision
      ? `\n**THIS IS A HUMAN DECISION.** It stays human-required at every autonomy level, forever. An`
        + `\nagent may prepare, summarise and propose; it may never decide. No amount of evidence`
        + `\npromotes this into automation.`
      : `\nNot a human-reserved decision, but promotion is still evidence-based and one step at a time.`,
    ``,
    first
      ? `**First release behaviour (${first.autonomy})**\n${first.behaviour}\n\n`
        + `Acceptance: ${first.acceptance_criteria}`
      : `No release behaviour is recorded yet. Defining it is the first piece of work.`,
    ``,
    `## Before you start`,
    bullets(
      c.blocked_by.length > 0 ? [...c.blocked_by] : [],
      '_no recorded blockers -- re-check rather than trusting this_',
    ),
    ``,
    `## Evidence this is done`,
    `Cite the real thing: a named passing test, a measured figure with its query, or a file:line.`,
    `**None of these count:** this story being marked complete, elapsed time, a conversation that`,
    `went well, or a mocked test passing. ${m.accountable_human} evaluates the evidence, and`,
    `${c.requirement_validation_state === 'draft' ? 'nothing here is validated yet' : 'validation is recorded'}.`,
    ``,
    `## Evidence this capability rests on`,
    bullets(c.supporting_evidence, '_none -- which is why this is classified proposed_new_'),
  ].filter((l) => l !== '').join('\n');
}

function implementationStories(d: AgentDomain, m: DomainCapabilityMatrix): GeneratedStory[] {
  return m.capabilities.map((c) => ({
    story_id: `${d.domain_key}.CAP.${c.capability_id.split('.').slice(1).join('.')}`,
    release_key: 'r2',
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

export function planForDomain(domainKey: string): DomainPlan {
  const d = AGENT_DOMAINS.find((x) => x.domain_key === domainKey);
  if (!d) throw new Error(`Unknown domain '${domainKey}'`);
  const m = loadDomainMatrix(domainKey);
  return {
    domain_key: domainKey,
    releases: RELEASES,
    stories: [
      ...researchStories(d, m),
      legacyMigrationStory(d, m),
      ...implementationStories(d, m),
    ],
  };
}

export function planForAllDomains(): DomainPlan[] {
  return AGENT_DOMAINS.map((d) => planForDomain(d.domain_key));
}

export { RESEARCH_PREFIXES, RELEASES };
