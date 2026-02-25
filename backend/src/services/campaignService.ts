import { Op } from 'sequelize';
import { Campaign, CampaignLead, Lead, FollowUpSequence, ScheduledEmail, AdminUser } from '../models';
import { enrollLeadInSequence } from './sequenceService';

export type CampaignType = 'warm_nurture' | 'cold_outbound' | 're_engagement';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';

interface CreateCampaignParams {
  name: string;
  description?: string;
  type: CampaignType;
  sequence_id?: string;
  targeting_criteria?: Record<string, any>;
  channel_config?: Record<string, any>;
  budget_total?: number;
  ai_system_prompt?: string;
  created_by: string;
}

export async function createCampaign(params: CreateCampaignParams) {
  return Campaign.create({
    name: params.name,
    description: params.description || '',
    type: params.type,
    status: 'draft',
    sequence_id: params.sequence_id || null,
    targeting_criteria: params.targeting_criteria || {},
    channel_config: params.channel_config || {
      email: { enabled: true, daily_limit: 50 },
      voice: { enabled: false },
      sms: { enabled: false },
    },
    budget_total: params.budget_total || null,
    budget_spent: 0,
    ai_system_prompt: params.ai_system_prompt || null,
    created_by: params.created_by,
  } as any);
}

interface ListCampaignsParams {
  type?: CampaignType;
  status?: CampaignStatus;
  page?: number;
  limit?: number;
}

export async function listCampaigns(params: ListCampaignsParams = {}) {
  const page = params.page || 1;
  const limit = params.limit || 25;
  const offset = (page - 1) * limit;

  const where: any = {};
  if (params.type) where.type = params.type;
  if (params.status) where.status = params.status;

  const { rows: campaigns, count: total } = await Campaign.findAndCountAll({
    where,
    include: [
      { model: FollowUpSequence, as: 'sequence', attributes: ['id', 'name'] },
      { model: AdminUser, as: 'creator', attributes: ['id', 'email'] },
    ],
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });

  // Attach lead counts
  const campaignData = await Promise.all(
    campaigns.map(async (c) => {
      const leadCount = await CampaignLead.count({ where: { campaign_id: c.id } });
      const activeCount = await CampaignLead.count({ where: { campaign_id: c.id, status: 'active' } });
      return {
        ...c.toJSON(),
        lead_count: leadCount,
        active_lead_count: activeCount,
      };
    })
  );

  return { campaigns: campaignData, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getCampaignById(id: string) {
  const campaign = await Campaign.findByPk(id, {
    include: [
      { model: FollowUpSequence, as: 'sequence' },
      { model: AdminUser, as: 'creator', attributes: ['id', 'email'] },
    ],
  });

  if (!campaign) return null;

  const leadCount = await CampaignLead.count({ where: { campaign_id: id } });
  const statusCounts: Record<string, number> = {};
  for (const status of ['enrolled', 'active', 'paused', 'completed', 'removed']) {
    statusCounts[status] = await CampaignLead.count({ where: { campaign_id: id, status } });
  }

  return { ...campaign.toJSON(), lead_count: leadCount, lead_status_counts: statusCounts };
}

export async function updateCampaign(id: string, updates: Record<string, any>) {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) return null;

  const allowedFields = [
    'name', 'description', 'type', 'sequence_id', 'targeting_criteria',
    'channel_config', 'budget_total', 'ai_system_prompt',
  ];
  const filtered: Record<string, any> = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  filtered.updated_at = new Date();

  await campaign.update(filtered);
  return campaign.reload({
    include: [
      { model: FollowUpSequence, as: 'sequence', attributes: ['id', 'name'] },
      { model: AdminUser, as: 'creator', attributes: ['id', 'email'] },
    ],
  });
}

export async function deleteCampaign(id: string) {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) return false;

  // Cancel pending actions
  await ScheduledEmail.update(
    { status: 'cancelled' } as any,
    { where: { campaign_id: id, status: 'pending' } }
  );

  // Remove campaign leads
  await CampaignLead.destroy({ where: { campaign_id: id } });
  await campaign.destroy();
  return true;
}

export async function activateCampaign(id: string) {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status !== 'draft' && campaign.status !== 'paused') {
    throw new Error(`Cannot activate campaign in '${campaign.status}' status`);
  }

  await campaign.update({
    status: 'active',
    started_at: campaign.started_at || new Date(),
    updated_at: new Date(),
  } as any);

  return campaign;
}

export async function pauseCampaign(id: string) {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status !== 'active') throw new Error('Campaign is not active');

  // Pause pending actions
  await ScheduledEmail.update(
    { status: 'paused' } as any,
    { where: { campaign_id: id, status: 'pending' } }
  );

  await campaign.update({ status: 'paused', updated_at: new Date() } as any);
  return campaign;
}

export async function completeCampaign(id: string) {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) throw new Error('Campaign not found');

  // Cancel remaining pending actions
  await ScheduledEmail.update(
    { status: 'cancelled' } as any,
    { where: { campaign_id: id, status: 'pending' } }
  );

  // Mark all active campaign leads as completed
  await CampaignLead.update(
    { status: 'completed', completed_at: new Date() } as any,
    { where: { campaign_id: id, status: { [Op.in]: ['enrolled', 'active'] } } }
  );

  await campaign.update({ status: 'completed', completed_at: new Date(), updated_at: new Date() } as any);
  return campaign;
}

export async function enrollLeadsInCampaign(campaignId: string, leadIds: number[]) {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (!campaign.sequence_id) throw new Error('Campaign has no sequence assigned');

  const results: { leadId: number; status: string; error?: string }[] = [];

  for (const leadId of leadIds) {
    try {
      // Check if already enrolled
      const existing = await CampaignLead.findOne({
        where: { campaign_id: campaignId, lead_id: leadId },
      });
      if (existing) {
        results.push({ leadId, status: 'already_enrolled' });
        continue;
      }

      // Create campaign-lead record
      await CampaignLead.create({
        campaign_id: campaignId,
        lead_id: leadId,
        status: campaign.status === 'active' ? 'active' : 'enrolled',
      } as any);

      // If campaign is active, enroll in the sequence
      if (campaign.status === 'active') {
        await enrollLeadInSequence(leadId, campaign.sequence_id, campaignId);
      }

      results.push({ leadId, status: 'enrolled' });
    } catch (err: any) {
      results.push({ leadId, status: 'error', error: err.message });
    }
  }

  return results;
}

export async function removeLeadFromCampaign(campaignId: string, leadId: number) {
  const cl = await CampaignLead.findOne({ where: { campaign_id: campaignId, lead_id: leadId } });
  if (!cl) throw new Error('Lead not enrolled in this campaign');

  // Cancel pending actions for this lead in this campaign
  await ScheduledEmail.update(
    { status: 'cancelled' } as any,
    { where: { campaign_id: campaignId, lead_id: leadId, status: 'pending' } }
  );

  await cl.update({ status: 'removed' } as any);
  return cl;
}

export async function getMatchingLeads(campaignId: string) {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const criteria = campaign.targeting_criteria || {};
  const where: any = {};

  if (criteria.industries?.length) {
    where.industry = { [Op.in]: criteria.industries };
  }

  if (criteria.title_patterns?.length) {
    where[Op.or] = criteria.title_patterns.map((p: string) => ({
      title: { [Op.iLike]: `%${p}%` },
    }));
  }

  if (criteria.company_size_min || criteria.company_size_max) {
    where.employee_count = {};
    if (criteria.company_size_min) where.employee_count[Op.gte] = criteria.company_size_min;
    if (criteria.company_size_max) where.employee_count[Op.lte] = criteria.company_size_max;
  }

  if (criteria.score_min !== undefined || criteria.score_max !== undefined) {
    where.lead_score = {};
    if (criteria.score_min !== undefined) where.lead_score[Op.gte] = criteria.score_min;
    if (criteria.score_max !== undefined) where.lead_score[Op.lte] = criteria.score_max;
  }

  if (criteria.lead_source_type) {
    where.lead_source_type = criteria.lead_source_type;
  }

  // Exclude leads already in this campaign
  const enrolledLeadIds = (
    await CampaignLead.findAll({
      where: { campaign_id: campaignId, status: { [Op.ne]: 'removed' } },
      attributes: ['lead_id'],
    })
  ).map((cl) => cl.lead_id);

  if (enrolledLeadIds.length > 0) {
    where.id = { [Op.notIn]: enrolledLeadIds };
  }

  const leads = await Lead.findAll({
    where,
    order: [['lead_score', 'DESC']],
    limit: 100,
  });

  return leads;
}

export async function getCampaignStats(id: string) {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) throw new Error('Campaign not found');

  const totalLeads = await CampaignLead.count({ where: { campaign_id: id } });
  const leadsByStatus: Record<string, number> = {};
  for (const status of ['enrolled', 'active', 'paused', 'completed', 'removed']) {
    leadsByStatus[status] = await CampaignLead.count({ where: { campaign_id: id, status } });
  }

  const totalActions = await ScheduledEmail.count({ where: { campaign_id: id } });
  const actionsByStatus: Record<string, number> = {};
  for (const status of ['pending', 'sent', 'failed', 'cancelled', 'paused']) {
    actionsByStatus[status] = await ScheduledEmail.count({ where: { campaign_id: id, status } });
  }

  const actionsByChannel: Record<string, number> = {};
  for (const channel of ['email', 'voice', 'sms']) {
    actionsByChannel[channel] = await ScheduledEmail.count({ where: { campaign_id: id, channel } });
  }

  const aiGenerated = await ScheduledEmail.count({ where: { campaign_id: id, ai_generated: true } });

  return {
    total_leads: totalLeads,
    leads_by_status: leadsByStatus,
    total_actions: totalActions,
    actions_by_status: actionsByStatus,
    actions_by_channel: actionsByChannel,
    ai_generated_count: aiGenerated,
    budget_total: campaign.budget_total,
    budget_spent: campaign.budget_spent,
  };
}

export async function getCampaignLeads(
  campaignId: string,
  params: { status?: string; page?: number; limit?: number } = {}
) {
  const page = params.page || 1;
  const limit = params.limit || 25;
  const offset = (page - 1) * limit;

  const where: any = { campaign_id: campaignId };
  if (params.status) where.status = params.status;

  const { rows, count } = await CampaignLead.findAndCountAll({
    where,
    include: [{ model: Lead, as: 'lead' }],
    order: [['enrolled_at', 'DESC']],
    limit,
    offset,
  });

  return { leads: rows, total: count, page, totalPages: Math.ceil(count / limit) };
}
