/**
 * WHICH AGENTS MAY ONLY BE SWITCHED ON BY ALI - AS DATA, NOT AS A BRANCH.
 *
 * ── THE HOLE THIS CLOSES ────────────────────────────────────────────────────
 *
 * On 2026-11-15, `mayaGoLiveRoutes.ts` shipped with an in-handler
 * `isCoryAuthorizedIdentity` check so that enabling Maya is Ali's or a super_admin's while
 * disabling her stays any admin's. `MAYA_GOVERNANCE.md` then stated that as a fact:
 * "Turn her agent row ON | Ali or a super_admin".
 *
 * It was not a fact. `POST /api/admin/workforce/agents/:id/reactivate` has been
 * `requireAdmin` since 2026-08-24 and calls `reactivateAgent()`, which writes `enabled: true`
 * on ANY agent found by id - Maya included. The agent workspace's own "Reactivate" button
 * calls it. So the stricter gate guarded one door of a room with two, and the claim in the
 * doc described the locked one.
 *
 * A gate that one route enforces and a sibling route does not is not a gate. This list is
 * what makes it one: the check lives at the route that can actually write the column, so
 * every caller inherits it rather than every caller having to remember it.
 *
 * ── WHY A LIST RATHER THAN A COLUMN ─────────────────────────────────────────
 *
 * A column on `ai_agents` would be editable by anything that can write that table, which
 * includes the very writes this is meant to constrain, and it would make "who may turn this
 * agent on" a runtime value rather than a reviewed one. A frozen compile-time list is
 * reviewable in a diff and cannot be widened by a query.
 *
 * ── KEYED ON NAME, NOT ID ───────────────────────────────────────────────────
 *
 * `ai_agents.id` is database-generated and differs per environment, so a list of UUIDs would
 * be correct in production and silently empty everywhere else - the worst failure shape for a
 * safety check, because it passes its tests locally. Every other Maya lookup in this codebase
 * is already by `agent_name` for the same reason.
 *
 * ── WHAT THIS DOES NOT GATE ─────────────────────────────────────────────────
 *
 * Deactivation. `POST /api/admin/workforce/agents/reset` stays open to any admin, deliberately
 * and permanently: silencing an agent during an incident must never wait on one person. The
 * asymmetry is the whole design - widening is Ali's, narrowing is anyone's.
 */

/** The agents whose `enabled` column may only be set TRUE by Ali or a super_admin. */
export const GOVERNED_ENABLEMENT_AGENTS: readonly string[] = Object.freeze(['Maya']);

/**
 * Whether turning this agent ON requires Ali's own identity.
 *
 * Nullable input returns FALSE, which is the safe direction here and worth stating because the
 * opposite reflex would be wrong. This function does not decide whether an action is allowed; it
 * decides whether an EXTRA restriction applies on top of `requireAdmin`. Returning true for an
 * unknown name would lock admins out of agents this was never meant to cover, and the caller
 * always resolves a real row before asking.
 */
export function enablementRequiresAli(agentName: string | null | undefined): boolean {
  return Boolean(agentName && GOVERNED_ENABLEMENT_AGENTS.includes(agentName));
}
