import { Op } from 'sequelize';
import { Lead, Enrollment } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptScholarshipAllocationAgent';

export async function runDeptScholarshipAllocationAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    // Analyze lead-to-enrollment conversion for scholarship impact
    const totalLeads = await Lead.count();
    const totalEnrollments = await Enrollment.count();
    const activeEnrollments = await Enrollment.count({
      where: { status: { [Op.in]: ['active', 'enrolled'] } },
    });

    entitiesProcessed = totalLeads;

    const conversionRate = totalLeads > 0
      ? ((totalEnrollments / totalLeads) * 100).toFixed(1)
      : '0';

    // Lead source analysis for scholarship targeting
    const leads = await Lead.findAll({
      attributes: ['source'],
      where: { source: { [Op.ne]: null } } as any,
    });

    const sourceCounts: Record<string, number> = {};
    for (const lead of leads) {
      const source = (lead as any).source || 'unknown';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    }

    const sourceBreakdown = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([source, count]) => ({ source, count }));

    const recommendations: string[] = [];
    if (parseFloat(conversionRate) < 10) {
      recommendations.push(`Conversion rate is ${conversionRate}% — scholarships may improve enrollment`);
    }
    if (activeEnrollments < 5) {
      recommendations.push('Low active enrollment count — consider expanding scholarship offers');
    }
    recommendations.push(`Top lead sources: ${sourceBreakdown.slice(0, 3).map(s => s.source).join(', ')} — target scholarships to these channels`);

    actions.push({
      campaign_id: '',
      action: 'scholarship_analysis',
      reason: `Analyzed scholarship allocation across ${entitiesProcessed} leads`,
      confidence: 0.78,
      before_state: null,
      after_state: {
        total_leads: totalLeads,
        total_enrollments: totalEnrollments,
        active_enrollments: activeEnrollments,
        conversion_rate: conversionRate + '%',
        source_breakdown: sourceBreakdown,
        recommendations,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'scholarship_analysis',
      result: 'success',
      details: { leads: totalLeads, enrollments: totalEnrollments, conversion: conversionRate },
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
