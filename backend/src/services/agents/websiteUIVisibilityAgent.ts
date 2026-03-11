import WebsiteIssue from '../../models/WebsiteIssue';
import { logAgentActivity } from '../aiEventService';
import { scanAllPublicPages } from '../websiteScanner';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'WebsiteUIVisibilityAgent';

export async function runWebsiteUIVisibilityAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let pagesProcessed = 0;

  try {
    const pages = await scanAllPublicPages();
    pagesProcessed = pages.length;

    for (const page of pages) {
      if (page.error) continue;

      // Check images without alt text
      for (const img of page.images) {
        if (!img.hasAlt) {
          const issue = await WebsiteIssue.create({
            agent_name: AGENT_NAME,
            issue_type: 'ui_visibility',
            page_url: page.route,
            severity: 'medium',
            confidence: 0.95,
            description: `Image missing alt text: ${img.src.slice(0, 100)}`,
            suggested_fix: 'Add descriptive alt text to the image for screen reader accessibility.',
            element_selector: `img[src="${img.src}"]`,
            details: { src: img.src, classes: img.classes },
          });

          actions.push({
            campaign_id: '',
            action: 'detected_missing_alt_text',
            reason: `Image on ${page.route} lacks alt attribute`,
            confidence: 0.95,
            before_state: { hasAlt: false },
            after_state: null,
            result: 'success',
            entity_type: 'system',
            entity_id: issue.id,
          });
        }
      }

      // Check aria issues
      for (const aria of page.ariaIssues) {
        const issue = await WebsiteIssue.create({
          agent_name: AGENT_NAME,
          issue_type: 'ui_visibility',
          page_url: page.route,
          severity: aria.issue.includes('interactive') ? 'high' : 'medium',
          confidence: 0.90,
          description: `${aria.issue} at ${aria.selector}`,
          suggested_fix: aria.issue.includes('interactive')
            ? 'Remove aria-hidden from elements containing interactive content, or move the interactive content outside.'
            : 'Add a proper label to the form field.',
          element_selector: aria.selector,
          details: { issue: aria.issue },
        });

        actions.push({
          campaign_id: '',
          action: 'detected_aria_issue',
          reason: aria.issue,
          confidence: 0.90,
          before_state: null,
          after_state: null,
          result: 'success',
          entity_type: 'system',
          entity_id: issue.id,
        });
      }

      // Log per-page scan
      await logAgentActivity({
        agent_id: agentId,
        action: 'page_scanned',
        result: 'success',
        details: {
          route: page.route,
          images_without_alt: page.images.filter((i) => !i.hasAlt).length,
          aria_issues: page.ariaIssues.length,
        },
      }).catch(() => {});
    }
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
