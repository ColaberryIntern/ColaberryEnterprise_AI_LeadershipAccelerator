// ─── Campaign Approval Service ──────────────────────────────────────────────
// State machine for campaign approval workflow.
// Status flow: draft → pending_approval → approved → live → paused → completed

import Campaign from '../models/Campaign';
import { generateTrackedLink, validateCampaignForPublish } from './campaignLinkService';
import { emitExecutiveEvent } from './executiveAwarenessService';

// ─── Submit for Approval ────────────────────────────────────────────────────

export async function submitForApproval(campaignId: string): Promise<Campaign> {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  if (campaign.approval_status !== 'draft') {
    throw new Error(`Cannot submit: campaign is "${campaign.approval_status}", must be "draft"`);
  }

  await campaign.update({ approval_status: 'pending_approval' });

  emitExecutiveEvent({
    category: 'campaign',
    severity: 'info',
    title: 'Campaign submitted for approval',
    description: `"${campaign.name}" (${campaign.type}) submitted for review.`,
    entityType: 'campaign',
    entityId: campaignId,
  }).catch(() => {});

  return campaign;
}

// ─── Approve Campaign ───────────────────────────────────────────────────────

export async function approveCampaign(
  campaignId: string,
  adminId: string,
): Promise<Campaign> {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  if (campaign.approval_status !== 'pending_approval') {
    throw new Error(`Cannot approve: campaign is "${campaign.approval_status}", must be "pending_approval"`);
  }

  await campaign.update({
    approval_status: 'approved',
    approved_by: adminId,
    approved_at: new Date(),
  });

  // Auto-generate tracking link if channel and destination_path are set
  if (campaign.channel && campaign.destination_path) {
    try {
      await generateTrackedLink(campaignId);
    } catch (err: any) {
      console.warn('[CampaignApproval] Auto link generation failed:', err.message);
    }
  }

  emitExecutiveEvent({
    category: 'campaign',
    severity: 'important',
    title: 'Campaign approved',
    description: `"${campaign.name}" approved and tracking link generated.`,
    entityType: 'campaign',
    entityId: campaignId,
  }).catch(() => {});

  return campaign.reload();
}

// ─── Reject Campaign ────────────────────────────────────────────────────────

export async function rejectCampaign(
  campaignId: string,
  reason: string,
): Promise<Campaign> {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  if (campaign.approval_status !== 'pending_approval') {
    throw new Error(`Cannot reject: campaign is "${campaign.approval_status}", must be "pending_approval"`);
  }

  await campaign.update({ approval_status: 'draft' });

  emitExecutiveEvent({
    category: 'campaign',
    severity: 'info',
    title: 'Campaign approval rejected',
    description: `"${campaign.name}" rejected. Reason: ${reason}`,
    entityType: 'campaign',
    entityId: campaignId,
    metadata: { rejection_reason: reason },
  }).catch(() => {});

  return campaign;
}

// ─── Go Live ────────────────────────────────────────────────────────────────

export async function goLive(campaignId: string): Promise<Campaign> {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const validation = await validateCampaignForPublish(campaignId);
  if (!validation.valid) {
    throw new Error(`Cannot go live: ${validation.errors.join('; ')}`);
  }

  await campaign.update({
    approval_status: 'live',
    status: 'active',
    started_at: campaign.started_at || new Date(),
  });

  emitExecutiveEvent({
    category: 'campaign',
    severity: 'important',
    title: 'Campaign is now live',
    description: `"${campaign.name}" (${campaign.channel}) is now live at ${campaign.tracking_link || campaign.destination_path}.`,
    entityType: 'campaign',
    entityId: campaignId,
  }).catch(() => {});

  return campaign;
}

// ─── Pause Campaign ─────────────────────────────────────────────────────────

export async function pauseCampaignApproval(campaignId: string): Promise<Campaign> {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  if (!['live', 'approved'].includes(campaign.approval_status)) {
    throw new Error(`Cannot pause: campaign is "${campaign.approval_status}"`);
  }

  await campaign.update({
    approval_status: 'paused',
    status: 'paused',
  });

  return campaign;
}

// ─── Complete Campaign ──────────────────────────────────────────────────────

export async function completeCampaignApproval(campaignId: string): Promise<Campaign> {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  if (!['live', 'paused'].includes(campaign.approval_status)) {
    throw new Error(`Cannot complete: campaign is "${campaign.approval_status}"`);
  }

  await campaign.update({
    approval_status: 'completed',
    status: 'completed',
    completed_at: new Date(),
  });

  return campaign;
}
