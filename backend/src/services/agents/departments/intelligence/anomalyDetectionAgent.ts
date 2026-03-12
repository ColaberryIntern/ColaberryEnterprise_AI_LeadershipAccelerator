import { Op, fn, col } from 'sequelize';
import { Visitor, Lead, AiAgent, PageEvent } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptAnomalyDetectionAgent';

export async function runDeptAnomalyDetectionAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Compare today's metrics to 7-day average
    const visitorsToday = await Visitor.count({
      where: { first_seen_at: { [Op.gte]: oneDayAgo } },
    });
    const visitors7d = await Visitor.count({
      where: { first_seen_at: { [Op.gte]: sevenDaysAgo } },
    });
    const avgVisitorsPerDay = visitors7d / 7;

    const leadsToday = await Lead.count({
      where: { created_at: { [Op.gte]: oneDayAgo } },
    });
    const leads7d = await Lead.count({
      where: { created_at: { [Op.gte]: sevenDaysAgo } },
    });
    const avgLeadsPerDay = leads7d / 7;

    // Agent errors today
    const agentErrorsToday = await AiAgent.count({
      where: { status: 'error', last_error_at: { [Op.gte]: oneDayAgo } },
    });

    entitiesProcessed = visitorsToday + leadsToday;

    const anomalies: Array<{ metric: string; current: number; average: number; deviation: string; severity: string }> = [];

    // Visitor anomaly detection
    if (avgVisitorsPerDay > 0) {
      const deviation = ((visitorsToday - avgVisitorsPerDay) / avgVisitorsPerDay * 100).toFixed(0);
      if (Math.abs(parseFloat(deviation)) > 50) {
        anomalies.push({
          metric: 'Visitors',
          current: visitorsToday,
          average: Math.round(avgVisitorsPerDay),
          deviation: deviation + '%',
          severity: Math.abs(parseFloat(deviation)) > 100 ? 'high' : 'medium',
        });
      }
    }

    // Lead anomaly detection
    if (avgLeadsPerDay > 0) {
      const deviation = ((leadsToday - avgLeadsPerDay) / avgLeadsPerDay * 100).toFixed(0);
      if (Math.abs(parseFloat(deviation)) > 50) {
        anomalies.push({
          metric: 'Leads',
          current: leadsToday,
          average: Math.round(avgLeadsPerDay),
          deviation: deviation + '%',
          severity: Math.abs(parseFloat(deviation)) > 100 ? 'high' : 'medium',
        });
      }
    }

    // Agent error anomaly
    if (agentErrorsToday >= 3) {
      anomalies.push({
        metric: 'Agent Errors',
        current: agentErrorsToday,
        average: 0,
        deviation: 'N/A',
        severity: agentErrorsToday >= 5 ? 'high' : 'medium',
      });
    }

    actions.push({
      campaign_id: '',
      action: 'anomaly_detection',
      reason: `Scanned system metrics for anomalies`,
      confidence: 0.88,
      before_state: null,
      after_state: {
        visitors_today: visitorsToday,
        avg_visitors_per_day: Math.round(avgVisitorsPerDay),
        leads_today: leadsToday,
        avg_leads_per_day: Math.round(avgLeadsPerDay),
        agent_errors_today: agentErrorsToday,
        anomalies_detected: anomalies.length,
        anomalies,
      },
      result: anomalies.length > 0 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'anomaly_detection',
      result: 'success',
      details: { anomalies: anomalies.length },
    }).catch(() => {});
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: entitiesProcessed,
  };
}
