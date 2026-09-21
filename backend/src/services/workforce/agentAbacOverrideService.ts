import AiAgent from '../../models/AiAgent';

// Real-enforcement scoping, Phase 3 (2026-09-20) — Ali, live, when approving Phase 1's EXECUTE:
// "I would like a switch for each agent so I can turn off/on Shadow mode." setAgentAbacOverride()
// is the real, deliberate mechanism: the override value and its real audit-trail fields
// (abac_mode_override_set_at/_set_by) always land in the SAME update, mirroring
// agentReactivationService.ts's reactivateAgent() shape exactly — an agent's enforcement mode
// can never be overridden without a recorded, honestly-timestamped, attributed decision.
//
// Setting `override: null` is a real, first-class action: "revert to the global default." It
// is NOT a no-op — it still stamps set_at/set_by, since deliberately clearing an override is
// itself a deliberate act worth recording, distinct from an agent that has simply never been
// touched (whose set_at/set_by both stay null until the very first call here).

export const ABAC_OVERRIDE_VALUES = ['shadow', 'enforce'] as const;
export type AbacOverride = (typeof ABAC_OVERRIDE_VALUES)[number];

export interface AgentAbacOverrideResult {
  agentId: string;
  agentName: string;
  found: boolean;
  updated: boolean;
  override: AbacOverride | null;
  setAt: Date | null;
  setBy: string | null;
  error: string | null;
}

export async function setAgentAbacOverride(
  agentId: string,
  override: AbacOverride | null,
  setByEmail: string,
): Promise<AgentAbacOverrideResult> {
  try {
    const agent = await AiAgent.findByPk(agentId);
    if (!agent) {
      return { agentId, agentName: agentId, found: false, updated: false, override: null, setAt: null, setBy: null, error: 'Agent not found' };
    }
    const setAt = new Date();
    await agent.update({
      abac_mode_override: override,
      abac_mode_override_set_at: setAt,
      abac_mode_override_set_by: setByEmail,
    });
    return { agentId, agentName: agent.agent_name, found: true, updated: true, override, setAt, setBy: setByEmail, error: null };
  } catch (err: any) {
    return { agentId, agentName: agentId, found: true, updated: false, override: null, setAt: null, setBy: null, error: err.message };
  }
}
