import { Op, fn, col } from 'sequelize';
import CallContactLog from '../../../models/CallContactLog';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsCallComplianceMonitor';

// Campaign priority: higher index = higher priority
const CAMPAIGN_PRIORITY: Record<string, number> = {
  marketing_campaign: 1,
  admissions_outreach: 2,
  appointment_reminder: 3,
  callback_request: 4,
};

/**
 * Detect duplicate outreach, campaign conflicts, and spam patterns.
 * Schedule: every 15 minutes.
 */
export async function runAdmissionsCallComplianceAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find visitors with multiple calls in 24 hours
    const duplicates = await CallContactLog.findAll({
      attributes: [
        'visitor_id',
        [fn('COUNT', col('id')), 'call_count'],
      ],
      where: {
        call_timestamp: { [Op.gte]: twentyFourHoursAgo },
        call_status: { [Op.in]: ['completed', 'pending'] },
      },
      group: ['visitor_id'],
      having: { [Op.and]: [{ call_count: { [Op.gt]: 1 } } as any] },
      raw: true,
    }) as any[];

    for (const dup of duplicates) {
      // Get the actual calls for this visitor
      const calls = await CallContactLog.findAll({
        where: {
          visitor_id: dup.visitor_id,
          call_timestamp: { [Op.gte]: twentyFourHoursAgo },
          call_status: { [Op.in]: ['completed', 'pending'] },
        },
        order: [['call_timestamp', 'DESC']],
      });

      // Check for campaign conflicts
      const campaignSources = [...new Set(calls.map((c) => c.campaign_source).filter(Boolean))];
      const hasConflict = campaignSources.length > 1;

      let highestPriorityCampaign: string | null = null;
      if (hasConflict) {
        highestPriorityCampaign = campaignSources.reduce((best, source) => {
          const currentPriority = CAMPAIGN_PRIORITY[source as string] || 0;
          const bestPriority = CAMPAIGN_PRIORITY[best as string] || 0;
          return currentPriority > bestPriority ? source : best;
        }, campaignSources[0]) as string;
      }

      actions.push({
        campaign_id: '',
        action: 'compliance_violation_detected',
        reason: hasConflict
          ? `Visitor ${dup.visitor_id}: ${dup.call_count} calls in 24h with campaign conflict (${campaignSources.join(', ')}). Priority: ${highestPriorityCampaign}`
          : `Visitor ${dup.visitor_id}: ${dup.call_count} duplicate calls within 24h`,
        confidence: 0.95,
        before_state: {
          call_count: parseInt(dup.call_count, 10),
          campaign_sources: campaignSources,
        },
        after_state: {
          violation: true,
          has_campaign_conflict: hasConflict,
          highest_priority_campaign: highestPriorityCampaign,
        },
        result: 'flagged',
        entity_type: 'visitor',
        entity_id: dup.visitor_id,
      });
    }

    await logAgentActivity({
      agent_id: agentId,
      action: 'call_compliance_scan',
      result: 'success',
      details: {
        violations_found: actions.length,
        scan_window: '24h',
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
    entities_processed: actions.length,
  };
}
