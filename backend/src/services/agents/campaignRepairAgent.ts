import { Op } from 'sequelize';
import { ScheduledEmail, Campaign, CampaignLead } from '../../models';
import CampaignError from '../../models/CampaignError';
import { logAgentActivity, logAiEvent } from '../aiEventService';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'CampaignRepairAgent';
const RETRY_DELAY_MINUTES = 30;

/**
 * Detect and repair broken campaign automations:
 * - Retry failed sends that haven't exhausted max_attempts
 * - Log errors for campaigns with no pending actions but incomplete leads
 */
export async function runCampaignRepairAgent(agentId: string): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const campaignIds = new Set<string>();

  try {
    // --- 1. Retry failed ScheduledEmails ---
    const failedActions = await ScheduledEmail.findAll({
      where: {
        status: 'failed',
        attempts_made: { [Op.lt]: 3 }, // Default max attempts
        campaign_id: { [Op.ne]: null as any },
      },
      limit: 50, // Process in batches
      order: [['created_at', 'DESC']],
    });

    for (const action of failedActions) {
      if (action.campaign_id) campaignIds.add(action.campaign_id);

      const beforeState = {
        status: action.status,
        attempts_made: action.attempts_made,
        scheduled_for: action.scheduled_for,
      };

      try {
        const newScheduledFor = new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000);
        await action.update({
          status: 'pending',
          scheduled_for: newScheduledFor,
          attempts_made: (action.attempts_made || 0), // Keep attempt count, scheduler increments on next send
        });

        const afterState = {
          status: 'pending',
          attempts_made: action.attempts_made,
          scheduled_for: newScheduledFor.toISOString(),
        };

        await logAgentActivity({
          agent_id: agentId,
          campaign_id: action.campaign_id || undefined,
          action: 'retry_failed_send',
          reason: `ScheduledEmail ${action.id} failed with ${action.attempts_made} attempts, retrying`,
          confidence: 0.90,
          before_state: beforeState,
          after_state: afterState,
          result: 'success',
          details: { scheduled_email_id: action.id, channel: action.channel },
        });

        actions.push({
          campaign_id: action.campaign_id || '',
          action: 'retry_failed_send',
          reason: `Retried failed ${action.channel} send`,
          confidence: 0.90,
          before_state: beforeState,
          after_state: afterState,
          result: 'success',
        });
      } catch (err: any) {
        errors.push(`Failed to retry action ${action.id}: ${err.message}`);
      }
    }

    // --- 2. Detect stalled campaigns (active but no pending actions, incomplete leads) ---
    const activeCampaigns = await Campaign.findAll({
      where: { status: 'active' },
    });

    for (const campaign of activeCampaigns) {
      campaignIds.add(campaign.id);

      const pendingCount = await ScheduledEmail.count({
        where: { campaign_id: campaign.id, status: 'pending' },
      });

      const incompleteLeads = await CampaignLead.count({
        where: { campaign_id: campaign.id, status: { [Op.in]: ['enrolled', 'active'] } },
      });

      if (pendingCount === 0 && incompleteLeads > 0) {
        // Log a warning error for admin review
        const existing = await CampaignError.findOne({
          where: {
            campaign_id: campaign.id,
            component: 'automation',
            resolved: false,
            error_message: { [Op.like]: '%stalled%' },
          },
        });

        if (!existing) {
          await CampaignError.create({
            campaign_id: campaign.id,
            component: 'automation',
            severity: 'warning',
            error_message: `Campaign stalled: ${incompleteLeads} active leads but 0 pending actions`,
            context: { incomplete_leads: incompleteLeads, pending_actions: 0 },
          });

          await logAgentActivity({
            agent_id: agentId,
            campaign_id: campaign.id,
            action: 'detect_stalled_campaign',
            reason: `${incompleteLeads} active leads but no pending scheduled actions`,
            confidence: 0.85,
            before_state: null,
            after_state: null,
            result: 'success',
            details: { incomplete_leads: incompleteLeads },
          });

          actions.push({
            campaign_id: campaign.id,
            action: 'detect_stalled_campaign',
            reason: `Flagged stalled campaign with ${incompleteLeads} active leads`,
            confidence: 0.85,
            before_state: null,
            after_state: null,
            result: 'success',
          });
        }
      }
    }

    // --- 3. Auto-resolve old errors that are no longer relevant ---
    const resolvedCount = await CampaignError.update(
      { resolved: true, resolved_at: new Date(), resolved_by: `auto:${AGENT_NAME}` },
      {
        where: {
          resolved: false,
          created_at: { [Op.lt]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Older than 7 days
        },
      },
    );

    if (resolvedCount[0] > 0) {
      await logAiEvent(AGENT_NAME, 'auto_resolve_stale_errors', undefined, undefined, {
        resolved_count: resolvedCount[0],
      });
    }
  } catch (err: any) {
    errors.push(`Agent error: ${err.message}`);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: campaignIds.size,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
  };
}
