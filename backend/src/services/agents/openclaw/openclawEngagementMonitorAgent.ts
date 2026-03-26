import { Op, QueryTypes } from 'sequelize';
import OpenclawResponse from '../../../models/OpenclawResponse';
import AuthorityContent from '../../../models/AuthorityContent';
import EngagementEvent from '../../../models/EngagementEvent';
import { sequelize } from '../../../config/database';
import { fetchEngagementsForUrl } from './openclawEngagementFetcher';
import { generateContent } from './openclawAiHelper';
import { updateConversationFromEvent } from './openclawConversationTrackingService';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * EngagementMonitorAgent -scans posted responses and authority content
 * for new engagement (comments/replies) via platform APIs.
 *
 * Schedule: 0,30 * * * * (every 30 min)
 */
export async function runEngagementMonitorAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const maxPerRun = config.max_items_per_run || 20;

  try {
    // 1. Find posted responses with post_url
    const postedResponses = await OpenclawResponse.findAll({
      where: {
        post_status: 'posted',
        post_url: { [Op.ne]: null as any },
      },
      order: [['posted_at', 'DESC']],
      limit: maxPerRun,
    });

    // 2. Find posted authority content with post_url
    const postedAuthority = await AuthorityContent.findAll({
      where: {
        status: 'posted',
        post_url: { [Op.ne]: null as any },
      },
      order: [['posted_at', 'DESC']],
      limit: maxPerRun,
    });

    let newEngagements = 0;

    // 3. Scan responses for engagement
    for (const response of postedResponses) {
      try {
        const engagements = await fetchEngagementsForUrl(response.post_url);
        for (const eng of engagements) {
          // Deduplicate by source_url
          const existing = await EngagementEvent.findOne({
            where: { source_url: eng.source_url, response_id: response.id },
          });
          if (existing) continue;

          // Detect role seniority from title
          const seniority = detectSeniority(eng.user_title);

          // Score intent via lightweight AI
          let intentScore = 0;
          try {
            const scoreResult = await generateContent(
              `Rate the purchase intent of this comment on a scale of 0.0 to 1.0. Reply with ONLY a number.\n\nComment: "${eng.content.slice(0, 500)}"`,
              'gpt-4o-mini',
            );
            intentScore = parseFloat(scoreResult.body) || 0;
            intentScore = Math.min(1, Math.max(0, intentScore));
          } catch { intentScore = 0.3; }

          const newEvent = await EngagementEvent.create({
            response_id: response.id,
            platform: eng.platform,
            source_url: eng.source_url,
            engagement_type: eng.engagement_type,
            user_name: eng.user_name,
            user_title: eng.user_title || undefined,
            content: eng.content,
            intent_score: intentScore,
            role_seniority: seniority,
            status: 'new',
          });

          // Wire conversation tracking -link event to conversation state machine
          try {
            await updateConversationFromEvent(newEvent);
          } catch (convErr: any) {
            errors.push(`Conversation tracking failed for event ${newEvent.id}: ${convErr.message}`);
          }

          newEngagements++;
        }
      } catch (fetchErr: any) {
        errors.push(`Failed to fetch engagements for response ${response.id}: ${fetchErr.message}`);
      }
    }

    // 4. Scan authority content for engagement
    for (const content of postedAuthority) {
      try {
        const engagements = await fetchEngagementsForUrl(content.post_url);
        for (const eng of engagements) {
          const existing = await EngagementEvent.findOne({
            where: { source_url: eng.source_url, authority_content_id: content.id },
          });
          if (existing) continue;

          const seniority = detectSeniority(eng.user_title);
          let intentScore = 0.3; // Default for authority content engagement

          const newEvent = await EngagementEvent.create({
            authority_content_id: content.id,
            platform: eng.platform,
            source_url: eng.source_url,
            engagement_type: eng.engagement_type,
            user_name: eng.user_name,
            user_title: eng.user_title || undefined,
            content: eng.content,
            intent_score: intentScore,
            role_seniority: seniority,
            status: 'new',
          });

          // Wire conversation tracking -link event to conversation state machine
          try {
            await updateConversationFromEvent(newEvent);
          } catch (convErr: any) {
            errors.push(`Conversation tracking failed for event ${newEvent.id}: ${convErr.message}`);
          }

          newEngagements++;
        }
      } catch (fetchErr: any) {
        errors.push(`Failed to fetch engagements for authority content ${content.id}: ${fetchErr.message}`);
      }
    }

    actions.push({
      campaign_id: null,
      action: 'engagement_scan',
      reason: `Scanned ${postedResponses.length} responses + ${postedAuthority.length} authority posts`,
      confidence: 0.9,
      before_state: { responses_scanned: postedResponses.length, authority_scanned: postedAuthority.length },
      after_state: { new_engagements: newEngagements },
      result: 'success',
      entity_type: 'engagement_event',
    });

    // 5. Aggregate engagement metrics back to responses and authority content
    let metricsUpdated = 0;
    try {
      // Get engagement counts grouped by response_id and engagement_type
      const responseMetrics: any[] = await sequelize.query(`
        SELECT
          response_id,
          COUNT(*) FILTER (WHERE engagement_type IN ('reply','comment')) as replies,
          COUNT(*) FILTER (WHERE engagement_type = 'reaction') as reactions,
          COUNT(*) FILTER (WHERE engagement_type = 'share') as shares,
          COUNT(*) FILTER (WHERE engagement_type = 'mention') as mentions,
          COUNT(*) FILTER (WHERE role_seniority IN ('director','vp','c_level')) as senior_engagements
        FROM openclaw_engagement_events
        WHERE response_id IS NOT NULL
        GROUP BY response_id
      `, { type: QueryTypes.SELECT });

      for (const row of responseMetrics) {
        const response = await OpenclawResponse.findByPk(row.response_id);
        if (!response) continue;
        const existing = response.engagement_metrics || {};
        const clicks = Number(existing.clicks || 0);
        const replies = Number(row.replies || 0);
        const reactions = Number(row.reactions || 0);
        const shares = Number(row.shares || 0);
        const mentions = Number(row.mentions || 0);
        const seniorEngagements = Number(row.senior_engagements || 0);

        // Weighted score: clicks×3 + replies×2 + reactions×1 + shares×2 + seniority bonus (2 extra per senior)
        const engagementScore = (clicks * 3) + (replies * 2) + (reactions * 1) + (shares * 2) + (seniorEngagements * 2);

        await response.update({
          engagement_metrics: {
            ...existing,
            replies, reactions, shares, mentions, senior_engagements: seniorEngagements,
            engagement_score: engagementScore,
            last_aggregated: new Date().toISOString(),
          },
          updated_at: new Date(),
        });
        metricsUpdated++;
      }

      // Same for authority content
      const authorityMetrics: any[] = await sequelize.query(`
        SELECT
          authority_content_id,
          COUNT(*) FILTER (WHERE engagement_type IN ('reply','comment')) as replies,
          COUNT(*) FILTER (WHERE engagement_type = 'reaction') as reactions,
          COUNT(*) FILTER (WHERE engagement_type = 'share') as shares,
          COUNT(*) FILTER (WHERE role_seniority IN ('director','vp','c_level')) as senior_engagements
        FROM openclaw_engagement_events
        WHERE authority_content_id IS NOT NULL
        GROUP BY authority_content_id
      `, { type: QueryTypes.SELECT });

      for (const row of authorityMetrics) {
        const content = await AuthorityContent.findByPk(row.authority_content_id);
        if (!content) continue;
        const existing = content.performance_metrics || {};
        const clicks = Number(existing.clicks || 0);
        const replies = Number(row.replies || 0);
        const reactions = Number(row.reactions || 0);
        const shares = Number(row.shares || 0);
        const seniorEngagements = Number(row.senior_engagements || 0);
        const engagementScore = (clicks * 3) + (replies * 2) + (reactions * 1) + (shares * 2) + (seniorEngagements * 2);

        await content.update({
          performance_metrics: {
            ...existing,
            replies, reactions, shares, senior_engagements: seniorEngagements,
            engagement_score: engagementScore,
            last_aggregated: new Date().toISOString(),
          },
          updated_at: new Date(),
        });
        metricsUpdated++;
      }

      if (metricsUpdated > 0) {
        actions.push({
          campaign_id: null,
          action: 'metrics_aggregation',
          reason: `Aggregated engagement metrics for ${metricsUpdated} items`,
          confidence: 1.0,
          before_state: { response_groups: responseMetrics.length, authority_groups: authorityMetrics.length },
          after_state: { items_updated: metricsUpdated },
          result: 'success',
          entity_type: 'engagement_event',
        });
      }
    } catch (aggErr: any) {
      errors.push(`Metrics aggregation failed: ${aggErr.message}`);
    }
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: 'EngagementMonitorAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.filter(a => a.action !== 'engagement_scan').length,
  };
}

function detectSeniority(title?: string): 'unknown' | 'ic' | 'manager' | 'director' | 'vp' | 'c_level' {
  if (!title) return 'unknown';
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cio|cfo|coo|chief|founder|co-founder)\b/.test(t)) return 'c_level';
  if (/\b(vp|vice president|svp|evp)\b/.test(t)) return 'vp';
  if (/\b(director|head of)\b/.test(t)) return 'director';
  if (/\b(manager|lead|principal)\b/.test(t)) return 'manager';
  return 'ic';
}
