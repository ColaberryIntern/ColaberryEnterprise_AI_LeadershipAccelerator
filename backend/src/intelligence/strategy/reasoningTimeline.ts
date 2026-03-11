// ─── Reasoning Timeline ──────────────────────────────────────────────────────
// Aggregates IntelligenceDecision records into a timeline for the AI COO
// dashboard and governance reasoning log viewer.

import IntelligenceDecision from '../../models/IntelligenceDecision';
import { Op } from 'sequelize';

export interface TimelineEntry {
  time: string;
  problem_detected: string;
  analysis: string;
  decision: string;
  execution: string;
  impact: string;
  trace_id: string;
  confidence: number;
  risk_tier: string;
  risk_score: number;
  execution_status: string;
}

/**
 * Fetch recent autonomous decisions and format as a reasoning timeline.
 */
export async function getReasoningTimeline(limit = 50): Promise<TimelineEntry[]> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000); // Last 48 hours

  const decisions = await IntelligenceDecision.findAll({
    where: { timestamp: { [Op.gte]: since } },
    order: [['timestamp', 'DESC']],
    limit: Math.min(limit, 200),
  });

  return decisions.map((d: any) => {
    const impactEstimate = d.impact_estimate || {};
    const monitorResults = d.monitor_results || {};
    const actionDetails = d.action_details || {};

    // Build impact string from estimate or actual results
    let impactText = '';
    if (d.impact_after_24h) {
      impactText = `Actual: ${JSON.stringify(d.impact_after_24h)}`;
    } else if (impactEstimate.change_pct) {
      impactText = `Expected: ${impactEstimate.metric || 'metric'} ${impactEstimate.change_pct > 0 ? '+' : ''}${impactEstimate.change_pct}%`;
    } else {
      impactText = 'Pending measurement';
    }

    // Build execution string
    let executionText = d.execution_status || 'unknown';
    if (d.executed_at) {
      executionText += ` at ${new Date(d.executed_at).toLocaleTimeString()}`;
    }
    if (d.executed_by) {
      executionText += ` by ${d.executed_by}`;
    }

    return {
      time: d.timestamp ? new Date(d.timestamp).toISOString() : new Date().toISOString(),
      problem_detected: d.problem_detected || 'Unknown problem',
      analysis: d.analysis_summary || 'No analysis available',
      decision: `${d.recommended_action || 'none'}: ${actionDetails.description || actionDetails.parameters?.reason || ''}`.trim(),
      execution: executionText,
      impact: impactText,
      trace_id: d.trace_id || '',
      confidence: d.confidence_score || 0,
      risk_tier: d.risk_tier || 'unknown',
      risk_score: d.risk_score || 0,
      execution_status: d.execution_status || 'unknown',
    };
  });
}
