import { logAiEvent } from './aiEventService';

// ── Supervisor Decision Logging ─────────────────────────────────────────

interface SupervisorDecision {
  campaign_id: string;
  campaign_name: string;
  campaign_type: string;
  ramp_phase: number;
  health_score: number | null;
  action: 'advance' | 'hold' | 'reduce_speed' | 'pause' | 'safety_pause';
  reasoning: string;
  safety_flags: string[];
  metrics: Record<string, any>;
}

/**
 * Log a structured supervisor decision for alumni campaigns.
 * Persisted to ai_agent_activity_logs via logAiEvent for full audit trail.
 */
export async function logSupervisorDecision(decision: SupervisorDecision): Promise<void> {
  try {
    await logAiEvent('alumni_campaign_supervisor', decision.action, undefined, undefined, {
      campaign_id: decision.campaign_id,
      campaign_name: decision.campaign_name,
      campaign_type: decision.campaign_type,
      ramp_phase: decision.ramp_phase,
      health_score: decision.health_score,
      action: decision.action,
      reasoning: decision.reasoning,
      safety_flags: decision.safety_flags,
      metrics: decision.metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error(`[AlumniSupervisor] Failed to log decision:`, err.message);
  }

  console.log(
    `[AlumniSupervisor] ${decision.campaign_name} | Phase ${decision.ramp_phase} | ` +
    `Score: ${decision.health_score} | Action: ${decision.action} | ${decision.reasoning}`,
  );
}
