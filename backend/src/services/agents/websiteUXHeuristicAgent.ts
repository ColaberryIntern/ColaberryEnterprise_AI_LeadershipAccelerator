import WebsiteIssue from '../../models/WebsiteIssue';
import { logAgentActivity } from '../aiEventService';
import { scanAllPublicPages } from '../websiteScanner';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'WebsiteUXHeuristicAgent';

// Heuristic thresholds
const MAX_FORM_FIELDS = 8;
const MIN_CTA_COUNT = 1;
const MAX_CTA_COUNT = 5;
const MIN_WORD_COUNT = 100;
const MAX_WORD_COUNT = 3000;

export async function runWebsiteUXHeuristicAgent(
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

      // 1. Form field count check
      for (const form of page.forms) {
        if (form.fieldCount > MAX_FORM_FIELDS) {
          const issue = await WebsiteIssue.create({
            agent_name: AGENT_NAME,
            issue_type: 'ux_heuristic',
            page_url: page.route,
            severity: 'medium',
            confidence: 0.80,
            description: `Form has ${form.fieldCount} fields (threshold: ${MAX_FORM_FIELDS}). High friction may reduce conversions.`,
            suggested_fix: 'Consider reducing form fields or splitting into multiple steps.',
            details: { fieldCount: form.fieldCount, fields: form.fields.map((f) => f.name) },
          });

          actions.push({
            campaign_id: '',
            action: 'detected_form_friction',
            reason: `Form with ${form.fieldCount} fields on ${page.route}`,
            confidence: 0.80,
            before_state: { fieldCount: form.fieldCount },
            after_state: null,
            result: 'success',
            entity_type: 'system',
            entity_id: issue.id,
          });
        }
      }

      // 2. CTA count per page
      const ctaCount = page.links.filter((l) => l.classes.includes('btn')).length +
        page.buttons.filter((b) => b.classes.includes('btn')).length;

      if (ctaCount < MIN_CTA_COUNT && page.route !== '/enroll/success' && page.route !== '/enroll/cancel') {
        const issue = await WebsiteIssue.create({
          agent_name: AGENT_NAME,
          issue_type: 'ux_heuristic',
          page_url: page.route,
          severity: 'high',
          confidence: 0.85,
          description: `Page has no CTA buttons. Users have no clear next action.`,
          suggested_fix: 'Add at least one primary CTA button to guide user progression.',
          details: { ctaCount },
        });

        actions.push({
          campaign_id: '',
          action: 'detected_missing_cta',
          reason: `No CTAs on ${page.route}`,
          confidence: 0.85,
          before_state: null,
          after_state: null,
          result: 'success',
          entity_type: 'system',
          entity_id: issue.id,
        });
      } else if (ctaCount > MAX_CTA_COUNT) {
        const issue = await WebsiteIssue.create({
          agent_name: AGENT_NAME,
          issue_type: 'ux_heuristic',
          page_url: page.route,
          severity: 'low',
          confidence: 0.70,
          description: `Page has ${ctaCount} CTA buttons. Too many CTAs can dilute user focus.`,
          suggested_fix: 'Reduce CTA count or establish a clear visual hierarchy between primary and secondary actions.',
          details: { ctaCount },
        });

        actions.push({
          campaign_id: '',
          action: 'detected_cta_dilution',
          reason: `${ctaCount} CTAs on ${page.route}`,
          confidence: 0.70,
          before_state: null,
          after_state: null,
          result: 'success',
          entity_type: 'system',
          entity_id: issue.id,
        });
      }

      // 3. Heading hierarchy check
      if (page.headings.length > 0) {
        const h1Count = page.headings.filter((h) => h.level === 1).length;
        if (h1Count === 0) {
          const issue = await WebsiteIssue.create({
            agent_name: AGENT_NAME,
            issue_type: 'ux_heuristic',
            page_url: page.route,
            severity: 'medium',
            confidence: 0.90,
            description: 'Page missing h1 element. Important for SEO and document structure.',
            suggested_fix: 'Add a single h1 element as the main page heading.',
            details: { headings: page.headings },
          });

          actions.push({
            campaign_id: '',
            action: 'detected_missing_h1',
            reason: `No h1 on ${page.route}`,
            confidence: 0.90,
            before_state: null,
            after_state: null,
            result: 'success',
            entity_type: 'system',
            entity_id: issue.id,
          });
        } else if (h1Count > 1) {
          const issue = await WebsiteIssue.create({
            agent_name: AGENT_NAME,
            issue_type: 'ux_heuristic',
            page_url: page.route,
            severity: 'low',
            confidence: 0.85,
            description: `Page has ${h1Count} h1 elements. Best practice is a single h1.`,
            suggested_fix: 'Use only one h1 per page. Demote additional h1s to h2.',
            details: { h1Count, headings: page.headings },
          });

          actions.push({
            campaign_id: '',
            action: 'detected_multiple_h1',
            reason: `${h1Count} h1s on ${page.route}`,
            confidence: 0.85,
            before_state: null,
            after_state: null,
            result: 'success',
            entity_type: 'system',
            entity_id: issue.id,
          });
        }

        // Check for skipped heading levels (h1 → h3 without h2)
        for (let i = 1; i < page.headings.length; i++) {
          const prev = page.headings[i - 1].level;
          const curr = page.headings[i].level;
          if (curr > prev + 1) {
            const issue = await WebsiteIssue.create({
              agent_name: AGENT_NAME,
              issue_type: 'ux_heuristic',
              page_url: page.route,
              severity: 'low',
              confidence: 0.80,
              description: `Skipped heading level: h${prev} → h${curr} ("${page.headings[i].text.slice(0, 60)}")`,
              suggested_fix: `Use h${prev + 1} instead of h${curr} to maintain proper document hierarchy.`,
              details: { previousLevel: prev, currentLevel: curr, text: page.headings[i].text },
            });

            actions.push({
              campaign_id: '',
              action: 'detected_heading_skip',
              reason: `h${prev} → h${curr} on ${page.route}`,
              confidence: 0.80,
              before_state: null,
              after_state: null,
              result: 'success',
              entity_type: 'system',
              entity_id: issue.id,
            });
            break; // Only report first skip per page
          }
        }
      }

      // 4. Word count check
      if (page.wordCount < MIN_WORD_COUNT) {
        const issue = await WebsiteIssue.create({
          agent_name: AGENT_NAME,
          issue_type: 'ux_heuristic',
          page_url: page.route,
          severity: 'low',
          confidence: 0.65,
          description: `Page has only ${page.wordCount} words. May lack sufficient content for SEO and user engagement.`,
          suggested_fix: 'Consider adding more descriptive content to improve SEO and user understanding.',
          details: { wordCount: page.wordCount },
        });

        actions.push({
          campaign_id: '',
          action: 'detected_thin_content',
          reason: `${page.wordCount} words on ${page.route}`,
          confidence: 0.65,
          before_state: null,
          after_state: null,
          result: 'success',
          entity_type: 'system',
          entity_id: issue.id,
        });
      } else if (page.wordCount > MAX_WORD_COUNT) {
        const issue = await WebsiteIssue.create({
          agent_name: AGENT_NAME,
          issue_type: 'ux_heuristic',
          page_url: page.route,
          severity: 'info',
          confidence: 0.60,
          description: `Page has ${page.wordCount} words. Long pages may reduce readability.`,
          suggested_fix: 'Consider breaking content into tabs, accordions, or sub-pages.',
          details: { wordCount: page.wordCount },
        });

        actions.push({
          campaign_id: '',
          action: 'detected_long_content',
          reason: `${page.wordCount} words on ${page.route}`,
          confidence: 0.60,
          before_state: null,
          after_state: null,
          result: 'success',
          entity_type: 'system',
          entity_id: issue.id,
        });
      }

      await logAgentActivity({
        agent_id: agentId,
        action: 'page_heuristics_checked',
        result: 'success',
        details: {
          route: page.route,
          wordCount: page.wordCount,
          ctaCount,
          formCount: page.forms.length,
          headingCount: page.headings.length,
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
