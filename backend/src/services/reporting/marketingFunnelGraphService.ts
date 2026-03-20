import { Op } from 'sequelize';
import Campaign from '../../models/Campaign';
import CampaignLead from '../../models/CampaignLead';
import Lead from '../../models/Lead';
import ScheduledEmail from '../../models/ScheduledEmail';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FunnelNodeType = 'channel' | 'campaign' | 'engagement' | 'conversion' | 'outcome';

export interface FunnelGraphNode {
  id: string;
  type: FunnelNodeType;
  label: string;
  count: number;
  metrics: {
    lead_count?: number;
    campaign_count?: number;
    budget_spent?: number;
    budget_total?: number;
    engagement_rate?: number;
    avg_lead_score?: number;
    pct_of_total?: number;
  };
}

export interface FunnelGraphEdge {
  from: string;
  to: string;
  volume: number;
}

export interface FunnelGraphValidation {
  total_leads: number;
  total_campaigns: number;
  leads_with_touchpoints: number;
  leads_enrolled: number;
  warnings: string[];
}

export interface FunnelGraphData {
  nodes: FunnelGraphNode[];
  edges: FunnelGraphEdge[];
  validation: FunnelGraphValidation;
  time_window?: string;
}

export interface FunnelLeadRecord {
  lead_id: number;
  name: string;
  email: string;
  pipeline_stage: string;
  lead_score: number;
  campaign_name: string;
  engagement_level: string;
  lifecycle_status: string;
  touchpoint_count: number;
  response_count: number;
  enrolled_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<string, string> = {
  ch_email: 'Email',
  ch_sms: 'SMS',
  ch_social: 'Social',
  ch_paid_search: 'Paid Search',
  ch_paid_social: 'Paid Social',
  ch_direct_mail: 'Direct Mail',
  ch_referral: 'Referral',
  ch_organic: 'Organic',
  ch_unknown: 'Unknown',
};

const ENGAGEMENT_LABELS: Record<string, string> = {
  eng_responded: 'Responded',
  eng_contacted: 'Contacted',
  eng_pending: 'Pending',
  eng_bounced: 'Bounced',
  eng_ignored: 'Ignored',
};

const CONVERSION_LABELS: Record<string, string> = {
  conv_strategy_call: 'Strategy Call',
  conv_qualified: 'Qualified',
  conv_nurturing: 'Nurturing',
  conv_no_response: 'No Response',
};

const OUTCOME_LABELS: Record<string, string> = {
  out_enrolled: 'Enrolled',
  out_active: 'Active',
  out_dropped: 'Dropped',
  out_inactive: 'Inactive',
};

const MAX_CAMPAIGN_NODES = 15;
const MIN_CAMPAIGN_LEADS = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTimeWindowCutoff(timeWindow?: string): Date | null {
  if (!timeWindow || timeWindow === 'all') return null;
  const now = new Date();
  if (timeWindow === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (timeWindow === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (timeWindow === '90d') return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return null;
}

function classifyChannel(channel: string | null): string {
  if (!channel) return 'ch_unknown';
  return `ch_${channel}`;
}

function classifyEngagement(cl: any, failedAll: boolean): string {
  if (cl.lifecycle_status === 'bounced' || failedAll) return 'eng_bounced';
  if ((cl.response_count || 0) > 0) return 'eng_responded';
  if ((cl.touchpoint_count || 0) > 0) {
    if (cl.lifecycle_status === 'inactive') return 'eng_ignored';
    return 'eng_contacted';
  }
  return 'eng_pending';
}

function classifyConversion(pipelineStage: string, clStatus: string, lifecycleStatus: string): string {
  if (pipelineStage === 'meeting_scheduled') return 'conv_strategy_call';
  if (pipelineStage === 'proposal_sent' || pipelineStage === 'negotiation') return 'conv_qualified';
  if (lifecycleStatus === 'inactive' && (pipelineStage === 'new_lead' || !pipelineStage)) return 'conv_no_response';
  if (clStatus === 'removed') return 'conv_no_response';
  return 'conv_nurturing';
}

function classifyOutcome(pipelineStage: string, clStatus: string, lifecycleStatus: string): string {
  if (pipelineStage === 'enrolled' || lifecycleStatus === 'enrolled') return 'out_enrolled';
  if (clStatus === 'removed' || pipelineStage === 'lost') return 'out_dropped';
  if (lifecycleStatus === 'inactive' || lifecycleStatus === 'dnd' || lifecycleStatus === 'bounced') return 'out_inactive';
  return 'out_active';
}

function getNodeLabel(id: string, type: FunnelNodeType): string {
  if (type === 'channel') return CHANNEL_LABELS[id] || id.replace('ch_', '');
  if (type === 'engagement') return ENGAGEMENT_LABELS[id] || id;
  if (type === 'conversion') return CONVERSION_LABELS[id] || id;
  if (type === 'outcome') return OUTCOME_LABELS[id] || id;
  // campaign nodes have dynamic labels set separately
  return id;
}

function nodeTypeFromId(id: string): FunnelNodeType {
  if (id.startsWith('ch_')) return 'channel';
  if (id.startsWith('camp_')) return 'campaign';
  if (id.startsWith('eng_')) return 'engagement';
  if (id.startsWith('conv_')) return 'conversion';
  if (id.startsWith('out_')) return 'outcome';
  return 'campaign';
}

// ─── Main Graph Builder ──────────────────────────────────────────────────────

export async function buildMarketingFunnelGraph(timeWindow?: string): Promise<FunnelGraphData> {
  const cutoff = getTimeWindowCutoff(timeWindow);

  // 1. Fetch CampaignLeads with Campaign + Lead joins
  const clWhere: any = {};
  if (cutoff) clWhere.enrolled_at = { [Op.gte]: cutoff };

  const campaignLeads = await CampaignLead.findAll({
    where: clWhere,
    include: [
      {
        model: Campaign,
        as: 'campaign',
        attributes: ['id', 'name', 'channel', 'type', 'status', 'budget_total', 'budget_spent'],
      },
      {
        model: Lead,
        as: 'lead',
        attributes: ['id', 'name', 'email', 'pipeline_stage', 'lead_score'],
      },
    ],
    order: [['enrolled_at', 'DESC']],
    limit: 50000,
    raw: true,
    nest: true,
  });

  if (campaignLeads.length === 0) {
    return {
      nodes: [], edges: [],
      validation: {
        total_leads: 0, total_campaigns: 0, leads_with_touchpoints: 0,
        leads_enrolled: 0, warnings: ['No campaign leads found'],
      },
      time_window: timeWindow || 'all',
    };
  }

  // 2. Check for failed emails per (campaign_id, lead_id)
  const clKeys = campaignLeads.map(cl => ({ campaign_id: cl.campaign_id, lead_id: cl.lead_id }));
  const campaignIds = [...new Set(clKeys.map(k => k.campaign_id))];
  const leadIds = [...new Set(clKeys.map(k => k.lead_id))];

  const failedEmails = await ScheduledEmail.findAll({
    where: {
      campaign_id: { [Op.in]: campaignIds },
      lead_id: { [Op.in]: leadIds },
      status: 'failed',
    },
    attributes: ['campaign_id', 'lead_id'],
    raw: true,
  });

  const totalEmails = await ScheduledEmail.findAll({
    where: {
      campaign_id: { [Op.in]: campaignIds },
      lead_id: { [Op.in]: leadIds },
      status: { [Op.in]: ['sent', 'pending', 'processing', 'failed'] },
    },
    attributes: ['campaign_id', 'lead_id', 'status'],
    raw: true,
  });

  // Build set of (campaign_id, lead_id) where ALL emails failed
  const emailCounts = new Map<string, { total: number; failed: number }>();
  for (const e of totalEmails) {
    const key = `${e.campaign_id}:${e.lead_id}`;
    const entry = emailCounts.get(key) || { total: 0, failed: 0 };
    entry.total++;
    if (e.status === 'failed') entry.failed++;
    emailCounts.set(key, entry);
  }

  const allFailedSet = new Set<string>();
  for (const [key, counts] of emailCounts.entries()) {
    if (counts.total > 0 && counts.failed === counts.total) allFailedSet.add(key);
  }

  // 3. Count leads per campaign to decide grouping
  const campaignLeadCounts = new Map<string, number>();
  const campaignNames = new Map<string, string>();
  for (const cl of campaignLeads) {
    const cId = cl.campaign_id;
    campaignLeadCounts.set(cId, (campaignLeadCounts.get(cId) || 0) + 1);
    if ((cl as any).campaign?.name) {
      campaignNames.set(cId, (cl as any).campaign.name);
    }
  }

  // Sort campaigns by lead count descending, group tail into "Other"
  const sortedCampaigns = [...campaignLeadCounts.entries()].sort((a, b) => b[1] - a[1]);
  const groupedCampaignIds = new Set<string>();
  if (sortedCampaigns.length > MAX_CAMPAIGN_NODES) {
    for (let i = MAX_CAMPAIGN_NODES - 1; i < sortedCampaigns.length; i++) {
      if (sortedCampaigns[i][1] < MIN_CAMPAIGN_LEADS) {
        groupedCampaignIds.add(sortedCampaigns[i][0]);
      }
    }
  }

  // 4. Build paths
  const nodeLeads = new Map<string, Set<number>>();
  const edgeVolume = new Map<string, number>();
  const uniqueLeadIds = new Set<number>();
  const uniqueCampaignIds = new Set<string>();
  let leadsWithTouchpoints = 0;
  let leadsEnrolled = 0;
  const leadScores = new Map<string, number[]>();

  for (const cl of campaignLeads) {
    const campaign = (cl as any).campaign || {};
    const lead = (cl as any).lead || {};
    const leadId = cl.lead_id;

    uniqueLeadIds.add(leadId);
    uniqueCampaignIds.add(cl.campaign_id);
    if ((cl.touchpoint_count || 0) > 0) leadsWithTouchpoints++;

    const path: string[] = [];

    // Layer 1: Channel
    const chId = classifyChannel(campaign.channel);
    path.push(chId);

    // Layer 2: Campaign
    const campId = groupedCampaignIds.has(cl.campaign_id) ? 'camp_other' : `camp_${cl.campaign_id}`;
    path.push(campId);

    // Layer 3: Engagement
    const emailKey = `${cl.campaign_id}:${cl.lead_id}`;
    const engId = classifyEngagement(cl, allFailedSet.has(emailKey));
    path.push(engId);

    // Layer 4: Conversion
    const pipelineStage = lead.pipeline_stage || 'new_lead';
    const convId = classifyConversion(pipelineStage, cl.status, cl.lifecycle_status);
    path.push(convId);

    // Layer 5: Outcome
    const outId = classifyOutcome(pipelineStage, cl.status, cl.lifecycle_status);
    path.push(outId);
    if (outId === 'out_enrolled') leadsEnrolled++;

    // Record nodes
    for (const nodeId of path) {
      if (!nodeLeads.has(nodeId)) nodeLeads.set(nodeId, new Set());
      nodeLeads.get(nodeId)!.add(leadId);
      if (lead.lead_score) {
        if (!leadScores.has(nodeId)) leadScores.set(nodeId, []);
        leadScores.get(nodeId)!.push(lead.lead_score);
      }
    }

    // Record edges
    for (let i = 0; i < path.length - 1; i++) {
      const key = `${path[i]}→${path[i + 1]}`;
      edgeVolume.set(key, (edgeVolume.get(key) || 0) + 1);
    }
  }

  // 5. Build output nodes
  const totalLeads = uniqueLeadIds.size;
  const nodes: FunnelGraphNode[] = [];

  for (const [id, leadSet] of nodeLeads.entries()) {
    const type = nodeTypeFromId(id);
    let label: string;
    if (type === 'campaign') {
      if (id === 'camp_other') {
        label = `Other (${groupedCampaignIds.size})`;
      } else {
        const cId = id.replace('camp_', '');
        label = campaignNames.get(cId) || `Campaign ${cId.slice(0, 8)}`;
      }
    } else {
      label = getNodeLabel(id, type);
    }

    const scores = leadScores.get(id) || [];
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    nodes.push({
      id,
      type,
      label,
      count: leadSet.size,
      metrics: {
        lead_count: leadSet.size,
        avg_lead_score: avgScore,
        pct_of_total: totalLeads > 0 ? Math.round((leadSet.size / totalLeads) * 100) : 0,
      },
    });
  }

  // Sort by type order then count desc
  const typeOrder: Record<string, number> = { channel: 0, campaign: 1, engagement: 2, conversion: 3, outcome: 4 };
  nodes.sort((a, b) => (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0) || b.count - a.count);

  // 6. Build edges
  const edges: FunnelGraphEdge[] = [];
  for (const [key, volume] of edgeVolume.entries()) {
    const [from, to] = key.split('→');
    edges.push({ from, to, volume });
  }
  edges.sort((a, b) => b.volume - a.volume);

  // 7. Validation
  const warnings: string[] = [];
  const campaignsNoLeads = sortedCampaigns.filter(([, count]) => count === 0).length;
  if (campaignsNoLeads > 0) warnings.push(`${campaignsNoLeads} campaigns have no enrolled leads`);
  if (groupedCampaignIds.size > 0) warnings.push(`${groupedCampaignIds.size} low-volume campaigns grouped into "Other"`);

  return {
    nodes,
    edges,
    validation: {
      total_leads: totalLeads,
      total_campaigns: uniqueCampaignIds.size,
      leads_with_touchpoints: leadsWithTouchpoints,
      leads_enrolled: leadsEnrolled,
      warnings,
    },
    time_window: timeWindow || 'all',
  };
}

// ─── Node Drilldown: Leads for a specific node ──────────────────────────────

export async function getFunnelNodeLeads(
  nodeId: string, page: number, limit: number, timeWindow?: string
): Promise<{ leads: FunnelLeadRecord[]; total: number }> {
  const cutoff = getTimeWindowCutoff(timeWindow);
  const nodeType = nodeTypeFromId(nodeId);

  // Fetch CampaignLeads with joins
  const clWhere: any = {};
  if (cutoff) clWhere.enrolled_at = { [Op.gte]: cutoff };

  // Narrow queries for specific node types
  if (nodeType === 'campaign' && nodeId !== 'camp_other') {
    clWhere.campaign_id = nodeId.replace('camp_', '');
  }

  const campaignLeads = await CampaignLead.findAll({
    where: clWhere,
    include: [
      { model: Campaign, as: 'campaign', attributes: ['id', 'name', 'channel', 'status'] },
      { model: Lead, as: 'lead', attributes: ['id', 'name', 'email', 'pipeline_stage', 'lead_score'] },
    ],
    order: [['enrolled_at', 'DESC']],
    limit: 5000,
    raw: true,
    nest: true,
  });

  // Filter by node membership
  let matching = campaignLeads;

  if (nodeType === 'channel') {
    matching = campaignLeads.filter(cl => {
      const campaign = (cl as any).campaign || {};
      return classifyChannel(campaign.channel) === nodeId;
    });
  } else if (nodeType === 'engagement') {
    matching = campaignLeads.filter(cl => {
      return classifyEngagement(cl, false) === nodeId;
    });
  } else if (nodeType === 'conversion') {
    matching = campaignLeads.filter(cl => {
      const lead = (cl as any).lead || {};
      return classifyConversion(lead.pipeline_stage || 'new_lead', cl.status, cl.lifecycle_status) === nodeId;
    });
  } else if (nodeType === 'outcome') {
    matching = campaignLeads.filter(cl => {
      const lead = (cl as any).lead || {};
      return classifyOutcome(lead.pipeline_stage || 'new_lead', cl.status, cl.lifecycle_status) === nodeId;
    });
  }

  const total = matching.length;
  const offset = (page - 1) * limit;
  const paginated = matching.slice(offset, offset + limit);

  const results: FunnelLeadRecord[] = paginated.map(cl => {
    const lead = (cl as any).lead || {};
    const campaign = (cl as any).campaign || {};
    return {
      lead_id: cl.lead_id,
      name: lead.name || `Lead #${cl.lead_id}`,
      email: lead.email || '',
      pipeline_stage: lead.pipeline_stage || 'new_lead',
      lead_score: lead.lead_score || 0,
      campaign_name: campaign.name || 'Unknown',
      engagement_level: classifyEngagement(cl, false).replace('eng_', ''),
      lifecycle_status: cl.lifecycle_status || 'active',
      touchpoint_count: cl.touchpoint_count || 0,
      response_count: cl.response_count || 0,
      enrolled_at: cl.enrolled_at ? new Date(cl.enrolled_at).toISOString() : '',
    };
  });

  return { leads: results, total };
}
