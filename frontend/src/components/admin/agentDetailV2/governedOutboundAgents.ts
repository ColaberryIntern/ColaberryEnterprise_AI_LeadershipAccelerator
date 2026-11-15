/**
 * WHICH AGENTS SHOW THE GOVERNED-OUTBOUND SURFACES - AS DATA, NOT AS A BRANCH.
 *
 * Sibling of `explorerPreviewAgents.ts` and written to the same four rules, for the same reason:
 * this folder has already paid for an inline `agent.agent_name === 'Reese'` comparison buried in a
 * service, and the consequence was Maya's Overview rendering blank with nothing on screen saying
 * why. A name comparison buried in a component is that mistake wearing a different file name.
 *
 * ── WHAT THIS GATES ─────────────────────────────────────────────────────────
 *
 * Two surfaces that were standalone pages until 2026-11-15 and now live on the agent workspace:
 *
 *   1. The "Outbound" tab - the queue of messages the agent has composed for a real person,
 *      which deliver only on a per-message human approval.
 *   2. The capability dial section inside "Tools & access" - the off/shadow/review/live mode for
 *      each declared capability.
 *
 * ── WHY ONLY MAYA TODAY, AND WHY THAT IS NOT A PREFERENCE ───────────────────
 *
 * This list is not a product choice about who deserves the screens. It is a statement about which
 * agents have the backing store the screens read. The capability vocabulary
 * (`MayaToolCapability`), its default table and its refusal set are a FROZEN COMPILE-TIME MAP in
 * `backend/src/services/maya/mayaToolGovernance.ts`, and the promotion record is a single
 * `system_settings` row under one key with no agent dimension at all. There is no second agent
 * these surfaces could read for, so adding a name here without first giving that agent its own
 * capability map would render a dial over somebody else's state.
 *
 * The 275 other agents are unaffected: the tab list they render is unchanged, which is what keeps
 * the tab-count budget in `AgentDetailLayout.test.tsx` honest rather than merely passing.
 *
 * ── KEYED ON NAME, NOT ID ───────────────────────────────────────────────────
 *
 * A reviewer can tell whether this list is correct by reading it; a list of UUIDs is unreviewable,
 * and the failure guarded against here is a human one. It also matches how the backend already
 * finds her - `mayaGoLiveRoutes.ts` does `AiAgent.findOne({ where: { agent_name: 'Maya' } })`,
 * never by id, because `ai_agents.id` is database-generated and differs per environment.
 *
 * Adding a name here is a deliberate act that costs one line, one test update, and a capability
 * map. That cost is the point.
 */

/**
 * The agents whose workspace carries the outbound approval queue and the capability dial.
 *
 * Frozen so a caller cannot push onto it at runtime and quietly widen who sees a control that
 * decides whether a real person is contacted.
 */
export const GOVERNED_OUTBOUND_AGENTS: readonly string[] = Object.freeze(['Maya']);

/**
 * Whether this agent's workspace shows the outbound queue and the capability dial.
 *
 * Takes the nullable shape on purpose: the caller reads the name off a fetched detail payload,
 * which is null while loading. An unknown name must mean "no surface" rather than throwing or
 * defaulting to shown - the failure direction matters here, because defaulting to shown would
 * put an approval control on an agent whose messages it does not govern.
 */
export function showsGovernedOutbound(agentName: string | null | undefined): boolean {
  return Boolean(agentName && GOVERNED_OUTBOUND_AGENTS.includes(agentName));
}
