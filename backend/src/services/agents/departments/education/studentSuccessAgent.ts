import { Op } from 'sequelize';
import { Enrollment, Lead, AiAgent } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptStudentSuccessAgent';

export async function runDeptStudentSuccessAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    // Check active enrollments for engagement signals
    const enrollments = await Enrollment.findAll({
      where: { status: { [Op.in]: ['active', 'enrolled'] } },
      limit: 200,
    });

    entitiesProcessed = enrollments.length;
    const atRisk: Array<{ enrollment_id: string; lead_id: number; reason: string }> = [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const enrollment of enrollments) {
      const e = enrollment as any;
      const reasons: string[] = [];

      // Check for stale enrollment (no activity indicator)
      if (e.updated_at && new Date(e.updated_at) < sevenDaysAgo) {
        reasons.push('No activity in 7+ days');
      }

      // Check progress if available
      if (e.progress !== undefined && e.progress !== null && e.progress < 20) {
        reasons.push(`Low progress: ${e.progress}%`);
      }

      if (reasons.length > 0) {
        atRisk.push({
          enrollment_id: e.id,
          lead_id: e.lead_id,
          reason: reasons.join('; '),
        });
      }
    }

    const recommendations: string[] = [];
    if (atRisk.length > 0) {
      recommendations.push(`${atRisk.length} students at risk of disengagement — trigger intervention outreach`);
    }
    if (entitiesProcessed === 0) {
      recommendations.push('No active enrollments found — verify enrollment pipeline');
    }

    actions.push({
      campaign_id: '',
      action: 'student_success_scan',
      reason: `Monitored ${entitiesProcessed} active enrollments`,
      confidence: 0.85,
      before_state: null,
      after_state: {
        enrollments_checked: entitiesProcessed,
        at_risk_count: atRisk.length,
        at_risk_students: atRisk.slice(0, 10),
        recommendations,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'student_success_scan',
      result: 'success',
      details: { enrollments: entitiesProcessed, at_risk: atRisk.length },
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
