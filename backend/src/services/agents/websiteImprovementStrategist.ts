import WebsiteIssue from '../../models/WebsiteIssue';
import { logAgentActivity } from '../aiEventService';
import { scanAllPublicPages } from '../websiteScanner';
import type { AgentExecutionResult, AgentAction } from './types';
import type { PageScanResult } from '../websiteScanner';

const AGENT_NAME = 'WebsiteImprovementStrategist';

// Strategic patterns to check
interface StrategicCheck {
  name: string;
  check: (page: PageScanResult) => { found: boolean; description: string; fix: string };
}

const STRATEGIC_CHECKS: StrategicCheck[] = [
  {
    name: 'missing_social_proof',
    check: (page) => {
      const bodyText = page.headings.map((h) => h.text).join(' ') + ' ' +
        page.links.map((l) => l.text).join(' ');
      const hasSocialProof = /testimonial|case stud|result|success stor|client|partner/i.test(bodyText);
      const keyPages = ['/', '/program', '/pricing', '/sponsorship'];
      if (keyPages.includes(page.route) && !hasSocialProof) {
        return {
          found: true,
          description: `${page.route} lacks visible social proof (testimonials, case studies, results).`,
          fix: 'Add testimonials, success metrics, or client logos to build trust with enterprise buyers.',
        };
      }
      return { found: false, description: '', fix: '' };
    },
  },
  {
    name: 'missing_trust_signals',
    check: (page) => {
      const bodyText = page.images.map((i) => i.alt).join(' ') + ' ' +
        page.links.map((l) => l.text).join(' ');
      const hasTrustSignals = /secur|certif|partner|accredit|guarantee|badge|ssl|encrypt/i.test(bodyText);
      if (['/enroll', '/pricing'].includes(page.route) && !hasTrustSignals) {
        return {
          found: true,
          description: `${page.route} (payment/commitment page) missing trust signals.`,
          fix: 'Add security badges, partner logos, or guarantee messaging near the conversion point.',
        };
      }
      return { found: false, description: '', fix: '' };
    },
  },
  {
    name: 'weak_cta_copy',
    check: (page) => {
      const weakPatterns = /click here|submit|learn more$/i;
      const weakCTAs = page.links.filter((l) => l.classes.includes('btn') && weakPatterns.test(l.text.trim()));
      if (weakCTAs.length > 0) {
        return {
          found: true,
          description: `${page.route} has weak CTA copy: "${weakCTAs[0].text.trim()}"`,
          fix: 'Use action-oriented, benefit-driven CTA copy (e.g., "Start Your AI Journey" instead of "Learn More").',
        };
      }
      return { found: false, description: '', fix: '' };
    },
  },
  {
    name: 'missing_urgency',
    check: (page) => {
      const headingText = page.headings.map((h) => h.text).join(' ');
      const hasUrgency = /limited|hurry|deadline|closing|last chance|spots|seats|cohort cap/i.test(headingText);
      if (['/pricing', '/enroll'].includes(page.route) && !hasUrgency) {
        return {
          found: true,
          description: `${page.route} lacks urgency signals to motivate action.`,
          fix: 'Add scarcity or urgency messaging (cohort size limits, enrollment deadlines) near the CTA.',
        };
      }
      return { found: false, description: '', fix: '' };
    },
  },
  {
    name: 'missing_comparison_anchor',
    check: (page) => {
      const bodyText = page.headings.map((h) => h.text).join(' ');
      const hasComparison = /vs|compared|alternative|instead of|consulting|competitor/i.test(bodyText);
      if (page.route === '/pricing' && !hasComparison) {
        return {
          found: true,
          description: 'Pricing page lacks comparison anchoring against alternatives.',
          fix: 'Add a "vs. consulting" or "vs. hiring" comparison section to contextualize the price point.',
        };
      }
      return { found: false, description: '', fix: '' };
    },
  },
  {
    name: 'no_meta_description',
    check: (page) => {
      if (!page.metaTags['description'] && !page.metaTags['og:description']) {
        return {
          found: true,
          description: `${page.route} is missing a meta description tag.`,
          fix: 'Add a compelling meta description (150-160 characters) for SEO and social sharing.',
        };
      }
      return { found: false, description: '', fix: '' };
    },
  },
];

export async function runWebsiteImprovementStrategist(
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

      for (const check of STRATEGIC_CHECKS) {
        const result = check.check(page);
        if (result.found) {
          const issue = await WebsiteIssue.create({
            agent_name: AGENT_NAME,
            issue_type: 'recommendation',
            page_url: page.route,
            severity: 'info',
            confidence: 0.65,
            description: result.description,
            suggested_fix: result.fix,
            details: { check_name: check.name },
          });

          actions.push({
            campaign_id: '',
            action: `recommendation_${check.name}`,
            reason: result.description,
            confidence: 0.65,
            before_state: null,
            after_state: null,
            result: 'success',
            entity_type: 'system',
            entity_id: issue.id,
          });
        }
      }

      await logAgentActivity({
        agent_id: agentId,
        action: 'page_strategy_analyzed',
        result: 'success',
        details: {
          route: page.route,
          checks_run: STRATEGIC_CHECKS.length,
          recommendations: actions.filter((a) => a.action.startsWith('recommendation_')).length,
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
