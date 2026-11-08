/**
 * AF12.8 - whether an agent's standing directives are ENFORCED or ADVISORY, and which of its
 * conversation surfaces actually inject them.
 *
 * ## The answer is "advisory", for every agent, and that is a finding rather than a default
 *
 * Every read site injects directives as PROMPT TEXT. Nothing in this codebase reads a
 * `manager_directives` row to grant a tool, raise `autonomy_level`, block an action, or
 * otherwise gate anything - see the header of `models/ManagerDirective.ts`. The restrict-only
 * property the directive block claims ("they can only narrow what you do") therefore holds BY
 * CONSTRUCTION, because no grant path reads directives at all, and NOT because directive text
 * is validated. A model may still ignore the instruction, so "enforced" would be a false word
 * for all ten agents, Dara and Reese included.
 *
 * ## What actually differs between agents is REACH, not mechanism
 *
 * The ticket for this work reported that "directives are read at runtime for Dara and Reese
 * only; for every other agent, Ellis included, a directive is recorded but enforced nowhere."
 * The second half does not hold. `agentManagerConversationPrompt.ts` reads directives
 * UNCONDITIONALLY - no name check, no slug list, no enabled gate - so a directive on any agent
 * reaches that agent's manager conversation. What is true is that only Dara and Reese inject
 * directives into their OWN reply runtime, because `buildAgentSystemPrompt` gates the read
 * behind `options?.agentId` and only their two prompt builders pass it.
 *
 * Seven of the remaining eight have no reply runtime for a directive to miss:
 * `agentDomain/domainAgentIdentitySeed.ts` leaves them disabled, at observe, with no
 * capability. Maya is the exception and she is the reason this module reports an unreached
 * surface at all: `maya/mayaReplyService.ts` answers real DMs through
 * `maya/mayaPortalPrompt.ts`, and neither of her prompt builders reads a directive.
 *
 * ## Derived, not asserted
 *
 * The acceptance for AF12.8 requires the answer to come from the runtime rather than be
 * asserted. Two things make that true here:
 *
 *   1. agent identity is resolved through the SAME functions the prompt builders use, so a
 *      posture lookup cannot disagree with them about which row is Dara, Reese or Maya; and
 *   2. `__tests__/directivePosture.test.ts` READS THE PROMPT-BUILDER SOURCES and fails if the
 *      wiring stops matching the table below - including a test that pins Maya's gap, so
 *      closing it forces this file to be updated rather than letting it quietly go stale.
 *      (`communicationSafetyService.journeyHold.test.ts` establishes that technique here.)
 *
 * A hand-maintained list with no such check would be precisely the "asserted" answer the
 * acceptance rules out.
 */
import { getDaraAgentId } from '../curriculum/daraIdentitySeed';
import { getReeseAgentId } from '../reese/reeseIdentitySeed';
import { getMayaAgentId } from '../mayaIdentitySeed';

/** A place an agent's words are produced, and so a place a directive can or cannot reach. */
export type DirectiveSurface = 'manager_conversation' | 'own_reply_runtime';

export interface DirectivePosture {
  /**
   * Always `advisory`. Kept as a field rather than implied so a caller renders the measured
   * answer; if a real gate is ever added, this becomes the one place that changes.
   */
  mechanism: 'advisory';
  /** Why, in one sentence a manager can read without opening the code. */
  mechanismReason: string;
  /** Surfaces that DO inject this agent's directives. */
  injectedBy: DirectiveSurface[];
  /**
   * Surfaces that exist for this agent, are reached by real traffic, and do NOT inject its
   * directives. Non-empty is a defect, not a configuration choice.
   */
  notInjectedBy: DirectiveSurface[];
  /** True when this agent has no reply runtime at all, so there is nothing further to reach. */
  hasOwnReplyRuntime: boolean;
}

const ADVISORY_REASON =
  'Directives are injected as prompt text, never checked as a gate. Nothing reads a directive '
  + 'to grant a tool, raise autonomy, or block an action, so a directive can only narrow what '
  + 'an agent does - but an agent may still fail to follow one.';

/**
 * The agents whose own reply runtime injects directives, by the resolver that identifies them.
 *
 * This list is the module's single claim about the world, and the source-reading test is what
 * keeps it honest: it asserts that exactly these prompt builders pass `agentId` to
 * `buildAgentSystemPrompt`.
 */
const REPLY_RUNTIME_INJECTS: ReadonlyArray<{ resolve: () => Promise<string | null>; who: string }> = [
  { resolve: getDaraAgentId, who: 'dara' },
  { resolve: getReeseAgentId, who: 'reese' },
];

/**
 * Agents with a live reply runtime that does NOT inject directives.
 *
 * Maya is the only entry, and she is here because her DM replies are real traffic rather than a
 * dormant seed. The test pins that her prompt builders still read no directive, so wiring her up
 * breaks the test and moves her into the list above.
 */
const REPLY_RUNTIME_OMITS: ReadonlyArray<{ resolve: () => Promise<string | null>; who: string }> = [
  { resolve: getMayaAgentId, who: 'maya' },
];

/** Resolve a list's agent ids, dropping any that cannot be resolved. Never throws. */
async function idsFor(
  entries: ReadonlyArray<{ resolve: () => Promise<string | null> }>,
): Promise<string[]> {
  const ids = await Promise.all(
    entries.map((e) => e.resolve().catch(() => null)),
  );
  return ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/**
 * The posture for one agent.
 *
 * Fails SOFT and toward the honest answer: if an identity seed cannot be read, the agent is
 * reported as manager-conversation-only, which is the floor every agent is known to have
 * (that read site is unconditional). It never reports a reach it could not confirm.
 */
export async function describeDirectivePosture(agentId: string): Promise<DirectivePosture> {
  const [injecting, omitting] = await Promise.all([
    idsFor(REPLY_RUNTIME_INJECTS),
    idsFor(REPLY_RUNTIME_OMITS),
  ]);

  const replyRuntimeInjects = injecting.includes(agentId);
  const replyRuntimeOmits = omitting.includes(agentId);

  return {
    mechanism: 'advisory',
    mechanismReason: ADVISORY_REASON,
    // The manager conversation is unconditional for every agent, which is why it is not
    // conditional here either.
    injectedBy: replyRuntimeInjects
      ? ['manager_conversation', 'own_reply_runtime']
      : ['manager_conversation'],
    notInjectedBy: replyRuntimeOmits ? ['own_reply_runtime'] : [],
    hasOwnReplyRuntime: replyRuntimeInjects || replyRuntimeOmits,
  };
}

/** Exported for the source-reading test, which checks these against the real wiring. */
export const __posture_wiring = {
  REPLY_RUNTIME_INJECTS: REPLY_RUNTIME_INJECTS.map((e) => e.who),
  REPLY_RUNTIME_OMITS: REPLY_RUNTIME_OMITS.map((e) => e.who),
};
