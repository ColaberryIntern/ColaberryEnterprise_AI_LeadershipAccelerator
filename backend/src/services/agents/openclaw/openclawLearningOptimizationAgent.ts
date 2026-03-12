import { Op } from 'sequelize';
import { OpenclawResponse, OpenclawLearning } from '../../../models';
import { sequelize } from '../../../config/database';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * OpenClaw Learning Optimization Agent
 * Analyzes engagement metrics by tone, timing, and topic.
 * Creates learning entries and identifies optimization opportunities.
 */
export async function runOpenclawLearningOptimizationAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const minSampleSize = config.min_sample_size || 10;
  const confidenceThreshold = config.confidence_threshold || 0.7;

  try {
    // Analyze posted responses with engagement data
    const responses = await OpenclawResponse.findAll({
      where: {
        post_status: 'posted',
        engagement_metrics: { [Op.ne]: null as any },
      } as any,
    });

    if (responses.length < minSampleSize) {
      actions.push({
        campaign_id: '',
        action: 'insufficient_data',
        reason: `Only ${responses.length} posted responses with metrics (need ${minSampleSize})`,
        confidence: 1,
        before_state: null,
        after_state: { sample_size: responses.length },
        result: 'skipped',
        entity_type: 'system',
      });
    } else {
      // 1. Tone effectiveness analysis
      const toneGroups: Record<string, { total_engagement: number; count: number }> = {};
      for (const resp of responses) {
        const tone = resp.tone || 'educational';
        const metrics = resp.engagement_metrics || {};
        const engagement = (metrics.upvotes || 0) + (metrics.replies || 0) * 2 + (metrics.clicks || 0) * 3;

        if (!toneGroups[tone]) toneGroups[tone] = { total_engagement: 0, count: 0 };
        toneGroups[tone].total_engagement += engagement;
        toneGroups[tone].count++;
      }

      for (const [tone, data] of Object.entries(toneGroups)) {
        if (data.count < 3) continue;
        const avgEngagement = data.total_engagement / data.count;
        const confidence = Math.min(1, data.count / (minSampleSize * 2));

        await OpenclawLearning.findOrCreate({
          where: { learning_type: 'tone_effectiveness', metric_key: tone },
          defaults: {
            learning_type: 'tone_effectiveness' as any,
            metric_key: tone,
            metric_value: avgEngagement,
            sample_size: data.count,
            confidence,
            insight: `Tone "${tone}" averages ${avgEngagement.toFixed(1)} engagement across ${data.count} responses`,
            details: { avg_engagement: avgEngagement },
            created_at: new Date(),
          },
        }).then(([learning, created]) => {
          if (!created) {
            learning.update({
              metric_value: avgEngagement,
              sample_size: data.count,
              confidence,
              insight: `Tone "${tone}" averages ${avgEngagement.toFixed(1)} engagement across ${data.count} responses`,
              updated_at: new Date(),
            });
          }
        });

        actions.push({
          campaign_id: '',
          action: 'tone_analysis',
          reason: `${tone}: avg engagement ${avgEngagement.toFixed(1)} (n=${data.count}, confidence=${confidence.toFixed(2)})`,
          confidence,
          before_state: null,
          after_state: { tone, avg_engagement: avgEngagement, sample_size: data.count },
          result: 'success',
          entity_type: 'system',
        });
      }

      // 2. Platform timing analysis
      const platformGroups: Record<string, { total_engagement: number; count: number }> = {};
      for (const resp of responses) {
        const key = resp.platform;
        const metrics = resp.engagement_metrics || {};
        const engagement = (metrics.upvotes || 0) + (metrics.replies || 0) * 2;

        if (!platformGroups[key]) platformGroups[key] = { total_engagement: 0, count: 0 };
        platformGroups[key].total_engagement += engagement;
        platformGroups[key].count++;
      }

      for (const [platform, data] of Object.entries(platformGroups)) {
        if (data.count < 3) continue;
        const avgEngagement = data.total_engagement / data.count;
        const confidence = Math.min(1, data.count / (minSampleSize * 2));

        await OpenclawLearning.findOrCreate({
          where: { learning_type: 'platform_timing', metric_key: platform },
          defaults: {
            learning_type: 'platform_timing' as any,
            metric_key: platform,
            metric_value: avgEngagement,
            sample_size: data.count,
            confidence,
            insight: `Platform "${platform}" averages ${avgEngagement.toFixed(1)} engagement across ${data.count} responses`,
            details: { avg_engagement: avgEngagement },
            created_at: new Date(),
          },
        }).then(([learning, created]) => {
          if (!created) {
            learning.update({
              metric_value: avgEngagement,
              sample_size: data.count,
              confidence,
              updated_at: new Date(),
            });
          }
        });
      }
    }
  } catch (err: any) {
    errors.push(err.message || 'Learning optimization error');
  }

  return {
    agent_name: 'OpenclawLearningOptimizationAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.filter((a) => a.result === 'success').length,
  };
}
