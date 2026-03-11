import WebsiteIssue from '../../models/WebsiteIssue';
import { logAgentActivity } from '../aiEventService';
import { scanAllPublicPages, getKnownInternalPaths } from '../websiteScanner';
import type { AgentExecutionResult, AgentAction } from './types';
import type { PageScanResult } from '../websiteScanner';

const AGENT_NAME = 'WebsiteConversionFlowAgent';

// Expected conversion flows (page → destination)
const EXPECTED_FLOWS: Record<string, string[]> = {
  '/': ['/program', '/pricing', '/enroll', '/executive-roi-calculator'],
  '/program': ['/enroll', '/pricing', '/executive-roi-calculator'],
  '/pricing': ['/enroll'],
  '/sponsorship': ['/executive-roi-calculator'],
  '/executive-roi-calculator': ['/', '/executive-overview/thank-you'],
  '/executive-overview/thank-you': ['/enroll', '/executive-roi-calculator'],
};

function extractCTADestinations(page: PageScanResult): string[] {
  const destinations: string[] = [];
  for (const link of page.links) {
    if (!link.isInternal || link.isEmpty) continue;
    // CTA heuristic: links with btn class or containing action words
    const isCTA = link.classes.includes('btn') ||
      /enroll|start|schedule|download|get|calculate|learn more/i.test(link.text);
    if (isCTA) {
      let path = link.href;
      try {
        const url = new URL(link.href, 'http://localhost');
        path = url.pathname;
      } catch { /* relative path */ }
      destinations.push(path.replace(/\/$/, '') || '/');
    }
  }
  return [...new Set(destinations)];
}

export async function runWebsiteConversionFlowAgent(
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

    // Build page → CTA destinations map
    const flowMap: Record<string, string[]> = {};
    for (const page of pages) {
      if (page.error) continue;
      flowMap[page.route] = extractCTADestinations(page);
    }

    // Check for dead-end pages (no CTAs)
    for (const page of pages) {
      if (page.error) continue;
      const destinations = flowMap[page.route] || [];

      if (destinations.length === 0) {
        const issue = await WebsiteIssue.create({
          agent_name: AGENT_NAME,
          issue_type: 'conversion_flow',
          page_url: page.route,
          severity: 'high',
          confidence: 0.85,
          description: `Dead-end page: no CTA links found on ${page.route}`,
          suggested_fix: 'Add at least one clear CTA linking to enrollment, pricing, or the ROI calculator.',
          details: { total_links: page.links.length, cta_count: 0 },
        });

        actions.push({
          campaign_id: '',
          action: 'detected_dead_end_page',
          reason: `${page.route} has no CTA destinations`,
          confidence: 0.85,
          before_state: { destinations: [] },
          after_state: null,
          result: 'success',
          entity_type: 'system',
          entity_id: issue.id,
        });
      }

      // Validate expected flows
      const expected = EXPECTED_FLOWS[page.route];
      if (expected) {
        for (const target of expected) {
          if (!destinations.includes(target)) {
            const issue = await WebsiteIssue.create({
              agent_name: AGENT_NAME,
              issue_type: 'conversion_flow',
              page_url: page.route,
              severity: 'medium',
              confidence: 0.75,
              description: `Expected conversion path missing: ${page.route} → ${target}`,
              suggested_fix: `Add a CTA linking from ${page.route} to ${target} to complete the conversion flow.`,
              details: { expected: target, actual_destinations: destinations },
            });

            actions.push({
              campaign_id: '',
              action: 'detected_missing_flow',
              reason: `Missing flow: ${page.route} → ${target}`,
              confidence: 0.75,
              before_state: null,
              after_state: null,
              result: 'success',
              entity_type: 'system',
              entity_id: issue.id,
            });
          }
        }
      }
    }

    // Detect circular flows (A → B → A with no other exit)
    for (const [source, destinations] of Object.entries(flowMap)) {
      for (const dest of destinations) {
        const destDestinations = flowMap[dest] || [];
        if (destDestinations.length === 1 && destDestinations[0] === source) {
          const issue = await WebsiteIssue.create({
            agent_name: AGENT_NAME,
            issue_type: 'conversion_flow',
            page_url: source,
            severity: 'medium',
            confidence: 0.80,
            description: `Circular flow detected: ${source} ↔ ${dest} (${dest} only links back)`,
            suggested_fix: `Add additional CTA destinations on ${dest} to prevent users from getting stuck.`,
            details: { source, destination: dest, dest_destinations: destDestinations },
          });

          actions.push({
            campaign_id: '',
            action: 'detected_circular_flow',
            reason: `Circular: ${source} ↔ ${dest}`,
            confidence: 0.80,
            before_state: null,
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
      action: 'conversion_flow_analysis_completed',
      result: 'success',
      details: { pages_analyzed: pagesProcessed, flow_map: flowMap },
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
