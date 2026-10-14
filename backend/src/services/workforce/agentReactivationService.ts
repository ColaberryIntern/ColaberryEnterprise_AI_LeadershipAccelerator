import AiAgent from '../../models/AiAgent';

// AI Workforce Reset, Phase C (2026-08-24) — Ali, live: "add new ones slowly
// in a way so I can see how they perform." Reactivating an agent deactivated
// in Phase A (agentResetService.ts) is a deliberate act, never a silent flip
// back to unlimited trust: it requires choosing a real autonomy level from
// docs/ai-governance/abac-design.md's 4-level ladder. As of 2026-08-25 this
// choice is REAL: agentAuthorizationService.ts's live shadow-mode gate reads
// it (see that file's resolveLevel()) whenever autonomy_level_set_at is
// stamped below — which is exactly what distinguishes a deliberate reactivation
// choice from the untouched migration default sitting on every other agent.

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
 * `autonomy_level` + `autonomy_level_set_at` in the same update — the three
 * always land together, so an agent can never come back online without a
 * recorded, honestly-timestamped level the real authorization gate will use. */
export async function reactivateAgent(agentId: string, autonomyLevel: AutonomyLevel): Promise<AgentReactivationResult> {
  try {
    const agent = await AiAgent.findByPk(agentId);
    if (!agent) {
      return { agentId, agentName: agentId, found: false, reactivated: false, autonomyLevel: null, error: 'Agent not found' };
    }
    // `autonomy_level_source: 'manual'` added 2026-10-11. This function's own premise is that
    // reactivation is "a deliberate act, never a silent flip back to unlimited trust" -- but until
    // now it recorded only `autonomy_level_set_at`, leaving `source` untouched. That was adequate
    // while this was the ONLY writer of `set_at`. It stopped being adequate when
    // agentAutonomyReclassificationService and classifyAiAgentAutonomyLevels began stamping the
    // same column with `source: 'auto'`: from that point `set_at` no longer distinguished a human
    // choice from a classifier's output, and agentAuthorizationService.resolveLevel -- which keys
    // on `set_at` and never selects `source` -- honoured both identically. The human path now says
    // so about itself, which is what makes the distinction recoverable at all.
    await agent.update({
      enabled: true,
      autonomy_level: autonomyLevel,
      autonomy_level_set_at: new Date(),
      autonomy_level_source: 'manual',
    } as any);
    return { agentId, agentName: agent.agent_name, found: true, reactivated: true, autonomyLevel, error: null };
  } catch (err: any) {
    return { agentId, agentName: agentId, found: true, reactivated: false, autonomyLevel: null, error: err.message };
  }
}

export interface HumanAutonomyDecisionResult {
  agentName: string;
  found: boolean;
  recorded: boolean;
  previous: { level: string | null; source: string | null; setAt: Date | null } | null;
  level: AutonomyLevel | null;
  error: string | null;
}

/**
 * Record a HUMAN decision about an already-enabled agent's autonomy level.
 *
 * Separate from `reactivateAgent` on purpose. That function forces `enabled: true` because its job
 * is bringing a deactivated agent back; using it on a running agent would be the wrong verb and
 * would hide an enablement change inside what is meant to be an authority decision. This one
 * touches three columns and nothing else -- it never changes `enabled`, `status`,
 * `abac_mode_override` or any tool grant.
 *
 * It returns the PREVIOUS values so the caller can record a rollback before the write lands. An
 * authority change with no recorded prior state is not reversible, and an irreversible authority
 * change is not one an agent should be making on a human's behalf.
 */
export async function recordHumanAutonomyDecision(
  agentName: string,
  autonomyLevel: AutonomyLevel,
): Promise<HumanAutonomyDecisionResult> {
  try {
    const agent: any = await AiAgent.findOne({ where: { agent_name: agentName } });
    if (!agent) {
      return { agentName, found: false, recorded: false, previous: null, level: null, error: 'Agent not found' };
    }
    const previous = {
      level: agent.autonomy_level ?? null,
      source: agent.autonomy_level_source ?? null,
      setAt: agent.autonomy_level_set_at ?? null,
    };
    await agent.update({
      autonomy_level: autonomyLevel,
      autonomy_level_set_at: new Date(),
      autonomy_level_source: 'manual',
    } as any);
    return { agentName, found: true, recorded: true, previous, level: autonomyLevel, error: null };
  } catch (err: any) {
    return { agentName, found: true, recorded: false, previous: null, level: null, error: err.message };
  }
}
