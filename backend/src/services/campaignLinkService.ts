// ─── Campaign Link Service ──────────────────────────────────────────────────
// Link generation, ROI calculation, and unregistered traffic enforcement.
// Read-only observer of existing data — never writes to core business tables.

import Campaign from '../models/Campaign';
import { sequelize } from '../config/database';
import { QueryTypes, Op } from 'sequelize';
import { emitExecutiveEvent } from './executiveAwarenessService';

const DEFAULT_BASE_URL = 'https://enterprise.colaberry.ai';
const PRICE_PER_ENROLLMENT = 4500;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CampaignROIReport {
  campaign_id: string;
  campaign_name: string;
  channel: string | null;
  visitors: number;
  leads: number;
  enrollments: number;
  revenue: number;
  budget_spent: number;
  budget_cap: number | null;
  roi: number;
  cost_per_lead: number;
  cost_per_enrollment: number;
  approval_status: string;
}

export interface ChannelROI {
  channel: string;
  campaign_count: number;
  total_budget_allocated: number;
  total_budget_spent: number;
  total_visitors: number;
  total_leads: number;
  total_enrollments: number;
  total_revenue: number;
  roi: number;
}

// ─── Link Generation ────────────────────────────────────────────────────────

export async function generateTrackedLink(
  campaignId: string,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<string> {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  if (!campaign.channel) throw new Error('Campaign must have a channel set before generating a tracking link');
  if (!campaign.destination_path) throw new Error('Campaign must have a destination_path set before generating a tracking link');

  const dest = campaign.destination_path.startsWith('/')
    ? campaign.destination_path
    : `/${campaign.destination_path}`;

  const params = new URLSearchParams({
    utm_source: campaign.channel,
    utm_medium: campaign.type,
    utm_campaign: campaignId,
    cid: campaignId,
  });

  const trackingLink = `${baseUrl}${dest}?${params.toString()}`;

  await campaign.update({ tracking_link: trackingLink });

  return trackingLink;
}

// ─── Publish Validation ─────────────────────────────────────────────────────

export async function validateCampaignForPublish(
  campaignId: string,
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) {
    return { valid: false, errors: ['Campaign not found'] };
  }

  if (!campaign.channel) errors.push('Campaign channel is required');
  if (!campaign.destination_path) errors.push('Destination path is required');
  if (!campaign.objective) errors.push('Campaign objective is required');

  if (campaign.approval_status !== 'approved') {
    errors.push(`Campaign must be approved before going live (current: ${campaign.approval_status})`);
  }

  if (campaign.budget_cap != null && Number(campaign.budget_spent) >= Number(campaign.budget_cap)) {
    errors.push(`Budget cap exceeded: spent $${campaign.budget_spent} of $${campaign.budget_cap}`);
  }

  // Check governance config exists
  const CampaignGovernanceConfig = (await import('../models/CampaignGovernanceConfig')).default;
  const govConfig = await CampaignGovernanceConfig.findOne({ where: { campaign_id: campaignId } });
  if (!govConfig) {
    errors.push('Campaign governance config must be created before going live');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Campaign ROI ───────────────────────────────────────────────────────────

export async function getCampaignROI(campaignId: string): Promise<CampaignROIReport> {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const query = `
    SELECT
      COUNT(DISTINCT v.id)::int AS visitors,
      COUNT(DISTINCT l.id)::int AS leads,
      COUNT(DISTINCT e.id)::int AS enrollments
    FROM visitors v
    LEFT JOIN leads l ON l.id = v.lead_id
    LEFT JOIN enrollments e ON LOWER(e.email) = LOWER(l.email)
    WHERE v.campaign_id = :campaignId
  `;

  const [row] = await sequelize.query(query, {
    replacements: { campaignId },
    type: QueryTypes.SELECT,
  }) as any[];

  const visitors = Number(row?.visitors) || 0;
  const leads = Number(row?.leads) || 0;
  const enrollments = Number(row?.enrollments) || 0;
  const revenue = enrollments * PRICE_PER_ENROLLMENT;
  const budgetSpent = Number(campaign.budget_spent) || 0;
  const roi = budgetSpent > 0 ? Math.round(((revenue - budgetSpent) / budgetSpent) * 100) / 100 : 0;

  return {
    campaign_id: campaignId,
    campaign_name: campaign.name,
    channel: campaign.channel || null,
    visitors,
    leads,
    enrollments,
    revenue,
    budget_spent: budgetSpent,
    budget_cap: campaign.budget_cap != null ? Number(campaign.budget_cap) : null,
    roi,
    cost_per_lead: leads > 0 ? Math.round((budgetSpent / leads) * 100) / 100 : 0,
    cost_per_enrollment: enrollments > 0 ? Math.round((budgetSpent / enrollments) * 100) / 100 : 0,
    approval_status: campaign.approval_status || 'draft',
  };
}

// ─── Channel ROI Aggregation ────────────────────────────────────────────────

export async function getChannelROIAggregation(): Promise<ChannelROI[]> {
  const query = `
    SELECT
      c.channel,
      COUNT(DISTINCT c.id)::int AS campaign_count,
      COALESCE(SUM(c.budget_cap::numeric), 0)::numeric AS total_budget_allocated,
      COALESCE(SUM(c.budget_spent::numeric), 0)::numeric AS total_budget_spent,
      COALESCE(SUM(vis.visitor_count), 0)::int AS total_visitors,
      COALESCE(SUM(vis.lead_count), 0)::int AS total_leads,
      COALESCE(SUM(vis.enrollment_count), 0)::int AS total_enrollments
    FROM campaigns c
    LEFT JOIN LATERAL (
      SELECT
        COUNT(DISTINCT v.id)::int AS visitor_count,
        COUNT(DISTINCT l.id)::int AS lead_count,
        COUNT(DISTINCT e.id)::int AS enrollment_count
      FROM visitors v
      LEFT JOIN leads l ON l.id = v.lead_id
      LEFT JOIN enrollments e ON LOWER(e.email) = LOWER(l.email)
      WHERE v.campaign_id = c.id::text
    ) vis ON true
    WHERE c.channel IS NOT NULL
    GROUP BY c.channel
    ORDER BY total_budget_spent DESC
  `;

  const rows = await sequelize.query(query, { type: QueryTypes.SELECT }) as any[];

  return rows.map((row) => {
    const totalSpent = Number(row.total_budget_spent) || 0;
    const totalEnrollments = Number(row.total_enrollments) || 0;
    const totalRevenue = totalEnrollments * PRICE_PER_ENROLLMENT;

    return {
      channel: row.channel,
      campaign_count: Number(row.campaign_count) || 0,
      total_budget_allocated: Number(row.total_budget_allocated) || 0,
      total_budget_spent: totalSpent,
      total_visitors: Number(row.total_visitors) || 0,
      total_leads: Number(row.total_leads) || 0,
      total_enrollments: totalEnrollments,
      total_revenue: totalRevenue,
      roi: totalSpent > 0 ? Math.round(((totalRevenue - totalSpent) / totalSpent) * 100) / 100 : 0,
    };
  });
}

// ─── Unregistered Traffic Enforcement ───────────────────────────────────────

export async function flagUnregisteredTraffic(): Promise<number> {
  try {
    // Find visitors with campaign_id that doesn't match any Campaign row
    const query = `
      SELECT v.campaign_id, COUNT(*)::int AS visitor_count
      FROM visitors v
      WHERE v.campaign_id IS NOT NULL
        AND v.campaign_id != ''
        AND v.campaign_id NOT IN (SELECT id::text FROM campaigns)
        AND v.created_at > NOW() - INTERVAL '2 hours'
      GROUP BY v.campaign_id
    `;

    const rows = await sequelize.query(query, { type: QueryTypes.SELECT }) as any[];

    let totalFlagged = 0;

    for (const row of rows) {
      const count = Number(row.visitor_count) || 0;
      totalFlagged += count;

      await emitExecutiveEvent({
        category: 'governance',
        severity: 'important',
        title: 'Unregistered campaign traffic detected',
        description: `${count} visitor(s) arrived with unregistered campaign_id "${row.campaign_id}" in the last 2 hours. This traffic is not attributed to any registered campaign.`,
        clusterKey: `unregistered-traffic:${row.campaign_id}`,
        metadata: {
          campaign_traffic_enforcement: true,
          unregistered_campaign_id: row.campaign_id,
          visitor_count: count,
        },
      }).catch(() => {});
    }

    if (totalFlagged > 0) {
      console.log(`[CampaignLinkService] Flagged ${totalFlagged} unregistered traffic visitors across ${rows.length} campaign IDs`);
    }

    return totalFlagged;
  } catch (err: any) {
    console.error('[CampaignLinkService] flagUnregisteredTraffic error:', err.message);
    return 0;
  }
}
