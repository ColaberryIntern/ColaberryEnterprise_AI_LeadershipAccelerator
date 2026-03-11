import WebsiteIssue from '../../models/WebsiteIssue';
import { logAgentActivity } from '../aiEventService';
import { scanAllPublicPages, getKnownInternalPaths } from '../websiteScanner';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'WebsiteBrokenLinkAgent';

export async function runWebsiteBrokenLinkAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let pagesProcessed = 0;

  try {
    const pages = await scanAllPublicPages();
    const knownPaths = getKnownInternalPaths();
    pagesProcessed = pages.length;

    for (const page of pages) {
      if (page.error) {
        // The page itself failed to load
        const issue = await WebsiteIssue.create({
          agent_name: AGENT_NAME,
          issue_type: 'broken_link',
          page_url: page.route,
          severity: 'critical',
          confidence: 0.99,
          description: `Page failed to load: ${page.error}`,
          suggested_fix: 'Verify the page renders correctly and the server returns 200.',
          details: { error: page.error },
        });

        actions.push({
          campaign_id: '',
          action: 'detected_broken_page',
          reason: `${page.route} returned ${page.error}`,
          confidence: 0.99,
          before_state: null,
          after_state: null,
          result: 'success',
          entity_type: 'system',
          entity_id: issue.id,
        });
        continue;
      }

      for (const link of page.links) {
        // Empty href
        if (link.isEmpty) {
          const issue = await WebsiteIssue.create({
            agent_name: AGENT_NAME,
            issue_type: 'broken_link',
            page_url: page.route,
            severity: 'low',
            confidence: 0.85,
            description: `Empty or # link: "${link.text.slice(0, 80)}"`,
            suggested_fix: 'Replace empty href with a valid destination or use a button element.',
            element_selector: `a:contains("${link.text.slice(0, 40)}")`,
            details: { href: link.href, text: link.text },
          });

          actions.push({
            campaign_id: '',
            action: 'detected_empty_link',
            reason: `Empty href on ${page.route}`,
            confidence: 0.85,
            before_state: null,
            after_state: null,
            result: 'success',
            entity_type: 'system',
            entity_id: issue.id,
          });
          continue;
        }

        // Internal link — check against known routes
        if (link.isInternal) {
          let path = link.href;
          try {
            const url = new URL(link.href, 'http://localhost');
            path = url.pathname;
          } catch {
            // href is already a relative path
          }
          // Strip trailing slash
          path = path.replace(/\/$/, '') || '/';

          if (!knownPaths.includes(path) && !path.startsWith('/assets') && !path.startsWith('/api')) {
            const issue = await WebsiteIssue.create({
              agent_name: AGENT_NAME,
              issue_type: 'broken_link',
              page_url: page.route,
              severity: 'high',
              confidence: 0.90,
              description: `Internal link points to unknown route: ${path}`,
              suggested_fix: `Verify route "${path}" exists in publicRoutes.tsx or update the link.`,
              element_selector: `a[href="${link.href}"]`,
              details: { href: link.href, text: link.text, resolvedPath: path },
            });

            actions.push({
              campaign_id: '',
              action: 'detected_broken_internal_link',
              reason: `Link to unknown route ${path} on ${page.route}`,
              confidence: 0.90,
              before_state: null,
              after_state: null,
              result: 'success',
              entity_type: 'system',
              entity_id: issue.id,
            });
          }
        }

        // External links — HEAD check (limit to avoid slowness)
        if (link.isExternal) {
          try {
            const response = await fetch(link.href, {
              method: 'HEAD',
              signal: AbortSignal.timeout(5000),
            });
            if (response.status >= 400) {
              const issue = await WebsiteIssue.create({
                agent_name: AGENT_NAME,
                issue_type: 'broken_link',
                page_url: page.route,
                severity: response.status >= 500 ? 'high' : 'medium',
                confidence: 0.95,
                description: `External link returns ${response.status}: ${link.href}`,
                suggested_fix: 'Fix or remove the broken external link.',
                element_selector: `a[href="${link.href}"]`,
                details: { href: link.href, status: response.status, text: link.text },
              });

              actions.push({
                campaign_id: '',
                action: 'detected_broken_external_link',
                reason: `External link ${link.href} returned ${response.status}`,
                confidence: 0.95,
                before_state: null,
                after_state: null,
                result: 'success',
                entity_type: 'system',
                entity_id: issue.id,
              });
            }
          } catch {
            // Network errors for external links are low-confidence
          }
        }
      }

      await logAgentActivity({
        agent_id: agentId,
        action: 'page_links_checked',
        result: 'success',
        details: {
          route: page.route,
          total_links: page.links.length,
          internal: page.links.filter((l) => l.isInternal).length,
          external: page.links.filter((l) => l.isExternal).length,
          empty: page.links.filter((l) => l.isEmpty).length,
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
