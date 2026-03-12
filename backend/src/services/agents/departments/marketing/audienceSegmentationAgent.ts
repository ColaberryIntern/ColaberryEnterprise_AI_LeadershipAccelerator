import { Op } from 'sequelize';
import { Visitor, Lead, PageEvent } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptAudienceSegmentationAgent';

export async function runDeptAudienceSegmentationAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    const leads = await Lead.findAll({
      attributes: ['id', 'email', 'company', 'title', 'source', 'created_at'],
      order: [['created_at', 'DESC']],
      limit: 500,
    });

    entitiesProcessed = leads.length;

    const segments: Record<string, { count: number; sample_titles: string[] }> = {
      'Enterprise Buyers': { count: 0, sample_titles: [] },
      'Career Switchers': { count: 0, sample_titles: [] },
      'Technical Professionals': { count: 0, sample_titles: [] },
      'Alumni Prospects': { count: 0, sample_titles: [] },
      'Unclassified': { count: 0, sample_titles: [] },
    };

    for (const lead of leads) {
      const title = ((lead as any).title || '').toLowerCase();
      const company = ((lead as any).company || '').toLowerCase();
      const source = ((lead as any).source || '').toLowerCase();

      let segment = 'Unclassified';

      if (/\b(vp|director|cto|cio|ceo|head of|chief|svp|evp)\b/.test(title) || company.length > 3) {
        segment = 'Enterprise Buyers';
      } else if (/\b(student|graduate|bootcamp|transition|career change|junior)\b/.test(title) || source.includes('career')) {
        segment = 'Career Switchers';
      } else if (/\b(engineer|developer|architect|data|analyst|scientist|technical)\b/.test(title)) {
        segment = 'Technical Professionals';
      } else if (source.includes('alumni') || source.includes('referral')) {
        segment = 'Alumni Prospects';
      }

      segments[segment].count++;
      if (segments[segment].sample_titles.length < 3 && (lead as any).title) {
        segments[segment].sample_titles.push((lead as any).title);
      }
    }

    const segmentBreakdown = Object.entries(segments)
      .filter(([_, data]) => data.count > 0)
      .map(([name, data]) => ({
        segment: name,
        count: data.count,
        percentage: ((data.count / Math.max(entitiesProcessed, 1)) * 100).toFixed(1) + '%',
        sample_titles: data.sample_titles,
      }));

    const recommendations: string[] = [];
    const topSegment = segmentBreakdown.sort((a, b) => b.count - a.count)[0];
    if (topSegment) {
      recommendations.push(`Largest segment: ${topSegment.segment} (${topSegment.percentage}) — prioritize messaging for this audience`);
    }
    const unclassified = segments['Unclassified'].count;
    if (unclassified > entitiesProcessed * 0.3) {
      recommendations.push(`${unclassified} leads (${((unclassified / Math.max(entitiesProcessed, 1)) * 100).toFixed(0)}%) are unclassified — improve lead capture forms`);
    }

    actions.push({
      campaign_id: '',
      action: 'audience_segmentation',
      reason: `Segmented ${entitiesProcessed} leads into audience categories`,
      confidence: 0.83,
      before_state: null,
      after_state: {
        leads_analyzed: entitiesProcessed,
        segments: segmentBreakdown,
        recommendations,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'audience_segmentation',
      result: 'success',
      details: { leads: entitiesProcessed, segments: segmentBreakdown.length },
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
