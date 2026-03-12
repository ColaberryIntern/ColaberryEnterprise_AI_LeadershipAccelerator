import { Op } from 'sequelize';
import { Lead, Enrollment } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptMentorMatchingAgent';

export async function runDeptMentorMatchingAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    // Get enrolled students with lead data for matching
    const enrollments = await Enrollment.findAll({
      where: { status: { [Op.in]: ['active', 'enrolled'] } },
      limit: 100,
    });

    entitiesProcessed = enrollments.length;

    const matchSuggestions: Array<{
      lead_id: number; title: string; industry: string; match_criteria: string;
    }> = [];

    for (const enrollment of enrollments) {
      const e = enrollment as any;
      if (!e.lead_id) continue;

      const lead = await Lead.findByPk(e.lead_id);
      if (!lead) continue;

      const l = lead as any;
      const title = l.title || 'Unknown';
      const company = l.company || '';
      const industry = company ? `${company} industry` : 'General';

      // Suggest mentor matching based on career profile
      let matchCriteria = 'General AI leadership';
      if (/\b(engineer|developer|architect|technical)\b/i.test(title)) {
        matchCriteria = 'Technical AI implementation mentor';
      } else if (/\b(vp|director|head|chief|c-level)\b/i.test(title)) {
        matchCriteria = 'Executive AI strategy mentor';
      } else if (/\b(manager|lead|supervisor)\b/i.test(title)) {
        matchCriteria = 'Mid-level AI adoption mentor';
      }

      matchSuggestions.push({
        lead_id: e.lead_id,
        title,
        industry,
        match_criteria: matchCriteria,
      });
    }

    const recommendations: string[] = [];
    if (matchSuggestions.length > 0) {
      const byType: Record<string, number> = {};
      matchSuggestions.forEach(m => {
        byType[m.match_criteria] = (byType[m.match_criteria] || 0) + 1;
      });
      recommendations.push(`${matchSuggestions.length} students ready for mentor matching`);
      Object.entries(byType).forEach(([type, count]) => {
        recommendations.push(`${count} students need: ${type}`);
      });
    }

    actions.push({
      campaign_id: '',
      action: 'mentor_matching_analysis',
      reason: `Analyzed ${entitiesProcessed} enrollments for mentor matching`,
      confidence: 0.78,
      before_state: null,
      after_state: {
        enrollments_analyzed: entitiesProcessed,
        match_suggestions: matchSuggestions.length,
        suggestions: matchSuggestions.slice(0, 20),
        recommendations,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'mentor_matching_analysis',
      result: 'success',
      details: { enrollments: entitiesProcessed, suggestions: matchSuggestions.length },
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
