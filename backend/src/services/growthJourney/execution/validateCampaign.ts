import { Campaign, FollowUpSequence } from '../../../models';
import { isRegisteredJourneyCampaignKey } from './campaignKeys';

/**
 * Is this campaign one a journey decision may execute into, right now (Phase 5 T505)?
 *
 * The campaign engine's own guards are weaker than they look: `approval_status`
 * is read by no send path, a missing `campaignId` skips the campaign guard, the
 * send window and the brand gate, and every boot deactivates the Explorer
 * sequences. So the journey checks, at plan time AND again at enrolment time:
 *
 *   registered      the key is in `campaignKeys.ts`
 *   present         the row exists (found by `settings.campaign_key`, never by name)
 *   brand-scoped    its tenant and brand are the decision's - a campaign without a
 *                   brand would pass the send path's brand gate by default
 *   approved        `approval_status` is `approved` or `live` - a human said so
 *   sequenced       it has a sequence to enrol into
 *   for LIMITED     the campaign is `active` and its sequence `is_active` - a
 *                   cohort rule releases nothing a human has not switched on
 *
 * A refusal names its reason; a pass hands back the ids the adapter needs and
 * nothing else.
 */

export type CampaignRefusal =
  | 'campaign_not_registered'
  | 'campaign_missing'
  | 'campaign_not_brand_scoped'
  | 'campaign_not_approved'
  | 'campaign_no_sequence'
  | 'campaign_not_active'
  | 'sequence_inactive';

export const APPROVED_STATUSES: readonly string[] = ['approved', 'live'];

export interface ValidatedCampaign {
  id: string;
  campaign_key: string;
  sequence_id: string;
  status: string;
  approval_status: string;
}

export type ValidateCampaignResult =
  | { ok: true; campaign: ValidatedCampaign }
  | { ok: false; reason: CampaignRefusal };

export interface ValidateCampaignArgs {
  campaignKey: string | null | undefined;
  tenantId: string;
  brandId: string;
  mode: 'review' | 'limited';
}

const refuse = (reason: CampaignRefusal): ValidateCampaignResult => ({ ok: false, reason });

export async function validateCampaign(args: ValidateCampaignArgs): Promise<ValidateCampaignResult> {
  if (!isRegisteredJourneyCampaignKey(args.campaignKey)) return refuse('campaign_not_registered');

  const row = await Campaign.findOne({ where: { settings: { campaign_key: args.campaignKey } } as never });
  if (!row) return refuse('campaign_missing');
  const campaign = row as unknown as { id: string; tenant_id: string | null; brand_id: string | null; status: string; approval_status: string | null; sequence_id: string | null };

  if (campaign.tenant_id !== args.tenantId || campaign.brand_id !== args.brandId) return refuse('campaign_not_brand_scoped');
  if (!APPROVED_STATUSES.includes(campaign.approval_status ?? '')) return refuse('campaign_not_approved');
  if (!campaign.sequence_id) return refuse('campaign_no_sequence');

  if (args.mode === 'limited') {
    if (campaign.status !== 'active') return refuse('campaign_not_active');
    const sequence = await FollowUpSequence.findByPk(campaign.sequence_id, { attributes: ['id', 'is_active'] } as never);
    if (!sequence || (sequence as unknown as { is_active: boolean }).is_active !== true) return refuse('sequence_inactive');
  }

  return {
    ok: true,
    campaign: {
      id: campaign.id,
      campaign_key: args.campaignKey,
      sequence_id: campaign.sequence_id,
      status: campaign.status,
      approval_status: campaign.approval_status ?? '',
    },
  };
}
