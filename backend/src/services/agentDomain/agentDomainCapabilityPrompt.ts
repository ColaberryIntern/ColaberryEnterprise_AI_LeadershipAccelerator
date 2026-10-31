/**
 * The capability build prompt, assembled from one capability's own record.
 *
 * Extracted from `agentDomainStoryTemplates.ts` when projecting the ladder pushed that file past
 * this repo's 500-line hard ceiling. It is the single largest thing that file did and it has one
 * job, so it is the natural thing to lift out.
 *
 * The amendment requires "full, domain-specific Claude Code prompts" carrying the human-operable
 * business process, its tool interface, and the agent behaviour that uses it. Every prompt is
 * assembled from that capability's OWN record, which is why no two are alike -- a shared
 * boilerplate string would be a template wearing a prompt's clothes, and
 * `agentDomainStoryIntegrity.test.ts` asserts each prompt contains content from its own record.
 */
import type { AgentDomain } from './agentDomainRegistry';
import type {
  CapabilityRecord,
  DomainCapabilityMatrix,
  ReleaseBehaviour,
} from './capabilityRecord';
import { isAutonomyStage } from './autonomyLadder';
import { RUNG_PLATFORM_GAP, bareLevel, rungOf } from './agentDomainReleaseLadder';

export function bullets(items: ReadonlyArray<string>, empty = '_none recorded_'): string {
  if (items.length === 0) return empty;
  return items.map((i) => `- ${i}`).join('\n');
}

/**
 * A real, capability-specific Claude Code prompt, assembled from that capability's own record.
 *
 * `focus` names ONE rung's behaviour to build toward. Without it the prompt describes the
 * capability as a whole and quotes the first recorded behaviour, which is what the capability
 * story has always done. With it the prompt is scoped to that rung, which is what a per-rung story
 * needs: the earlier version read `release_behaviour[0]` unconditionally, so every one of a
 * capability's rungs would have shipped the same prompt and the ladder would have been nine copies
 * of one instruction.
 */
export function promptFor(
  d: AgentDomain, m: DomainCapabilityMatrix, c: CapabilityRecord, focus?: ReleaseBehaviour,
): string {
  const first = focus ?? c.release_behaviour[0];
  return [
    `# ${c.name}${focus ? ` · ${bareLevel(rungOf(c.capability_id, 'release_behaviour.autonomy', focus.autonomy))}` : ''}`,
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
      ? (focus
        ? `**This story is one rung: ${focus.autonomy}**\n${focus.behaviour}\n\n`
          + (isAutonomyStage(focus.autonomy) && RUNG_PLATFORM_GAP[bareLevel(focus.autonomy)]
            ? `${RUNG_PLATFORM_GAP[bareLevel(focus.autonomy)]}\n\n`
            : '')
          + `Acceptance: ${focus.acceptance_criteria}\n\n`
          + `**Satisfying this does not promote anything.** It makes ${focus.autonomy} *eligible*.`
          + ` A named human promotes the capability one step, on this evidence. Story completion,`
          + ` elapsed time, a conversation that went well and a passing mocked test are all`
          + ` recorded as non-promoting signals, so none of them moves the rung.`
        : `**First release behaviour (${first.autonomy})**\n${first.behaviour}\n\n`
          + `Acceptance: ${first.acceptance_criteria}`)
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
