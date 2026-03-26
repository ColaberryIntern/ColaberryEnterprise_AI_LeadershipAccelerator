import { Op } from 'sequelize';
import { OpenclawResponse, OpenclawLearning, OpenclawSignal, EngagementEvent, OpenclawConversation } from '../../../models';
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

      // 3. Platform × Tone combo analysis
      const comboGroups: Record<string, { total_engagement: number; count: number; platform: string; tone: string }> = {};
      for (const resp of responses) {
        const tone = resp.tone || 'educational';
        const platform = resp.platform;
        const key = `${platform}::${tone}`;
        const metrics = resp.engagement_metrics || {};
        const engagement = (metrics.engagement_score || 0) || ((metrics.upvotes || 0) + (metrics.replies || 0) * 2 + (metrics.clicks || 0) * 3);

        if (!comboGroups[key]) comboGroups[key] = { total_engagement: 0, count: 0, platform, tone };
        comboGroups[key].total_engagement += engagement;
        comboGroups[key].count++;
      }

      for (const [key, data] of Object.entries(comboGroups)) {
        if (data.count < 3) continue;
        const avgEngagement = data.total_engagement / data.count;
        const confidence = Math.min(1, data.count / (minSampleSize * 2));

        await OpenclawLearning.findOrCreate({
          where: { learning_type: 'platform_tone_combo', metric_key: key },
          defaults: {
            learning_type: 'platform_tone_combo' as any,
            platform: data.platform,
            metric_key: key,
            metric_value: avgEngagement,
            sample_size: data.count,
            confidence,
            insight: `On ${data.platform}, "${data.tone}" tone averages ${avgEngagement.toFixed(1)} engagement (n=${data.count})`,
            details: { platform: data.platform, tone: data.tone, avg_engagement: avgEngagement },
            created_at: new Date(),
          },
        }).then(([learning, created]) => {
          if (!created) {
            learning.update({
              metric_value: avgEngagement,
              sample_size: data.count,
              confidence,
              insight: `On ${data.platform}, "${data.tone}" tone averages ${avgEngagement.toFixed(1)} engagement (n=${data.count})`,
              updated_at: new Date(),
            });
          }
        });

        actions.push({
          campaign_id: null,
          action: 'platform_tone_analysis',
          reason: `${data.platform}/${data.tone}: avg ${avgEngagement.toFixed(1)} (n=${data.count})`,
          confidence,
          before_state: null,
          after_state: { platform: data.platform, tone: data.tone, avg_engagement: avgEngagement, sample_size: data.count },
          result: 'success',
          entity_type: 'system',
        });
      }

      // 4. Topic performance — extract keywords from signal titles via response.signal_id
      const topicGroups: Record<string, { total_engagement: number; count: number }> = {};
      for (const resp of responses) {
        const metrics = resp.engagement_metrics || {};
        const engagement = (metrics.engagement_score || 0) || ((metrics.upvotes || 0) + (metrics.replies || 0) * 2 + (metrics.clicks || 0) * 3);
        if (engagement === 0) continue;

        // Look up signal for topic keywords
        const signal = resp.signal_id ? await OpenclawSignal.findByPk(resp.signal_id) : null;
        const titleText = (signal as any)?.title || '';
        const tags: string[] = (signal as any)?.topic_tags || [];

        // Extract keywords: use topic_tags if available, else split title
        const keywords = tags.length > 0
          ? tags.map((t: string) => t.toLowerCase().trim())
          : titleText.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4).slice(0, 5);

        for (const kw of keywords) {
          if (!topicGroups[kw]) topicGroups[kw] = { total_engagement: 0, count: 0 };
          topicGroups[kw].total_engagement += engagement;
          topicGroups[kw].count++;
        }
      }

      for (const [keyword, data] of Object.entries(topicGroups)) {
        if (data.count < 3) continue;
        const avgEngagement = data.total_engagement / data.count;
        const confidence = Math.min(1, data.count / (minSampleSize * 2));

        await OpenclawLearning.findOrCreate({
          where: { learning_type: 'topic_performance', metric_key: keyword },
          defaults: {
            learning_type: 'topic_performance' as any,
            metric_key: keyword,
            metric_value: avgEngagement,
            sample_size: data.count,
            confidence,
            insight: `Topic "${keyword}" averages ${avgEngagement.toFixed(1)} engagement (n=${data.count})`,
            details: { keyword, avg_engagement: avgEngagement },
            created_at: new Date(),
          },
        }).then(([learning, created]) => {
          if (!created) {
            learning.update({
              metric_value: avgEngagement,
              sample_size: data.count,
              confidence,
              insight: `Topic "${keyword}" averages ${avgEngagement.toFixed(1)} engagement (n=${data.count})`,
              updated_at: new Date(),
            });
          }
        });
      }

      const topTopics = Object.entries(topicGroups)
        .filter(([, d]) => d.count >= 3)
        .sort((a, b) => (b[1].total_engagement / b[1].count) - (a[1].total_engagement / a[1].count))
        .slice(0, 5);

      if (topTopics.length > 0) {
        actions.push({
          campaign_id: null,
          action: 'topic_analysis',
          reason: `Top topics: ${topTopics.map(([k, d]) => `${k}(${(d.total_engagement / d.count).toFixed(1)})`).join(', ')}`,
          confidence: 0.8,
          before_state: null,
          after_state: { topics_analyzed: Object.keys(topicGroups).length, top_5: topTopics.map(([k]) => k) },
          result: 'success',
          entity_type: 'system',
        });
      }

      // 5. Content effectiveness — per-response scoring record
      let effectivenessRecorded = 0;
      for (const resp of responses) {
        const metrics = resp.engagement_metrics || {};
        const engagementScore = metrics.engagement_score || 0;
        if (engagementScore === 0) continue;

        await OpenclawLearning.findOrCreate({
          where: { learning_type: 'content_effectiveness', metric_key: resp.id },
          defaults: {
            learning_type: 'content_effectiveness' as any,
            platform: resp.platform,
            metric_key: resp.id,
            metric_value: engagementScore,
            sample_size: 1,
            confidence: 1.0,
            insight: `Response ${resp.id} scored ${engagementScore} on ${resp.platform} (tone: ${resp.tone || 'unknown'})`,
            details: {
              tone: resp.tone,
              platform: resp.platform,
              clicks: metrics.clicks || 0,
              replies: metrics.replies || 0,
              reactions: metrics.reactions || 0,
              shares: metrics.shares || 0,
              senior_engagements: metrics.senior_engagements || 0,
            },
            created_at: new Date(),
          },
        }).then(([learning, created]) => {
          if (!created) {
            learning.update({
              metric_value: engagementScore,
              details: {
                tone: resp.tone,
                platform: resp.platform,
                clicks: metrics.clicks || 0,
                replies: metrics.replies || 0,
                reactions: metrics.reactions || 0,
                shares: metrics.shares || 0,
                senior_engagements: metrics.senior_engagements || 0,
              },
              updated_at: new Date(),
            });
          }
        });
        effectivenessRecorded++;
      }

      if (effectivenessRecorded > 0) {
        actions.push({
          campaign_id: null,
          action: 'content_effectiveness',
          reason: `Recorded effectiveness scores for ${effectivenessRecorded} responses`,
          confidence: 1.0,
          before_state: null,
          after_state: { responses_scored: effectivenessRecorded },
          result: 'success',
          entity_type: 'system',
        });
      }

      // 6. Revenue attribution — track which tones/platforms lead to conversions
      const convertedConversations = await OpenclawConversation.findAll({
        where: { current_stage: { [Op.gte]: 5 } },
        attributes: ['id', 'platform', 'current_stage', 'first_response_id'],
        raw: true,
      });

      if (convertedConversations.length > 0) {
        // Group by tone: find the response that started each conversion
        const responseIds = convertedConversations
          .map((c: any) => c.first_response_id)
          .filter(Boolean);
        const conversionResponses = responseIds.length > 0
          ? await OpenclawResponse.findAll({
              where: { id: { [Op.in]: responseIds } },
              attributes: ['id', 'tone', 'platform'],
              raw: true,
            })
          : [];

        const toneConversions: Record<string, { conversions: number; total: number }> = {};
        for (const resp of conversionResponses) {
          const tone = (resp as any).tone || 'educational';
          if (!toneConversions[tone]) toneConversions[tone] = { conversions: 0, total: 0 };
          toneConversions[tone].conversions++;
        }
        // Get total responses per tone for rate calculation
        for (const [tone, data] of Object.entries(toneGroups)) {
          if (toneConversions[tone]) {
            toneConversions[tone].total = data.count;
          }
        }

        for (const [tone, data] of Object.entries(toneConversions)) {
          if (data.total === 0) continue;
          const conversionRate = data.conversions / data.total;
          const confidence = Math.min(1, data.total / (minSampleSize * 2));

          await OpenclawLearning.findOrCreate({
            where: { learning_type: 'revenue_attribution', metric_key: `tone_to_revenue::${tone}` },
            defaults: {
              learning_type: 'revenue_attribution' as any,
              metric_key: `tone_to_revenue::${tone}`,
              metric_value: conversionRate,
              sample_size: data.total,
              confidence,
              insight: `Tone "${tone}" converts at ${(conversionRate * 100).toFixed(1)}% (${data.conversions}/${data.total})`,
              details: { tone, conversions: data.conversions, total: data.total },
              created_at: new Date(),
            },
          }).then(([learning, created]) => {
            if (!created) {
              learning.update({
                metric_value: conversionRate,
                sample_size: data.total,
                confidence,
                insight: `Tone "${tone}" converts at ${(conversionRate * 100).toFixed(1)}% (${data.conversions}/${data.total})`,
                details: { tone, conversions: data.conversions, total: data.total },
                updated_at: new Date(),
              });
            }
          });
        }

        if (Object.keys(toneConversions).length > 0) {
          actions.push({
            campaign_id: null,
            action: 'revenue_attribution',
            reason: `Tracked revenue attribution for ${Object.keys(toneConversions).length} tones across ${convertedConversations.length} converted conversations`,
            confidence: 0.8,
            before_state: null,
            after_state: { tones_tracked: Object.keys(toneConversions).length, conversions: convertedConversations.length },
            result: 'success',
            entity_type: 'system',
          });
        }
      }

      // 7. Response outcome tracking — which responses led to replies
      const responsesWithEngagement = await OpenclawResponse.findAll({
        where: {
          post_status: 'posted',
        } as any,
        attributes: ['id', 'tone', 'platform', 'signal_id'],
        raw: true,
      });

      let outcomesRecorded = 0;
      for (const resp of responsesWithEngagement) {
        const replyCount = await EngagementEvent.count({
          where: {
            response_id: (resp as any).id,
            engagement_type: { [Op.in]: ['reply', 'comment'] },
          },
        });

        if (replyCount > 0) {
          await OpenclawLearning.findOrCreate({
            where: { learning_type: 'response_outcome', metric_key: (resp as any).id },
            defaults: {
              learning_type: 'response_outcome' as any,
              platform: (resp as any).platform,
              metric_key: (resp as any).id,
              metric_value: replyCount,
              sample_size: 1,
              confidence: 1.0,
              insight: `Response ${(resp as any).id} received ${replyCount} replies on ${(resp as any).platform} (tone: ${(resp as any).tone || 'unknown'})`,
              details: {
                response_id: (resp as any).id,
                signal_id: (resp as any).signal_id,
                tone: (resp as any).tone,
                reply_count: replyCount,
                outcome: replyCount >= 3 ? 'high_engagement' : replyCount >= 1 ? 'engaged' : 'no_response',
              },
              created_at: new Date(),
            },
          }).then(([learning, created]) => {
            if (!created) {
              learning.update({
                metric_value: replyCount,
                details: {
                  response_id: (resp as any).id,
                  signal_id: (resp as any).signal_id,
                  tone: (resp as any).tone,
                  reply_count: replyCount,
                  outcome: replyCount >= 3 ? 'high_engagement' : replyCount >= 1 ? 'engaged' : 'no_response',
                },
                updated_at: new Date(),
              });
            }
          });
          outcomesRecorded++;
        }
      }

      if (outcomesRecorded > 0) {
        actions.push({
          campaign_id: null,
          action: 'response_outcome_tracking',
          reason: `Tracked outcomes for ${outcomesRecorded} responses that received replies`,
          confidence: 1.0,
          before_state: null,
          after_state: { outcomes_recorded: outcomesRecorded },
          result: 'success',
          entity_type: 'system',
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
