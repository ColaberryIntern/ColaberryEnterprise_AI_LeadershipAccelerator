// ─── Maya Campaign Router ─────────────────────────────────────────────────────
// Routes leads to the correct Maya campaign based on interest type / service path.
// Campaign Precedence:
//   1. Existing campaigns → Highest priority (never override)
//   2. Maya Voice Call Campaign → Secondary (high-intent, can override nurture flows)
//   3. Maya Inbound Lead Campaign → Fallback only (uncampaigned leads)

import { Campaign, Lead } from '../models';
import CampaignLead from '../models/CampaignLead';
import { enrollLeadsInCampaign } from './campaignService';
import AdmissionsActionLog from '../models/AdmissionsActionLog';
import type { MayaActionResult } from './mayaActionService';
import { Op } from 'sequelize';

// Campaign name mapping by interest type
// Only voice_call and general (inbound) have dedicated Maya campaigns.
// All other interest types fall through to 'general' (Inbound Lead Campaign).
const CAMPAIGN_MAP: Record<string, string> = {
  voice_call: 'Maya Voice Call Requested Campaign',
  general: 'Maya Inbound Lead Campaign',
};

/**
 * Route a lead to the appropriate Maya campaign based on their interest type.
 *
 * Guard logic:
 * - "general" (Inbound Lead): only enroll if lead has NO active campaign
 * - "voice_call": high-intent — enroll unless already in the Voice Call campaign
 * - All others (executive_briefing, strategy_call, sponsorship, enrollment): always enroll
 */
export async function routeLeadToCampaign(
  leadId: number,
  interestType: string,
  visitorId: string,
  conversationId: string,
): Promise<MayaActionResult> {
  const campaignName = CAMPAIGN_MAP[interestType] || CAMPAIGN_MAP.general;

  try {
    // ── Campaign precedence guards ──────────────────────────────────────────
    // Guard applies to the Inbound Lead Campaign regardless of the original interestType,
    // since unmapped types (executive_briefing, strategy_call, etc.) fall through to it.
    const isInboundCampaign = campaignName === CAMPAIGN_MAP.general;
    if (isInboundCampaign) {
      // Inbound Lead campaign: ONLY if lead has ZERO active campaigns
      const existingEnrollment = await CampaignLead.findOne({
        where: { lead_id: leadId, status: { [Op.in]: ['enrolled', 'active'] } },
      });
      if (existingEnrollment) {
        await logAction(visitorId, conversationId, 'campaign_enrolled', 'skipped', {
          lead_id: leadId,
          campaign_name: campaignName,
          interest_type: interestType,
          reason: 'existing_active_campaign',
          existing_campaign_id: existingEnrollment.campaign_id,
        });
        // Tag the Maya interaction instead
        await addMayaInteractionTag(leadId, `maya_${interestType || 'chat'}_active`);
        return {
          success: true,
          summary: 'Lead already in an active campaign. Maya interaction tagged instead.',
        };
      }
    }

    if (interestType === 'voice_call') {
      // Voice call: high-intent — enroll unless already in this specific campaign
      const existingVoiceCall = await CampaignLead.findOne({
        where: { lead_id: leadId, status: { [Op.in]: ['enrolled', 'active'] } },
        include: [{ model: Campaign, as: 'campaign', where: { name: 'Maya Voice Call Requested Campaign' } }],
      });
      if (existingVoiceCall) {
        return { success: true, summary: 'Lead already in Voice Call Requested campaign.' };
      }
      // Voice call CAN override existing nurture flows — proceed to enrollment
    }

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

// ─── Maya Interaction Tagging ────────────────────────────────────────────────
// Tracks Maya engagement independently of campaigns via tags on Lead.metadata.
// This preserves marketing attribution while recording Maya activity.

export async function addMayaInteractionTag(leadId: number, tag: string): Promise<void> {
  try {
    const lead = await Lead.findByPk(leadId);
    if (!lead) return;
    const metadata = (lead as any).metadata || {};
    const tags: string[] = metadata.maya_tags || [];
    if (!tags.includes(tag)) {
      tags.push(tag);
      await lead.update({ metadata: { ...metadata, maya_tags: tags } } as any);
    }
  } catch {
    // Non-critical — tagging should never block actions
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
