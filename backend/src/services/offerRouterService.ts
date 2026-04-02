import { Lead, Campaign } from '../models';
import { scoreLeadForOffers, OfferScore } from './offerScoringService';
import { enrollLeadsInCampaign } from './campaignService';

// Advisory leads go to workforce_designer_entry, NOT cold_outbound
// Cold outbound is for Apollo-sourced cold leads only
const OFFER_TO_CAMPAIGN_TYPE_ADVISORY: Record<string, string> = {
  accelerator: 'workforce_designer_entry',
  advisory: 'advisory_pipeline',
  custom_build: 'custom_build_pipeline',
  enterprise_deal: 'enterprise_pipeline',
};

const OFFER_TO_CAMPAIGN_TYPE_COLD: Record<string, string> = {
  accelerator: 'cold_outbound',
  advisory: 'advisory_pipeline',
  custom_build: 'custom_build_pipeline',
  enterprise_deal: 'enterprise_pipeline',
};

export async function classifyAndRouteLead(leadId: number): Promise<OfferScore | null> {
  const lead = await Lead.findByPk(leadId);
  if (!lead) return null;

  const score = await scoreLeadForOffers(lead);

  // Update lead with classification
  await lead.update({
    lead_score: score.lead_score,
    qualification_level: score.qualification_level,
    recommended_offer: score.recommended_offer,
    secondary_offers: score.secondary_offers,
  } as any);

  // Find and enroll in the matching campaign
  // Advisory leads get warm campaigns, cold leads get cold campaigns
  const isAdvisoryLead = !!(lead as any).advisory_session_id || (lead as any).advisory_source;
  const campaignMap = isAdvisoryLead ? OFFER_TO_CAMPAIGN_TYPE_ADVISORY : OFFER_TO_CAMPAIGN_TYPE_COLD;
  const campaignType = campaignMap[score.recommended_offer];
  if (campaignType) {
    const campaign = await Campaign.findOne({
      where: { type: campaignType, status: 'active' },
    });
    if (campaign) {
      try {
        await enrollLeadsInCampaign(campaign.id, [leadId]);
        console.log(`[OfferRouter] Lead ${leadId} classified as ${score.recommended_offer}, enrolled in ${campaign.name}`);
      } catch (err: any) {
        console.warn(`[OfferRouter] Enrollment failed for lead ${leadId}: ${err.message}`);
      }
    }
  }

  return score;
}

export async function classifyLeadOnly(leadId: number): Promise<OfferScore | null> {
  const lead = await Lead.findByPk(leadId);
  if (!lead) return null;
  return scoreLeadForOffers(lead);
}
