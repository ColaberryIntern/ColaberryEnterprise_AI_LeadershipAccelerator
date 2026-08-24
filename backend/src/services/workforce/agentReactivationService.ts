import AiAgent from '../../models/AiAgent';

// AI Workforce Reset, Phase C (2026-08-24) — Ali, live: "add new ones slowly
// in a way so I can see how they perform." Reactivating an agent deactivated
// in Phase A (agentResetService.ts) is a deliberate act, never a silent flip
// back to unlimited trust: it requires choosing a real autonomy level from
// docs/ai-governance/abac-design.md's already-proposed 4-level ladder. This
// column is purely declarative today (see ensureAiAgentAutonomyLevelSchema.ts's
// own header comment) — nothing in this repo enforces it yet; that is real
// enforcement (Phase D), explicitly out of scope and flagged for Ali's
// separate sign-off on abac-design.md's 7 open decisions.

export const AUTONOMY_LEVELS = ['observe', 'suggest', 'act_audited', 'communicate'] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export interface AgentReactivationResult {
  agentId: string;
  agentName: string;
  found: boolean;
  reactivated: boolean;
  autonomyLevel: AutonomyLevel | null;
  error: string | null;
}

/** Re-enables one agent (`enabled:true`) and stamps the real, human-chosen
 * `autonomy_level` in the same update — the two always land together, so an
 * agent can never come back online without a recorded level. */
export async function reactivateAgent(agentId: string, autonomyLevel: AutonomyLevel): Promise<AgentReactivationResult> {
  try {
    const agent = await AiAgent.findByPk(agentId);
    if (!agent) {
      return { agentId, agentName: agentId, found: false, reactivated: false, autonomyLevel: null, error: 'Agent not found' };
    }
    await agent.update({ enabled: true, autonomy_level: autonomyLevel });
    return { agentId, agentName: agent.agent_name, found: true, reactivated: true, autonomyLevel, error: null };
  } catch (err: any) {
    return { agentId, agentName: agentId, found: true, reactivated: false, autonomyLevel: null, error: err.message };
  }
}
