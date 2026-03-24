import { Op } from 'sequelize';
import OpenclawResponse from '../../../models/OpenclawResponse';
import AuthorityContent from '../../../models/AuthorityContent';
import EngagementEvent from '../../../models/EngagementEvent';
import { fetchEngagementsForUrl } from './openclawEngagementFetcher';
import { generateContent } from './openclawAiHelper';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * EngagementMonitorAgent — scans posted responses and authority content
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

          await EngagementEvent.create({
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

          await EngagementEvent.create({
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
