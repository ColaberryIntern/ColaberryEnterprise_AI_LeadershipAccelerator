/**
 * WHICH AGENTS SHOW THE EXPLORER GROWTH PREVIEW - AS DATA, NOT AS A BRANCH.
 *
 * This list exists because of a defect this exact folder already paid for. Employee facts were
 * gated by `agent.agent_name === 'Reese'` written inline inside a service, and the consequence was
 * Maya's Overview rendering blank: two whole panels removed, with nothing on the screen saying
 * why. `agentDetailService.ts` still carries the comment recording it. A name comparison buried in
 * a component is the same mistake wearing a different file name, so this one is declared, frozen,
 * exported and pinned by a test instead.
 *
 * KEYED ON NAME, NOT ID, deliberately. A reviewer can tell whether this list is correct by reading
 * it. A list of UUIDs is unreviewable, and the failure being guarded against here is a human one.
 *
 * ── WHY ONLY MAYA TODAY ─────────────────────────────────────────────────────
 *
 * Explorer Growth decides the ADMISSIONS journey. Maya is the admissions agent
 * (`ai_agents.category = 'admissions'`, reporting to Taiwo). Reese is student success; Dara is
 * curriculum. Showing either of them a feed of admissions decisions would imply an ownership that
 * does not exist, which is the failure mode this panel is most at risk of: these rows carry no
 * agent attribution at all, so the screen must not invent one.
 *
 * Adding a name here is a deliberate act that costs one line and one test update. That is the
 * point - the cost is what stops it happening by accident.
 */

/**
 * The agents whose Email tab renders the Explorer Growth preview.
 *
 * Frozen so a caller cannot push onto it at runtime and quietly widen who sees the panel.
 */
export const EXPLORER_PREVIEW_AGENTS: readonly string[] = Object.freeze(['Maya']);

/**
 * Whether this agent's Email tab shows the preview.
 *
 * Takes the nullable shape on purpose: the Email tab reads the name out of its own fetched inbox
 * payload, which is null while loading and could in principle arrive without one. An unknown name
 * must mean "no panel" rather than throwing or defaulting to shown.
 */
export function showsExplorerPreview(agentName: string | null | undefined): boolean {
  return Boolean(agentName && EXPLORER_PREVIEW_AGENTS.includes(agentName));
}
