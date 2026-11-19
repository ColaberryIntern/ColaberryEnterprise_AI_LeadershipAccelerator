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
 *   autonomy:R1  .. R9   **nothing, as of 2026-11-13.** These rungs carried one story per
 *                `release_behaviour[]` entry -- 964 of them across the ten boards, of which not
 *                one had ever been completed by anybody while all 100 completions in the
 *                programme sat at R0. A rung is a level of authority a capability earns on
 *                evidence; enumerating all ten up front turned the ladder into a to-do list and
 *                put R5 stories in front of builders who had never once performed the task. The
 *                work now lives in the four-step capability ladder on the capability's own
 *                starting rung. See `agentDomainCapabilityLadder.ts`.
 *   r0, r1, r2   kept, empty. One UPDATE per story restores the previous shape.
 *
 * A capability's four ladder stories -- do it by hand, do it in the app, request the tool, let the
 * agent do it watched -- are emitted only for the ONE capability a domain currently has in flight.
 * The other 433 stay on the board as `implementation` candidates: one line each, explicitly not
 * started and not assigned, because 443 rows that each read like an assignment is how a backlog
 * becomes something a builder cannot see the end of.
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
  legacyRunTotal,
  liveLegacyRows,
  loadDomainMatrix,
  loadUnresolvedBucket,
  retirementCandidates,
  type CapabilityRecord,
  type DomainCapabilityMatrix,
} from './capabilityRecord';
import {
  AUTONOMY_NAMESPACE,
  type AutonomyLevel,
  type AutonomyStage,
} from './autonomyLadder';
import {
  AUTONOMY_RELEASES,
  FOUNDATION_STAGE,
  LEGACY_RELEASES,
  RELEASES,
  releaseName,
  rungOf,
  type GeneratedRelease,
} from './agentDomainReleaseLadder';
import { capabilityLadderStories } from './agentDomainCapabilityLadder';
import { builderPathStories, gateStories } from './builderPathStories';
import {
  RESEARCH_PREFIXES,
  legacyMigrationStory,
  remainingDispositions,
  researchStories,
} from './agentDomainFoundationStories';
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
  | 'command_center' | 'research' | 'legacy_migration' | 'implementation' | 'release_behaviour'
  /**
   * One of the four steps of `agentDomainCapabilityLadder` -- by hand, in the app, tool request,
   * agent watched. Emitted only for the capabilities a domain currently has IN FLIGHT.
   *
   * `release_behaviour` is retained in this union because ten domains' worth of rows in production
   * still carry it and a reader of that data needs the type to exist. Nothing generates it any
   * more; see `capabilityLadderStories` for why.
   */
  | 'capability_ladder'
  /**
   * One capability the CURRENT rung's gate requires the agent to do under watch.
   *
   * Its own kind, not `capability_ladder`, because it traces to the RUNG rather than to a
   * capability record: how many a rung needs is fixed by `GATE_SIZE_BY_RUNG`, but WHICH
   * capabilities satisfy it is the builder's choice. Filing it under a traced kind with a
   * null `capability_id` made the traced-kind invariant false for 7,202 rows, which is how
   * this was caught.
   */
  | 'rung_gate';
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

/** `internship.application_intake` -> `application_intake`. The id without its domain prefix. */
const shortCapabilityId = (capabilityId: string): string =>
  capabilityId.split('.').slice(1).join('.');

/** The id of the capability story a per-rung story hangs off. Kept in one place so they agree. */
const capabilityStoryId = (domainKey: string, capabilityId: string): string =>
  `${domainKey}.CAP.${shortCapabilityId(capabilityId)}`;

/**
 * One row per capability -- **the candidate list, not the work.**
 *
 * These were already one story per capability and they still are. What changed is what they SAY.
 * A capability that is not in flight is now explicitly labelled a candidate that nobody has
 * started and nobody is assigned to, because 443 rows that each read like an assignment is how a
 * backlog becomes something a builder cannot see the end of. The capability currently in flight
 * says so, and points at its four ladder stories.
 */
function implementationStories(
  d: AgentDomain, m: DomainCapabilityMatrix, live: ReadonlySet<string>,
): GeneratedStory[] {
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
      (live.has(c.capability_id)
        ? `**IN FLIGHT.** This capability is the one this domain is building right now. The work `
          + `itself is its four ladder stories -- do it by hand, do it in the app, request the `
          + `tool, then let the agent do it watched -- and they run in that order. This row is `
          + `the capability they belong to, not a fifth piece of work.\n\n`
        : `**CANDIDATE -- not started, not assigned.** This is one line on this domain's list of `
          + `everything its agent could eventually do. It becomes real work only when the builder `
          + `picks it and their manager agrees, at which point it opens as four stories. Until `
          + `then it is deliberately inert, and the honest status of it is "not started" rather `
          + `than "behind".\n\n`)
      + `${c.business_outcome}\n\n`
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
 * The four ladder stories, for the capabilities this domain currently has IN FLIGHT.
 *
 * **This replaced one story per `release_behaviour[]` entry**, which projected each capability's
 * behaviour once per rung of the autonomy ladder. Measured against production on 2026-11-13, that
 * shape had produced 964 behaviour stories across ten domains with **zero completions by anybody**,
 * while all 100 completions in the programme sat at R0. The full evidence, and why a rung is not a
 * unit of work, is in the header of `agentDomainCapabilityLadder.ts`.
 *
 * Nothing in the capability data was thrown away. The `release_behaviour[]` entries are still the
 * source of the step 4 acceptance criteria and of the rung-focused prompt; they are simply no
 * longer each a row on somebody's board.
 */
function capabilityLadderStoriesFor(
  d: AgentDomain, m: DomainCapabilityMatrix, live: ReadonlySet<string>,
): GeneratedStory[] {
  const stories: GeneratedStory[] = [];
  for (const c of m.capabilities) {
    if (!live.has(c.capability_id)) continue;
    // The three NEW stages first, then the four that already existed. `builderPathStories` gives
    // its rows a negative `step_number` so they sort ahead without renumbering the four titles
    // people have been reading for a month, and both lists go through THIS adapter rather than a
    // second one that could drift from it.
    const ladder = capabilityLadderStories(d, m, c);
    const stage = ladder[0]?.autonomy_stage ?? FOUNDATION_STAGE;
    for (const s of [...builderPathStories(d, m, c, stage), ...ladder]) {
      stories.push({
        story_id: s.story_id,
        release_key: s.autonomy_stage,
        autonomy_stage: s.autonomy_stage,
        kind: 'capability_ladder',
        title: s.title,
        // Draft for the same reason every other capability story is: no manager has validated the
        // requirement. The ladder changes the shape of the work, not who may approve it.
        status: 'draft',
        body: s.body,
        capability_id: c.capability_id,
        shared_foundation_reason: null,
        acceptance: s.acceptance,
        validation_dependency: c.validation_dependency,
        claude_code_prompt: s.claude_code_prompt,
      });
    }
  }
  return stories;
}

/**
 * Which capabilities a domain has in flight.
 *
 * **The default is exactly one**, and that is the whole point of the change: a builder holds four
 * stories, not 136. The other capabilities remain on the board as `implementation` candidates --
 * one line each, not started, not assigned -- and a capability becomes live when the builder picks
 * it and their domain manager agrees.
 *
 * The default pick is the FIRST capability in the domain's own matrix, which is the order the
 * research pass wrote them in. That is a defensible seed rather than a considered choice, and it
 * is logged as an assumption precisely so nobody mistakes it for one: the builder is expected to
 * swap it in their first conversation with their manager, and swapping it costs one argument to
 * this function.
 *
 * Passing an explicit list overrides it. Passing an empty list is legal and means the domain has
 * nothing in flight -- an unstaffed domain, or one between capabilities.
 */
export function liveCapabilityIds(
  m: DomainCapabilityMatrix, selected?: ReadonlyArray<string>,
): ReadonlySet<string> {
  if (selected) {
    const known = new Set(m.capabilities.map((c) => c.capability_id));
    const unknown = selected.filter((id) => !known.has(id));
    if (unknown.length) {
      throw new Error(
        `Domain '${m.domain_key}' has no capability ${unknown.map((u) => `'${u}'`).join(', ')}`,
      );
    }
    return new Set(selected);
  }
  const first = m.capabilities[0];
  return new Set(first ? [first.capability_id] : []);
}

export interface PlanOptions {
  /**
   * The capability ids this domain is currently building, overriding the one-capability default.
   * An empty array means nothing is in flight.
   */
  readonly liveCapabilityIds?: ReadonlyArray<string>;
}

export function planForDomain(domainKey: string, options: PlanOptions = {}): DomainPlan {
  const d = AGENT_DOMAINS.find((x) => x.domain_key === domainKey);
  if (!d) throw new Error(`Unknown domain '${domainKey}'`);
  const m = loadDomainMatrix(domainKey);
  const live = liveCapabilityIds(m, options.liveCapabilityIds);
  return {
    domain_key: domainKey,
    releases: RELEASES,
    stories: [
      commandCenterStory(d, m),
      ...researchStories(d, m),
      legacyMigrationStory(d, m),
      ...implementationStories(d, m, live),
      ...capabilityLadderStoriesFor(d, m, live),
      // Option C made visible. One story per capability the CURRENT rung's gate requires, so a
      // builder can tell "two of four done" from "something is broken".
      //
      // THE CURRENT RUNG ONLY, not all ten. Emitting every rung's gate would add 30 rows per
      // board and 300 across the ten, undoing most of the condensation this restructure exists
      // for -- the same mistake Phase 2 made when it projected all ten rungs of every capability
      // into 964 stories, not one of which anybody ever completed. A domain sits on ONE rung at a
      // time; when it advances, the generator emits that rung's gate and option C makes the
      // target rise.
      ...gateStoriesFor(d, rungForDomain(m, live)),
    ],
  };
}

/**
 * The per-rung gate stories as `GeneratedStory` rows.
 *
 * `capability_id` is null and the reason is stated, the same shape `commandCenterStory` uses for
 * the same situation: a story that legitimately belongs to the domain rather than to one record.
 */
function gateStoriesFor(d: AgentDomain, rung: AutonomyLevel): GeneratedStory[] {
  return gateStories(d, rung).map((g) => ({
    story_id: g.story_id,
    release_key: g.autonomy_stage,
    autonomy_stage: g.autonomy_stage,
    kind: 'rung_gate' as const,
    title: g.title,
    status: 'draft' as const,
    body: g.body,
    capability_id: null,
    shared_foundation_reason:
      'The gate belongs to the rung, not to one capability. How many capabilities a rung requires '
      + 'is fixed by GATE_SIZE_BY_RUNG; WHICH ones satisfy it is the builder\'s choice, so tying '
      + 'this row to a capability record would make that choice for them.',
    // Named rather than left blank. Every story on these boards says who must validate it,
    // and a gate is validated by the person accountable for the domain, because clearing a
    // rung is a statement about authority rather than about one piece of work.
    validation_dependency:
      `The accountable human for ${d.domain_key} confirms that each capability counted `
      + 'toward this gate was genuinely run by the agent, watched, and approved by a named '
      + 'person before it took effect.',
    claude_code_prompt: '',
    acceptance: g.acceptance,
  }));
}

/**
 * The rung this domain currently sits on.
 *
 * Read from the capability it has IN FLIGHT, because that is what the ladder stories already
 * hang off, so the gate and the path cannot end up on different rungs. All 443 capability
 * records name `autonomy:R0` today, measured, so every domain's gate is R0's single story
 * until one of them advances.
 */
function rungForDomain(m: DomainCapabilityMatrix, live: ReadonlySet<string>): AutonomyLevel {
  const first = m.capabilities.find((c) => live.has(c.capability_id));
  const stage = first
    ? rungOf(first.capability_id, 'starting_autonomy', first.starting_autonomy)
    : FOUNDATION_STAGE;
  return stage.replace(AUTONOMY_NAMESPACE, '') as AutonomyLevel;
}

export function planForAllDomains(
  options: Readonly<Record<string, PlanOptions>> = {},
): DomainPlan[] {
  return AGENT_DOMAINS.map((d) => planForDomain(d.domain_key, options[d.domain_key] ?? {}));
}

// Re-exported so splitting the foundation stories out of this module is invisible to
// everything that imported from it, the same contract the release-ladder split already has.
export {
  RESEARCH_PREFIXES, RELEASES, AUTONOMY_RELEASES, LEGACY_RELEASES, FOUNDATION_STAGE,
  capabilityStoryId, remainingDispositions,
};
// Re-exported so the split out of this module is invisible to everything that imported from it.
export { NotAnAutonomyRungError, type GeneratedRelease } from './agentDomainReleaseLadder';
