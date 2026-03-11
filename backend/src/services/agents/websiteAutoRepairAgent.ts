import { Op } from 'sequelize';
import crypto from 'crypto';
import WebsiteIssue from '../../models/WebsiteIssue';
import IntelligenceDecision from '../../models/IntelligenceDecision';
import { logAgentActivity, logAiEvent } from '../aiEventService';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'WebsiteAutoRepairAgent';
const MAX_REPAIRS_PER_RUN = 20;

/**
 * Determine action tier based on confidence:
 *  - >= 0.95: auto_execute (log + mark resolved)
 *  - 0.80–0.94: require_approval (COO review)
 *  - < 0.80: block (CEO review)
 */
function decisionTier(confidence: number): { action: string; status: string; riskTier: string } {
  if (confidence >= 0.95) return { action: 'auto_execute', status: 'executed', riskTier: 'safe' };
  if (confidence >= 0.80) return { action: 'require_approval', status: 'proposed', riskTier: 'moderate' };
  return { action: 'block', status: 'proposed', riskTier: 'risky' };
}

export async function runWebsiteAutoRepairAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // Find open issues ordered by severity and confidence
    const openIssues = await WebsiteIssue.findAll({
      where: { status: 'open' },
      order: [
        ['severity', 'ASC'], // critical first
        ['confidence', 'DESC'],
      ],
      limit: MAX_REPAIRS_PER_RUN,
    });

    for (const issue of openIssues) {
      const confidence = parseFloat(String(issue.confidence));
      const tier = decisionTier(confidence);
      const traceId = crypto.randomUUID();

      if (tier.action === 'auto_execute') {
        // High confidence — mark as auto-repaired with suggested fix logged
        await issue.update({
          status: 'auto_repaired',
          repaired_at: new Date(),
          repaired_by: AGENT_NAME,
          updated_at: new Date(),
        });

        // Log the decision
        await IntelligenceDecision.create({
          trace_id: traceId,
          problem_detected: issue.description,
          analysis_summary: `Auto-repair: ${issue.suggested_fix || 'No fix suggested'}`,
          recommended_action: 'update_agent_config' as any,
          action_details: {
            issue_id: issue.id,
            issue_type: issue.issue_type,
            page_url: issue.page_url,
            suggested_fix: issue.suggested_fix,
          },
          risk_score: 10,
          confidence_score: Math.round(confidence * 100),
          risk_tier: 'safe',
          execution_status: 'executed',
          executed_at: new Date(),
          executed_by: AGENT_NAME,
          before_state: { status: 'open', issue_type: issue.issue_type },
          after_state: { status: 'auto_repaired' },
          reasoning: `Confidence ${confidence} >= 0.95 threshold. Auto-resolved.`,
        });

        actions.push({
          campaign_id: '',
          action: 'auto_repaired',
          reason: `High confidence (${confidence}) issue auto-resolved: ${issue.description.slice(0, 100)}`,
          confidence,
          before_state: { status: 'open' },
          after_state: { status: 'auto_repaired' },
          result: 'success',
          entity_type: 'system',
          entity_id: issue.id,
        });
      } else {
        // Requires approval — create IntelligenceDecision for COO/CEO
        await IntelligenceDecision.create({
          trace_id: traceId,
          problem_detected: issue.description,
          analysis_summary: `Website issue requires ${tier.action === 'require_approval' ? 'COO' : 'CEO'} review: ${issue.suggested_fix || 'No fix suggested'}`,
          recommended_action: 'update_agent_config' as any,
          action_details: {
            issue_id: issue.id,
            issue_type: issue.issue_type,
            page_url: issue.page_url,
            severity: issue.severity,
            suggested_fix: issue.suggested_fix,
            element_selector: issue.element_selector,
          },
          risk_score: tier.riskTier === 'moderate' ? 40 : 70,
          confidence_score: Math.round(confidence * 100),
          risk_tier: tier.riskTier as any,
          execution_status: 'proposed',
          reasoning: `Confidence ${confidence} requires ${tier.action === 'require_approval' ? 'COO' : 'CEO'} approval before action.`,
        });

        actions.push({
          campaign_id: '',
          action: 'routed_for_approval',
          reason: `${tier.riskTier} confidence (${confidence}): ${issue.description.slice(0, 100)}`,
          confidence,
          before_state: { status: 'open' },
          after_state: { status: 'proposed', tier: tier.riskTier },
          result: 'success',
          entity_type: 'system',
          entity_id: issue.id,
        });
      }

      await logAgentActivity({
        agent_id: agentId,
        action: tier.action,
        result: 'success',
        details: {
          issue_id: issue.id,
          issue_type: issue.issue_type,
          page_url: issue.page_url,
          confidence,
          tier: tier.riskTier,
        },
      }).catch(() => {});
    }

    await logAiEvent('website_intelligence', 'auto_repair_completed', 'system', undefined, {
      issues_processed: openIssues.length,
      auto_repaired: actions.filter((a) => a.action === 'auto_repaired').length,
      routed_for_approval: actions.filter((a) => a.action === 'routed_for_approval').length,
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
    entities_processed: actions.length,
  };
}
