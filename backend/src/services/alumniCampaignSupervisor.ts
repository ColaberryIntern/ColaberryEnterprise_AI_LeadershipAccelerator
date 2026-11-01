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
 *
 * `source` exists because C0.12 widened the ramp's safety-threshold pause from alumni
 * campaigns to every campaign type, and this is the only audit entry a safety pause
 * writes. Filing a cold-outbound pause under `alumni_campaign_supervisor` would make the
 * audit trail wrong in the one place somebody would go looking for it, and dropping the
 * entry instead would make a non-alumni pause invisible. Callers pass their own source;
 * the default keeps every existing caller byte-identical.
 */
export async function logSupervisorDecision(
  decision: SupervisorDecision,
  source = 'alumni_campaign_supervisor',
): Promise<void> {
  try {
    await logAiEvent(source, decision.action, undefined, undefined, {
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
    console.error(`[${source}] Failed to log decision:`, err.message);
  }

  console.log(
    `[${source}] ${decision.campaign_name} | Phase ${decision.ramp_phase} | ` +
    `Score: ${decision.health_score} | Action: ${decision.action} | ${decision.reasoning}`,
  );
}
