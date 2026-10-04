/**
 * P3-T4 — enforcing what the agent-scoping prompt already asks for.
 *
 * `scopeAgents.ts` instructs the model, in its own words, that *"Every story id above must appear
 * in exactly one agent's `owns`"* (`:147`) and to *"Prefer FEWER agents that each own a coherent
 * slice over one agent per story"* (`:130`). Neither is checked anywhere: `planGate.ts` has **no
 * agent rules at all**, and `scopeAgents`'s own validation tests `Array.isArray(a.owns)` and
 * nothing more. So a roster that leaves a story unowned, assigns one to two agents, or spawns one
 * agent per story passes today — the instruction exists, the enforcement does not.
 *
 * That is the same shape as T2 (a rework loop with no bound) and T3 (allocation with no producer),
 * and it is the pattern worth naming: this phase is mostly not adding new intentions. It is making
 * existing ones checkable.
 *
 * ORDERING, AND WHY THIS DOES NOT TOUCH SBP. The request wants agents scoped BEFORE story
 * generation. SBP deliberately scopes AFTER its gate, and says why at `sbpOrchestrator.ts:315-317`:
 * *"agents describe how the student's system runs, not whether the plan is sound, and a scoping
 * failure must never cost them a publishable build"* — `scopeAgents` returns the plan untouched on
 * any failure. Implementing the request literally there would trade a documented protection for a
 * sequencing preference. So pre-story scoping applies to the BLUEPRINT path only, this module
 * edits nothing under `services/sbp/`, and a test reads the orchestrator to assert its order is
 * unchanged.
 *
 * NO DATABASE. Pure functions over values.
 */

import {
  checkCapabilityClaims,
  type AgentCapabilityClaim,
  type CapabilityDeclaration,
  type CapabilityViolation,
} from './capabilityRegistry';
import { checkRefIntegrity, type ManifestRefs } from '../adapters/manifestRefs';

/** One agent in a blueprint-path roster. */
export interface ScopedAgent {
  id: string;
  /** Story or business-task ids this agent owns. */
  owns: ReadonlyArray<string>;
  /** The coherent slice it covers. Two agents with the same capability are a consolidation smell. */
  capability: string;
  requires?: ReadonlyArray<string>;
  tools?: ReadonlyArray<string>;
}

export const SCOPING_CODES = [
  'STORY_UNOWNED',
  'STORY_DOUBLE_OWNED',
  'AGENT_OWNS_NOTHING',
  'AGENT_PER_STORY',
  'AGENT_NAMESPACE_COLLISION',
  'CAPABILITY_LABEL_UNDECLARED',
] as const;
export type ScopingCode = (typeof SCOPING_CODES)[number];

export interface ScopingViolation {
  code: ScopingCode;
  subject: string;
  message: string;
}

/**
 * Below this many stories, "one agent per story" is not evidence of anything.
 *
 * A three-story build legitimately has three agents. The smell is a roster that scales 1:1 with
 * the work, which only becomes visible with enough work to generalise from — so the rule carries a
 * floor rather than firing on every small plan and training people to ignore it.
 */
export const CONSOLIDATION_FLOOR = 6;

/** Stories owned by no agent, or by more than one. The rule `scopeAgents` asks for and never checks. */
export function checkOwnership(
  stories: ReadonlyArray<string>,
  agents: ReadonlyArray<ScopedAgent>,
): ScopingViolation[] {
  const out: ScopingViolation[] = [];
  const owners = new Map<string, string[]>();
  for (const a of agents) {
    for (const id of a.owns) {
      (owners.get(id) ?? owners.set(id, []).get(id)!).push(a.id);
    }
  }

  for (const story of stories) {
    const who = owners.get(story) ?? [];
    if (who.length === 0) {
      out.push({
        code: 'STORY_UNOWNED',
        subject: story,
        message: `story ${story} is owned by no agent. scopeAgents asks for exactly one owner per `
          + 'story; nothing has ever checked it.',
      });
    } else if (who.length > 1) {
      out.push({
        code: 'STORY_DOUBLE_OWNED',
        subject: story,
        message: `story ${story} is owned by ${who.length} agents (${who.join(', ')}). Two owners `
          + 'is not redundancy, it is an unanswered question about who is accountable.',
      });
    }
  }

  // An agent owning nothing is the other half: the roster looks staffed and one seat does no work.
  for (const a of agents) {
    if (a.owns.length === 0) {
      out.push({
        code: 'AGENT_OWNS_NOTHING',
        subject: a.id,
        message: `agent ${a.id} owns no story. An agent with nothing to do is a name on a roster.`,
      });
    }
  }
  return out;
}

/**
 * Consolidation, enforced rather than preferred.
 *
 * Fires when the roster has one agent per story at or above the floor. Keyed on distinct
 * CAPABILITY rather than on a ratio alone: a roster can legitimately have many agents if they do
 * genuinely different things, and the thing being refused is a roster that mirrors the work
 * breakdown instead of generalising it.
 */
export function checkConsolidation(
  stories: ReadonlyArray<string>,
  agents: ReadonlyArray<ScopedAgent>,
): ScopingViolation[] {
  if (stories.length < CONSOLIDATION_FLOOR) return [];
  if (agents.length < stories.length) return [];

  const distinct = new Set(agents.map((a) => a.capability));
  if (distinct.size >= agents.length) {
    // Every agent claims a different capability, so the roster is at least internally consistent
    // about why it is large. Advisory territory, not this rule's business.
    return [];
  }

  return [{
    code: 'AGENT_PER_STORY',
    subject: `${agents.length} agents / ${stories.length} stories`,
    message: `the roster has ${agents.length} agents for ${stories.length} stories across only `
      + `${distinct.size} distinct capabilities. scopeAgents asks for "FEWER agents that each own a `
      + 'coherent slice over one agent per story"; this mirrors the work breakdown instead of '
      + 'generalising it.',
  }];
}

export interface ScopingReport {
  ok: boolean;
  scoping: ScopingViolation[];
  capability: CapabilityViolation[];
}

/**
 * Validate a blueprint-path agent roster.
 *
 * `refs` is optional because builder/runtime distinctness is a property of the MANIFEST, not of
 * the roster: when refs are supplied the check is delegated to `checkRefIntegrity`, which already
 * computes `agentNamespaceCollisions` over `refs.agents.builder` and `refs.agents.runtime`
 * (`manifestRefs.ts:159-162`). It is reused rather than reimplemented, so a fix there is a fix
 * here.
 */
export function validateAgentScoping(
  stories: ReadonlyArray<string>,
  agents: ReadonlyArray<ScopedAgent>,
  declaration: CapabilityDeclaration,
  refs?: ManifestRefs,
): ScopingReport {
  const scoping = [
    ...checkOwnership(stories, agents),
    ...checkConsolidation(stories, agents),
  ];

  // THE CONSOLIDATION ESCAPE HAD NO PRICE, AND NOW IT HAS ONE.
  //
  // checkConsolidation stands down when every agent claims a distinct `capability`, which is
  // right in principle: a genuinely diverse system should not be punished for being large.
  // But `capability` was free text validated against NOTHING, so the P3-T4 verifier evaded
  // AGENT_PER_STORY entirely with a 12-agent 1:1 roster labelled slice-0..slice-11 - one
  // token of output per agent, and the roster passed clean.
  //
  // Requiring the label to be a DECLARED capability does not make the escape impossible, and
  // claiming otherwise would be the same overstatement the plan made. It makes it cost a
  // declaration entry per agent, which is a thing a reviewer can see and count, rather than
  // a string nobody checks. The remaining same-author weakness is recorded for T6.
  const permittedLabels = new Set(declaration.permitted);
  for (const a of agents) {
    if (!permittedLabels.has(a.capability)) {
      scoping.push({
        code: 'CAPABILITY_LABEL_UNDECLARED',
        subject: a.id,
        message: `agent ${a.id} claims capability '${a.capability}', which this blueprint never `
          + 'declared. An undeclared label cannot excuse a roster from consolidation: that is '
          + 'how one agent per story passes by inventing one capability name per agent.',
      });
    }
  }

  if (refs) {
    for (const id of checkRefIntegrity(refs).agentNamespaceCollisions) {
      scoping.push({
        code: 'AGENT_NAMESPACE_COLLISION',
        subject: id,
        message: `agent id ${id} appears in BOTH the builder and runtime namespaces. They are `
          + 'different populations — one builds the software, one runs the business process — and '
          + 'an id in both makes it impossible to say which was approved.',
      });
    }
  }

  const claims: AgentCapabilityClaim[] = agents.map((a) => ({
    agentId: a.id,
    requires: a.requires ?? [],
    tools: a.tools,
  }));
  const capability = checkCapabilityClaims(claims, declaration);

  return { ok: scoping.length === 0 && capability.length === 0, scoping, capability };
}
