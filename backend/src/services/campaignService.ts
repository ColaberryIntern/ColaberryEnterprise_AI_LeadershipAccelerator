import { Op } from 'sequelize';
import { Campaign, CampaignLead, Lead, FollowUpSequence, ScheduledEmail, AdminUser, InteractionOutcome, Activity } from '../models';
import StrategyCall from '../models/StrategyCall';
import { enrollLeadInSequence } from './sequenceService';
import { getSetting } from './settingsService';
import { syncLeadToGhl, bulkSyncCampaignLeads } from './ghlService';

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
  const campaign = await Campaign.create({
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

  // Auto-generate interest_group
  const slug = params.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  const uid = campaign.id.substring(0, 8);
  await campaign.update({ interest_group: `Colaberry_${slug}_${uid}` });

  return campaign;
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

  // Backfill interest_group for campaigns created before GHL integration
  if (!campaign.interest_group) {
    const slug = campaign.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
    const uid = campaign.id.substring(0, 8);
    await campaign.update({ interest_group: `Colaberry_${slug}_${uid}` });
  }

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

      // Sync lead to GHL if enabled
      try {
        const ghlEnabled = await getSetting('ghl_enabled');
        if (ghlEnabled && campaign.interest_group) {
          const lead = await Lead.findByPk(leadId);
          if (lead) {
            const syncResult = await syncLeadToGhl(lead, campaign.interest_group);
            // Only persist ghl_contact_id when NOT in test mode
            if (syncResult.contactId && !syncResult.isTestMode && !lead.ghl_contact_id) {
              await lead.update({ ghl_contact_id: syncResult.contactId });
            }
          }
        }
      } catch (ghlErr: any) {
        console.warn(`[GHL] Sync failed during enrollment for lead ${leadId}: ${ghlErr.message}`);
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

  // Enrich with dynamic next action from ScheduledEmail (more reliable than static column)
  const leadIds = rows.map((r) => r.lead_id);
  const nextActions = leadIds.length > 0
    ? await ScheduledEmail.findAll({
        where: {
          campaign_id: campaignId,
          lead_id: { [Op.in]: leadIds },
          status: 'pending',
        },
        order: [['scheduled_for', 'ASC']],
      })
    : [];

  const nextActionMap: Record<number, any> = {};
  for (const a of nextActions) {
    if (!nextActionMap[a.lead_id]) nextActionMap[a.lead_id] = a;
  }

  // Enrich with strategy call data (most recent per lead)
  const strategyCalls = leadIds.length > 0
    ? await StrategyCall.findAll({
        where: { lead_id: { [Op.in]: leadIds } },
        order: [['scheduled_at', 'DESC']],
      })
    : [];

  const callMap: Record<number, any> = {};
  for (const sc of strategyCalls) {
    if (!callMap[sc.lead_id!]) callMap[sc.lead_id!] = sc;
  }

  const leads = rows.map((r) => {
    const json = (r as any).toJSON();
    const next = nextActionMap[r.lead_id];
    return {
      ...json,
      next_action_at: next?.scheduled_for || json.next_action_at || null,
      next_action_channel: next?.channel || null,
      next_action_subject: next?.subject || null,
      strategy_call_at: callMap[r.lead_id]?.scheduled_at || null,
      strategy_call_status: callMap[r.lead_id]?.status || null,
    };
  });

  return { leads, total: count, page, totalPages: Math.ceil(count / limit) };
}

// ── Campaign Settings ───────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  test_mode_enabled: false,
  test_email: '',
  test_phone: '',
  delay_between_sends: 120,
  max_leads_per_cycle: 10,
  agent_name: 'Colaberry AI',
  agent_greeting: 'Hi {first_name}, this is {agent_name} calling from Colaberry.',
  call_time_start: '09:00',
  call_time_end: '17:00',
  call_timezone: 'America/Chicago',
  call_active_days: [1, 2, 3, 4, 5],
  max_call_duration: 300,
  max_daily_calls: 50,
  auto_dnc_on_request: true,
  voicemail_enabled: true,
  pass_prior_conversations: true,
  auto_reply_enabled: false,
};

export async function getCampaignSettings(id: string) {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) throw new Error('Campaign not found');
  return { ...DEFAULT_SETTINGS, ...(campaign.settings || {}) };
}

export async function updateCampaignSettings(id: string, settings: Record<string, any>) {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) throw new Error('Campaign not found');

  const merged = { ...(campaign.settings || DEFAULT_SETTINGS), ...settings };
  await campaign.update({ settings: merged });
  return merged;
}

export async function updateCampaignGTM(
  id: string,
  data: { goals?: string; gtm_notes?: string; description?: string },
) {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) throw new Error('Campaign not found');

  const updates: Record<string, any> = {};
  if (data.goals !== undefined) updates.goals = data.goals;
  if (data.gtm_notes !== undefined) updates.gtm_notes = data.gtm_notes;
  if (data.description !== undefined) updates.description = data.description;

  await campaign.update(updates);
  return campaign.reload();
}

// ── Enriched Lead Details ───────────────────────────────────────────

export async function getEnrichedCampaignLeads(campaignId: string) {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const campaignLeads = await CampaignLead.findAll({
    where: { campaign_id: campaignId },
    include: [{ model: Lead, as: 'lead' }],
    order: [['enrolled_at', 'DESC']],
  });

  // Get next pending action for each lead
  const leadIds = campaignLeads.map((cl) => cl.lead_id);
  const pendingActions = await ScheduledEmail.findAll({
    where: {
      campaign_id: campaignId,
      lead_id: { [Op.in]: leadIds },
      status: 'pending',
    },
    order: [['scheduled_for', 'ASC']],
  });

  const nextActionMap: Record<number, any> = {};
  for (const action of pendingActions) {
    if (!nextActionMap[action.lead_id]) {
      nextActionMap[action.lead_id] = action;
    }
  }

  const enriched = campaignLeads.map((cl: any) => {
    const nextAction = nextActionMap[cl.lead_id];
    return {
      ...cl.toJSON(),
      next_action_at: nextAction?.scheduled_for || null,
      next_action_channel: nextAction?.channel || null,
      next_action_step: nextAction?.step_index ?? null,
    };
  });

  return { leads: enriched, total: enriched.length };
}

// ── Lead Campaign Timeline ──────────────────────────────────────────

export async function getLeadCampaignTimeline(campaignId: string, leadId: number) {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  // Get all scheduled actions for this lead in this campaign
  const actions = await ScheduledEmail.findAll({
    where: { campaign_id: campaignId, lead_id: leadId },
    order: [['scheduled_for', 'ASC']],
    raw: true,
  });

  // Get all interaction outcomes for this lead in this campaign
  const outcomes = await InteractionOutcome.findAll({
    where: { campaign_id: campaignId, lead_id: leadId },
    order: [['created_at', 'ASC']],
    raw: true,
  });

  // Get activities for this lead (filter by campaign context in metadata or type)
  const activities = await Activity.findAll({
    where: { lead_id: leadId },
    order: [['created_at', 'DESC']],
    limit: 50,
    raw: true,
  });

  // Look up sequence steps for ai_instructions (for pending actions)
  let sequenceSteps: any[] = [];
  if (campaign.sequence_id) {
    const sequence = await FollowUpSequence.findByPk(campaign.sequence_id);
    if (sequence) sequenceSteps = sequence.steps || [];
  }

  // Merge into a unified timeline
  const timeline: any[] = [];

  for (const action of actions) {
    // Skip cancelled actions; include both sent and pending (upcoming)
    if (action.status === 'cancelled') continue;

    // Attach ai_instructions from sequence step for pending actions
    let ai_instructions: string | null = null;
    if (action.status === 'pending' && action.step_index !== undefined && sequenceSteps[action.step_index]) {
      ai_instructions = sequenceSteps[action.step_index].ai_instructions || null;
    }

    timeline.push({
      type: 'action',
      timestamp: action.sent_at || action.scheduled_for,
      channel: action.channel,
      step_index: action.step_index,
      status: action.status,
      subject: action.subject,
      body: action.body || null,
      to_email: action.to_email || null,
      to_phone: action.to_phone || null,
      scheduled_for: action.scheduled_for,
      ai_generated: action.ai_generated,
      metadata: action.metadata || null,
      ai_instructions,
      id: action.id,
    });
  }

  for (const outcome of outcomes) {
    timeline.push({
      type: 'outcome',
      timestamp: outcome.created_at,
      channel: outcome.channel,
      step_index: outcome.step_index,
      outcome: outcome.outcome,
      metadata: outcome.metadata,
      id: outcome.id,
    });
  }

  // Sort by timestamp descending (most recent first)
  timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Get campaign lead record
  const campaignLead = await CampaignLead.findOne({
    where: { campaign_id: campaignId, lead_id: leadId },
    include: [{ model: Lead, as: 'lead' }],
  });

  // Get most recent strategy call for this lead
  const strategyCall = await StrategyCall.findOne({
    where: { lead_id: leadId },
    order: [['scheduled_at', 'DESC']],
  });

  // Get next pending action for this lead
  const nextAction = await ScheduledEmail.findOne({
    where: { campaign_id: campaignId, lead_id: leadId, status: 'pending' },
    order: [['scheduled_for', 'ASC']],
    raw: true,
  });

  return {
    timeline,
    enrollment: campaignLead ? {
      ...campaignLead.toJSON(),
      strategy_call_at: strategyCall?.scheduled_at || null,
      strategy_call_status: strategyCall?.status || null,
      strategy_call_meet_link: (strategyCall as any)?.meet_link || null,
      next_action_at: nextAction?.scheduled_for || null,
      next_action_channel: nextAction?.channel || null,
      next_action_subject: nextAction?.subject || null,
    } : null,
    activities: activities.slice(0, 20),
  };
}

// ── GHL Bulk Sync ───────────────────────────────────────────────────

export async function syncAllCampaignLeadsToGhl(campaignId: string, force = false) {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  // Ensure interest_group exists
  if (!campaign.interest_group) {
    const slug = campaign.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
    const uid = campaign.id.substring(0, 8);
    await campaign.update({ interest_group: `Colaberry_${slug}_${uid}` });
    await campaign.reload();
  }

  const campaignLeads = await CampaignLead.findAll({
    where: { campaign_id: campaignId, status: { [Op.ne]: 'removed' } },
    include: [{ model: Lead, as: 'lead' }],
  });

  const leads = campaignLeads.map((cl: any) => cl.lead).filter(Boolean);
  return bulkSyncCampaignLeads(campaignId, campaign.interest_group, leads, force);
}

export async function resyncCampaignLead(campaignId: string, leadId: number) {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (!campaign.interest_group) throw new Error('Campaign has no interest group');

  const lead = await Lead.findByPk(leadId);
  if (!lead) throw new Error('Lead not found');

  const syncResult = await syncLeadToGhl(lead, campaign.interest_group, true);
  if (syncResult.contactId && !syncResult.isTestMode) {
    await lead.update({ ghl_contact_id: syncResult.contactId });
  }
  return syncResult;
}

export async function getCampaignGhlStatus(campaignId: string) {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const campaignLeads = await CampaignLead.findAll({
    where: { campaign_id: campaignId, status: { [Op.ne]: 'removed' } },
    include: [{ model: Lead, as: 'lead' }],
  });

  const totalLeads = campaignLeads.length;
  const syncedCount = campaignLeads.filter(
    (cl: any) => cl.lead?.ghl_contact_id
  ).length;

  // Per-lead sync status
  const leads = campaignLeads.map((cl: any) => ({
    lead_id: cl.lead_id,
    name: cl.lead?.name || '',
    email: cl.lead?.email || '',
    ghl_contact_id: cl.lead?.ghl_contact_id || null,
    sync_status: cl.lead?.ghl_contact_id ? 'synced' : 'not_synced',
  }));

  // CRM-specific activities (ghl_sync, sms with ghl metadata)
  const leadIds = campaignLeads.map((cl) => cl.lead_id);
  const recentActivities = leadIds.length > 0
    ? await Activity.findAll({
        where: {
          lead_id: { [Op.in]: leadIds },
          type: { [Op.in]: ['system', 'sms'] },
        },
        include: [{ model: Lead, as: 'lead', attributes: ['id', 'name', 'email'] }],
        order: [['created_at', 'DESC']],
        limit: 100,
      })
    : [];

  // Filter to CRM-only activities (ghl_sync actions or sms with ghl metadata)
  const crmActivities = recentActivities
    .map((a: any) => a.toJSON())
    .filter((a: any) => a.metadata?.action?.startsWith('ghl_') || (a.type === 'sms' && a.metadata?.ghl_contact_id))
    .map((a: any) => ({
      id: a.id,
      lead_id: a.lead_id,
      lead_name: a.lead?.name || '',
      lead_email: a.lead?.email || '',
      type: a.type,
      subject: a.subject,
      metadata: a.metadata,
      created_at: a.created_at,
    }));

  return {
    interest_group: campaign.interest_group,
    total_leads: totalLeads,
    synced_leads: syncedCount,
    leads,
    activities: crmActivities,
  };
}
