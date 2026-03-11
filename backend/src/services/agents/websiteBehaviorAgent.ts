import { Op, fn, col, literal } from 'sequelize';
import WebsiteIssue from '../../models/WebsiteIssue';
import { PageEvent, VisitorSession } from '../../models';
import { logAgentActivity } from '../aiEventService';
import { getPublicRoutes } from '../websiteScanner';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'WebsiteBehaviorAgent';

// Thresholds
const LOW_TRAFFIC_THRESHOLD = 5; // visits in last 7 days
const FORM_ABANDONMENT_THRESHOLD = 0.20; // < 20% form submission ratio
const MIN_PAGE_VISITS_FOR_ANALYSIS = 10;

export async function runWebsiteBehaviorAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const publicRoutes = getPublicRoutes();
  let pagesProcessed = 0;

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get page visit counts from the last 7 days
    const pageVisits = await PageEvent.findAll({
      attributes: [
        'page_url',
        [fn('COUNT', col('id')), 'visit_count'],
      ],
      where: {
        event_type: 'page_view',
        created_at: { [Op.gte]: sevenDaysAgo },
      },
      group: ['page_url'],
      raw: true,
    }) as any[];

    const visitMap: Record<string, number> = {};
    for (const row of pageVisits) {
      visitMap[row.page_url] = parseInt(row.visit_count, 10);
    }

    // Detect low-traffic pages
    for (const route of publicRoutes) {
      pagesProcessed++;
      const visits = visitMap[route] || 0;

      if (visits < LOW_TRAFFIC_THRESHOLD) {
        const issue = await WebsiteIssue.create({
          agent_name: AGENT_NAME,
          issue_type: 'behavior',
          page_url: route,
          severity: visits === 0 ? 'high' : 'medium',
          confidence: 0.75,
          description: `Low traffic: ${route} had only ${visits} visits in the last 7 days.`,
          suggested_fix: 'Review navigation and internal linking to improve discoverability of this page.',
          details: { visits_7d: visits },
        });

        actions.push({
          campaign_id: '',
          action: 'detected_low_traffic',
          reason: `${visits} visits on ${route} in 7 days`,
          confidence: 0.75,
          before_state: { visits },
          after_state: null,
          result: 'success',
          entity_type: 'system',
          entity_id: issue.id,
        });
      }
    }

    // Detect form abandonment — pages with form views but low submissions
    const formSubmissions = await PageEvent.findAll({
      attributes: [
        'page_url',
        [fn('COUNT', col('id')), 'submit_count'],
      ],
      where: {
        event_type: 'form_submit',
        created_at: { [Op.gte]: sevenDaysAgo },
      },
      group: ['page_url'],
      raw: true,
    }) as any[];

    const submitMap: Record<string, number> = {};
    for (const row of formSubmissions) {
      submitMap[row.page_url] = parseInt(row.submit_count, 10);
    }

    // Pages with forms that have traffic but low submissions
    const formPages = ['/enroll', '/contact', '/'];
    for (const route of formPages) {
      const visits = visitMap[route] || 0;
      const submissions = submitMap[route] || 0;

      if (visits >= MIN_PAGE_VISITS_FOR_ANALYSIS) {
        const ratio = submissions / visits;
        if (ratio < FORM_ABANDONMENT_THRESHOLD) {
          const issue = await WebsiteIssue.create({
            agent_name: AGENT_NAME,
            issue_type: 'behavior',
            page_url: route,
            severity: 'high',
            confidence: 0.70,
            description: `Form abandonment: ${route} has ${visits} visits but only ${submissions} submissions (${(ratio * 100).toFixed(1)}% conversion).`,
            suggested_fix: 'Review form UX — reduce field count, improve CTA copy, or add trust signals near the form.',
            details: { visits, submissions, ratio: Math.round(ratio * 100) / 100 },
          });

          actions.push({
            campaign_id: '',
            action: 'detected_form_abandonment',
            reason: `${(ratio * 100).toFixed(1)}% form conversion on ${route}`,
            confidence: 0.70,
            before_state: { visits, submissions },
            after_state: null,
            result: 'success',
            entity_type: 'system',
            entity_id: issue.id,
          });
        }
      }
    }

    await logAgentActivity({
      agent_id: agentId,
      action: 'behavior_analysis_completed',
      result: 'success',
      details: {
        pages_analyzed: pagesProcessed,
        total_page_visits: Object.values(visitMap).reduce((a, b) => a + b, 0),
        low_traffic_pages: actions.filter((a) => a.action === 'detected_low_traffic').length,
        form_abandonment_pages: actions.filter((a) => a.action === 'detected_form_abandonment').length,
      },
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
    entities_processed: pagesProcessed,
  };
}
