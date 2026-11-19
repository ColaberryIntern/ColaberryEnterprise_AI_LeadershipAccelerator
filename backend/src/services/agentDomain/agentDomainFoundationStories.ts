/**
 * The shared-foundation stories that are not the Command Center.
 *
 * ## Why this is its own module
 *
 * `agentDomainStoryTemplates.ts` stood at 657 lines against CLAUDE.md's 500-line ceiling at line
 * 152, and it was already 620 before the builder-path change — so this is the extraction that
 * change should have arrived with rather than a refactor for its own sake.
 *
 * The unit is cohesive and the precedent is already in this directory:
 * `agentDomainCommandCenterStory.ts` is the Command Center's own module, so the other
 * shared-foundation stories get theirs. These three are the stories that legitimately belong to a
 * DOMAIN rather than to one capability record — the owner's five research stories, and the legacy
 * migration plan with the disposition prose it renders.
 *
 * Nothing here was rewritten. The blocks moved verbatim, so a `git diff -M` reads as a move and
 * the additive guarantee over the 558 existing story ids is unaffected: every id these emit is
 * computed exactly as it was.
 */

import type { AgentDomain } from './agentDomainRegistry';
import {
  legacyRunTotal,
  liveLegacyRows,
  loadUnresolvedBucket,
  retirementCandidates,
  type CapabilityRecord,
  type DomainCapabilityMatrix,
} from './capabilityRecord';
import { FOUNDATION_STAGE, releaseName } from './agentDomainReleaseLadder';
import { bullets } from './agentDomainCapabilityPrompt';
import { researchPromptFor } from './agentDomainResearchPrompts';
import type { GeneratedStory } from './agentDomainStoryTemplates';

/** The owner's five, verbatim in intent. Prefixes are stable; titles may be reworded. */
export const RESEARCH_PREFIXES = [
  'RESEARCH-1-SYSTEM-CLASSES',
  'RESEARCH-2-AGENT-ANATOMY',
  'RESEARCH-3-ROLE-AND-DA-TRANSITION',
  'RESEARCH-4-MANAGER-INTERVIEW',
  'RESEARCH-5-THREE-PROPOSED-TASKS',
] as const;

/** The five research stories, written against THIS domain rather than in the abstract. */
export function researchStories(d: AgentDomain, m: DomainCapabilityMatrix): GeneratedStory[] {
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
      // This paragraph used to branch on a hardcoded `can_reach_surface` and paste a stored
      // blocker sentence into the story. A story is generated weeks before anyone works it, so
      // baking a live access state into its text guarantees the text is wrong by the time it is
      // read -- and three domains carried a confident "cannot reach the agent surface today" for a
      // manager who could. So the story asks rather than asserts.
      + `\n\n**Confirm first, do not assume:** check whether ${m.accountable_human} can actually `
      + `open their agent's page right now, by asking them to open it while you are both there. `
      + `GET /api/admin/agent-domains reports it per domain and computes it live. If they cannot, `
      + `that is the first thing to raise in the interview, because until it is fixed they cannot `
      + `see what they are being asked to validate.`,
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

/** Dispositions the body renders in their own named section, in the order they appear above. */
const NAMED_DISPOSITIONS: ReadonlySet<string> = new Set(['superseded', 'retired', 'unknown']);

/**
 * Every inherited record the named sections do not already cover.
 *
 * ## The omission this closes
 *
 * The body rendered exactly three disposition classes and silently dropped the rest. Measured
 * across the ten capability matrices on 2026-11-14: **154 of 225 inherited records carry
 * `migrated_to_capability`**, and not one of them appeared anywhere in the brief except inside a
 * count line. For a domain whose every record is migrated -- internship has exactly one, and it
 * is migrated -- the brief genuinely was nothing but counts.
 *
 * Tashima Diah reported it from that single record ("the prompt says the page brief holds each
 * record's disposition, reason and file:line evidence; the brief shown on the story page names
 * only the counts"). She could see one row. The same omission was hiding 68% of the inventory.
 *
 * ## Why this is written as "everything not already named"
 *
 * Listing `migrated_to_capability` explicitly would fix today's case and leave the next new
 * disposition to disappear the same way. The failure was never the missing class, it was that
 * the renderer enumerated classes at all. This one renders the remainder, so a class nobody
 * anticipated is rendered under its own name rather than vanishing.
 *
 * `reason` is what carries the `file:line` evidence in this data: no record in any matrix has an
 * `evidence` array (0 of 225), and the refs are written inline in the reason text. So this
 * prints the reason verbatim rather than inventing a field to read.
 */
export function remainingDispositions(m: DomainCapabilityMatrix): string {
  const rest = m.legacy_dispositions.filter((r) => !NAMED_DISPOSITIONS.has(r.disposition));
  if (rest.length === 0) return '';

  const byClass = new Map<string, typeof rest>();
  for (const r of rest) {
    const k = r.disposition;
    if (!byClass.has(k)) byClass.set(k, []);
    byClass.get(k)!.push(r);
  }

  // Sorted so the same matrix always renders the same bytes: the sync writes a repo commit only
  // when content differs, and a Map iteration order that tracked input order would churn.
  return [...byClass.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, rows]) => {
      const heading = kind === 'migrated_to_capability'
        ? `### Migrated to a capability (${rows.length}) -- the behaviour is kept, under a new owner`
        : `### ${kind} (${rows.length})`;
      const sorted = [...rows].sort((x, y) => x.agent_name.localeCompare(y.agent_name));
      return `${heading}\n`
        + bullets(sorted.map((r) => (r.capability_id
          ? `\`${r.agent_name}\` -> \`${r.capability_id}\`: ${r.reason}`
          : `\`${r.agent_name}\`: ${r.reason}`)))
        + '\n\n';
    })
    .join('');
}

export function legacyMigrationStory(d: AgentDomain, m: DomainCapabilityMatrix): GeneratedStory {
  const by = new Map<string, number>();
  for (const row of m.legacy_dispositions) by.set(row.disposition, (by.get(row.disposition) ?? 0) + 1);
  const unknowns = m.legacy_dispositions.filter((r) => r.disposition === 'unknown');
  const retired = m.legacy_dispositions.filter((r) => r.disposition === 'retired');
  const superseded = m.legacy_dispositions.filter((r) => r.disposition === 'superseded');
  // The undomained bucket, read rather than restated. See the note at the closing section.
  const bucket = loadUnresolvedBucket();

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
      + remainingDispositions(m)
      // Every count here is derived. The literals this replaced -- "21 legacy records" and
      // "Five of them are live production rows" -- went into all ten boards, and the second was
      // wrong: five is the count of rows whose PROPOSED KIND is unresolved, while thirteen are
      // live. `_unresolved.json` recorded that correction on 2026-10-28 and this sentence did not
      // follow, so ten builders were briefed from a superseded number for seventeen days.
      // Found by Tashima Diah on 2026-11-13, checking the brief against its own sources.
      + `### Not covered by this plan\n`
      + `The ${bucket.legacy_row_count} legacy records whose \`proposed_owner_domain\` is `
      + `\`unresolved\` belong to no domain and are therefore not in any project's plan. `
      + `${liveLegacyRows(bucket)} of them are live, with ${legacyRunTotal(bucket).toLocaleString('en-US')} `
      + `runs between them; the ${retirementCandidates(bucket)} proposed for retirement are disabled `
      + `and have never run. They need an owner decision, and naming that here is the point.`,
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
