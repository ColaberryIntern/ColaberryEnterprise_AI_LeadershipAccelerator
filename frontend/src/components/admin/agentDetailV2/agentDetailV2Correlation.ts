import { assignDistinctAvatarColors } from '../../../utils/agentAvatarColor';
import type { AgentDetail } from '../../../services/agentDetailApi';

// Reese Product Phase 1 follow-up (2026-09-18) — Ali, live: "the Employee
// Facts should be connected to capabilities, tools and scheduled work
// tabs... color coordinate the tools so they show up the same place all
// over. Scheduled Work should have their own colors too so in the Employee
// facts section they use the same colors and it's easy to make the link."
//
// Pure derivations over the SAME `detail` object AgentOverviewV2MainColumn
// and AgentOverviewV2Sidebar already both receive as props — each calls
// these independently, and since they're pure functions of the same
// inputs, both columns land on the identical color/timestamp values with
// no state lifted between the two sibling components.
//
// Colors reuse assignDistinctAvatarColors() (agentAvatarColor.ts) — the
// existing, already-accessible 8-color roster palette this codebase uses
// for the org chart's Live Agents cards — rather than inventing a new
// palette. Reese has exactly 4 real Scheduled work rows and well under 8
// distinct tool/side-effect names, so every id gets its own distinct
// color; the function's own documented graceful-reuse-on-overflow behavior
// only matters past 8, which Reese is nowhere near.

/** One color per real "Scheduled work" row, keyed by the sibling AiAgent's
 * `agent_name` — reused as-is in Employee facts so the same behaviour
 * reads as the same color in both places. */
export function scheduledWorkColors(detail: AgentDetail): Record<string, string> {
  return assignDistinctAvatarColors(detail.related_tasks.map((t) => t.agent_name));
}

/** One color per real tool/side-effect name, keyed by the exact string
 * Capabilities' `by_tool` and Employee facts' `tools` list both already
 * use — the same correlation TOOL_INVENTORY.md's `source` field already
 * grounds, just made visible as color instead of only as text. */
export function toolColors(detail: AgentDetail): Record<string, string> {
  const names = new Set<string>();
  for (const t of detail.capabilities.by_tool) names.add(t.tool);
  for (const b of detail.employee_facts?.behaviours ?? []) {
    for (const t of b.tools) names.add(t);
  }
  return assignDistinctAvatarColors(Array.from(names));
}

/**
 * A tool's own "last used" has no direct per-invocation log anywhere in
 * this codebase (TOOL_INVENTORY.md attributes a tool to the controller
 * that calls it, not to individually timestamped calls) — this derives an
 * honest proxy from the owning behaviour's own real activity signal (a
 * cron behaviour's `last_run_at`, or Reese's own most recent real DM for
 * the event-driven behaviours), taking the MOST RECENT such signal across
 * every behaviour that uses the tool. `null` only when no behaviour using
 * that tool has any recorded activity yet — never a fabricated time.
 */
export function toolLastUsed(detail: AgentDetail): Record<string, string | null> {
  const behaviours = detail.employee_facts?.behaviours ?? [];
  const lastRunByAgentName = new Map(detail.related_tasks.map((t) => [t.agent_name, t.last_run_at]));
  const lastMeaningfulAt = detail.employee_facts?.last_meaningful_action?.at ?? null;

  const result: Record<string, string | null> = {};
  for (const b of behaviours) {
    const activityAt = b.scheduled_work_ref ? lastRunByAgentName.get(b.scheduled_work_ref) ?? null : lastMeaningfulAt;
    if (!activityAt) continue;
    for (const tool of b.tools) {
      const existing = result[tool];
      if (!existing || new Date(activityAt) > new Date(existing)) result[tool] = activityAt;
    }
  }
  for (const t of detail.capabilities.by_tool) {
    if (!(t.tool in result)) result[t.tool] = null;
  }
  return result;
}
