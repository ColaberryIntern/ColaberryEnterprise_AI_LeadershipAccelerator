import AiAgent from '../models/AiAgent';
import { classifyAgentAutonomyLevel } from './agentCapabilityClassifier';

// Fleet-wide autonomy-level auto-classification, Phase 4 (2026-09-14) — Ali:
// "Can I be confident that moving forward when agents are created and they
// get their skills advance, this will be in sync?" This is the real answer.
// Called from agentRegistrySeed.ts's seedAgentRegistry() loop, the only
// place an agent's real tools_granted ever changes. Modeled directly on
// agentPersonaVersionHistoryService.ts's recordPersonaVersionChangeIfNeeded:
// same idempotency posture (act only on a genuine change, never on a no-op
// reseed — every boot, for the ~200 agents whose entry hasn't changed), same
// swallow-safe posture (a failure classifying ONE agent must never abort
// the loop for every agent after it).
//
// Asymmetric by source, to respect a real human decision: an agent whose
// autonomy_level_source is 'auto' (or null — never touched by anything) gets
// re-classified and re-stamped automatically. An agent a human has manually
// set (autonomy_level_source: 'manual', via agentReactivationService.ts's
// reactivateAgent()) is NEVER silently overwritten — this only logs a real
// structured staleness signal (CLAUDE.md's Observability Framework) so the
// drift is visible, without inventing a new persisted staleness field
// beyond this phase's real scope.

async function applyAutoClassification(
  agent: InstanceType<typeof AiAgent>,
  toolsGranted: string[] | null,
  event: 'autonomy_level_auto_classified_on_create' | 'autonomy_level_auto_classified_on_update',
): Promise<void> {
  const { level, reason, matchedTool } = classifyAgentAutonomyLevel(toolsGranted);
  await agent.update({ autonomy_level: level, autonomy_level_set_at: new Date(), autonomy_level_source: 'auto' });
  console.log(JSON.stringify({
    level: 'info', service: 'agentAutonomyReclassificationService', event,
    agent_name: agent.agent_name, new_level: level, matched_tool: matchedTool, reason,
  }));
}

/** Brand-new agent, just created by findOrCreate — always classified
 * immediately using its real starting tools_granted (or the safe `observe`
 * default when the registry entry declares none at all), so no agent is
 * ever born into the old ambiguous "untouched default, null source" limbo. */
export async function classifyNewAgentAutonomyLevel(
  agent: InstanceType<typeof AiAgent>,
  toolsGranted: string[] | null | undefined,
): Promise<void> {
  try {
    await applyAutoClassification(agent, toolsGranted ?? null, 'autonomy_level_auto_classified_on_create');
  } catch (err: any) {
    console.warn(`[AI Ops] Failed to auto-classify new agent ${agent.agent_name}: ${err?.message}`);
  }
}

/** Existing agent being re-seeded — reclassifies ONLY when tools_granted
 * genuinely changed this boot (never on the common no-op reseed) and only
 * when nothing has ever silently overridden a real human's own choice. */
export async function maybeReclassifyAutonomyLevel(
  agent: InstanceType<typeof AiAgent>,
  previousToolsGranted: string[] | null,
  newToolsGranted: string[] | null | undefined,
): Promise<void> {
  if (newToolsGranted === undefined) return; // this registry entry doesn't declare tools_granted at all
  const changed = JSON.stringify(previousToolsGranted ?? null) !== JSON.stringify(newToolsGranted ?? null);
  if (!changed) return; // no real change — the common case on every boot

  try {
    const source = agent.autonomy_level_source ?? null;
    if (source === 'manual') {
      console.warn(JSON.stringify({
        level: 'warn', service: 'agentAutonomyReclassificationService', event: 'autonomy_level_stale',
        agent_name: agent.agent_name,
        message: "tools_granted changed since a human manually set this agent's autonomy_level — not auto-overwritten.",
      }));
      return;
    }
    await applyAutoClassification(agent, newToolsGranted, 'autonomy_level_auto_classified_on_update');
  } catch (err: any) {
    console.warn(`[AI Ops] Failed to reclassify autonomy_level for ${agent.agent_name}: ${err?.message}`);
  }
}
