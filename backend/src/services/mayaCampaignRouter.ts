// ─── Maya Campaign Router ─────────────────────────────────────────────────────
// Routes leads to the correct Maya campaign based on interest type / service path.

import { Campaign } from '../models';
import { enrollLeadsInCampaign } from './campaignService';
import AdmissionsActionLog from '../models/AdmissionsActionLog';
import type { MayaActionResult } from './mayaActionService';

// Campaign name mapping by interest type
const CAMPAIGN_MAP: Record<string, string> = {
  executive_briefing: 'Maya Executive Briefing Campaign',
  strategy_call: 'Maya Strategy Call Campaign',
  sponsorship: 'Maya Sponsorship Campaign',
  enrollment: 'Maya Enrollment Campaign',
  general: 'Maya Inbound Lead Campaign',
};

/**
 * Route a lead to the appropriate Maya campaign based on their interest type.
 */
export async function routeLeadToCampaign(
  leadId: number,
  interestType: string,
  visitorId: string,
  conversationId: string,
): Promise<MayaActionResult> {
  const campaignName = CAMPAIGN_MAP[interestType] || CAMPAIGN_MAP.general;

  try {
    const campaign = await Campaign.findOne({
      where: { name: campaignName, status: 'active' },
    });

    if (!campaign) {
      // Try draft campaigns as fallback (newly seeded campaigns start as draft)
      const draftCampaign = await Campaign.findOne({
        where: { name: campaignName },
      });

      if (!draftCampaign) {
        console.warn(`[MayaCampaignRouter] Campaign not found: ${campaignName}`);
        await logAction(visitorId, conversationId, 'campaign_enrolled', 'skipped', {
          lead_id: leadId,
          campaign_name: campaignName,
          reason: 'Campaign not found',
        });
        return {
          success: false,
          summary: `Campaign "${campaignName}" not found. Lead not enrolled in a nurture sequence.`,
        };
      }

      // Found draft — log but don't fail
      await logAction(visitorId, conversationId, 'campaign_enrolled', 'skipped', {
        lead_id: leadId,
        campaign_name: campaignName,
        reason: 'Campaign exists but is not active',
      });
      return {
        success: true,
        summary: `Campaign "${campaignName}" exists but is not yet active. Lead flagged for enrollment when activated.`,
        details: { campaign_id: draftCampaign.id, campaign_name: campaignName, status: 'pending_activation' },
      };
    }

    // Enroll the lead
    const results = await enrollLeadsInCampaign(campaign.id, [leadId]);
    const result = results[0];

    if (result?.status === 'error') {
      await logAction(visitorId, conversationId, 'campaign_enrolled', 'failed', {
        lead_id: leadId,
        campaign_name: campaignName,
        error: result.error,
      });
      return {
        success: false,
        summary: `Failed to enroll in campaign: ${result.error}`,
      };
    }

    await logAction(visitorId, conversationId, 'campaign_enrolled', 'completed', {
      lead_id: leadId,
      campaign_id: campaign.id,
      campaign_name: campaignName,
      interest_type: interestType,
      enrollment_status: result?.status,
    });

    return {
      success: true,
      summary: `Lead enrolled in "${campaignName}"`,
      details: { campaign_id: campaign.id, campaign_name: campaignName },
    };
  } catch (err: any) {
    await logAction(visitorId, conversationId, 'campaign_enrolled', 'failed', {
      lead_id: leadId,
      campaign_name: campaignName,
      error: err.message,
    });
    return {
      success: false,
      summary: `Campaign enrollment failed: ${err.message}`,
    };
  }
}

// ─── Logging Helper ─────────────────────────────────────────────────────────

async function logAction(
  visitorId: string,
  conversationId: string,
  actionType: string,
  status: string,
  details: Record<string, any>,
): Promise<void> {
  try {
    await AdmissionsActionLog.create({
      visitor_id: visitorId,
      conversation_id: conversationId,
      action_type: actionType,
      action_details: details,
      status,
      agent_name: 'Maya',
    });
  } catch {
    // Non-critical
  }
}
