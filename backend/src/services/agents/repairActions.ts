/**
 * The repair actions OrchestrationAutoRepairAgent is allowed to take — in ONE place.
 *
 * ## Why this file exists
 *
 * The same three action names were written out in three modules that have to agree:
 *
 *   - the repair agent, which logs them (`orchestrationAutoRepairAgent.ts`)
 *   - the permission layer, which allows them (`agentPermissionService.ts`)
 *   - the AI Ops overview, which COUNTS them as "Repairs Today" (`aiOpsService.ts`)
 *
 * The third one did not agree. The counter matches activity rows whose action contains "repair"
 * (`action ILIKE '%repair%'`), and not one of the three names does, so every repair this agent
 * has ever made was absent from the only number on the dashboard that reports repairs. Reported
 * by Quincy on 2026-10-26.
 *
 * The tempting fix is to rename the actions to contain "repair". That would be a one-word change
 * in the agent and a silent break in two other places: `allowedOperations` in the permission
 * layer is a contract checked against these exact strings, and every historical activity row
 * keeps the old name, so a renamed action makes today's repairs countable and yesterday's
 * invisible. Naming them once and having all three consumers read that list fixes the count
 * without touching the contract or the history.
 */

/** Every action name the auto-repair agent may log. The permission layer allows exactly these. */
export const ORCHESTRATION_REPAIR_ACTIONS = [
  'reactivate_prompt',
  'null_broken_fk',
  'null_broken_artifact_fk',
] as const;

export type OrchestrationRepairAction = typeof ORCHESTRATION_REPAIR_ACTIONS[number];

/**
 * Does this activity action represent a repair?
 *
 * Two ways to qualify: the action is one of the named repair actions above, or its text contains
 * "repair" (which is what the dashboard counter has always matched, and what any other agent
 * naming its action `*_repair_*` relies on). Keeping both means the counter gains this agent's
 * repairs without losing anyone else's.
 */
export function isRepairAction(action: string | null | undefined): boolean {
  const text = String(action ?? '').toLowerCase();
  if (!text) return false;
  if (text.includes('repair')) return true;
  return (ORCHESTRATION_REPAIR_ACTIONS as readonly string[]).some((name) => text.includes(name));
}
