// ─── Campaign Link Service ──────────────────────────────────────────────────
// Link generation, ROI calculation, and unregistered traffic enforcement.
// Read-only observer of existing data — never writes to core business tables.

import Campaign from '../models/Campaign';
import { sequelize } from '../config/database';
import { QueryTypes, Op } from 'sequelize';
import { emitExecutiveEvent } from './executiveAwarenessService';
import { getMetric, mayComputeWith } from './adminOs/metricRegistry';

const DEFAULT_BASE_URL = 'https://enterprise.colaberry.ai';
/**
 * REVENUE IS NOT COMPUTED HERE ANY MORE.
 *
 * This service used to derive revenue as `enrollments * 4500` from a hardcoded constant. Three
 * things were wrong with that at once: 4500 is not the price (the current offer is $149/mo), an
 * enrollment is not a payment, and revenue in this business means app-originated checkout only.
 * The figure fed the Channel ROI cards and an ROI percentage, so a channel that had collected no
 * money at all still reported revenue and a return.
 *
 * Cost-per-lead and cost-per-enrollment went the same way for a different reason: they divide
 * `campaigns.budget_spent`, and the ONLY write to that column in the entire codebase is the `0`
 * default set at creation (campaignService.ts). Nothing ever increments it. So every
 * cost-per-lead this service returned was `0 / leads = 0` - an assertion that acquiring a lead
 * costs nothing, rendered as a real currency figure.
 *
 * All four are now null with a stated reason. See metricRegistry 'marketing.*'.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CampaignROIReport {
  campaign_id: string;
  campaign_name: string;
  channel: string | null;
  visitors: number;
  leads: number;
  engaged: number;
  enrollments: number;
  /** null = not knowable (no payment data joined to campaigns), NOT zero revenue. */
  revenue: number | null;
  budget_spent: number;
  budget_cap: number | null;
  /** null = not knowable. Depends on both revenue and a spend figure nothing populates. */
  roi: number | null;
  /** null = not knowable, because budget_spent is never written. NOT "free". */
  cost_per_lead: number | null;
  cost_per_enrollment: number | null;
  approval_status: string;
  /** Why the null fields are null, for direct display next to them. */
  unavailable: { key: string; name: string; reason: string }[];
}

export interface ChannelROI {
  channel: string;
  campaign_count: number;
  total_budget_allocated: number;
  total_budget_spent: number;
  total_visitors: number;
  total_leads: number;
  total_enrollments: number;
  /** null = not knowable, NOT zero. */
  total_revenue: number | null;
  roi: number | null;
  unavailable: { key: string; name: string; reason: string }[];
}

/**
 * The money metrics this service cannot honestly report, straight from the registry.
 *
 * Asking the registry rather than hard-coding the list means these entries disappear on their
 * own once a spend connector lands and the metrics flip to trusted - a hand-written list would
 * go on claiming "unavailable" after the data arrived.
 */
const MONEY_KEYS = ['marketing.roas', 'marketing.ad_spend', 'marketing.cost_per_lead'] as const;

function moneyUnavailable(): { key: string; name: string; reason: string }[] {
  return MONEY_KEYS.filter((k) => !mayComputeWith(k)).map((key) => {
    const def = getMetric(key);
    return {
      key,
      name: def?.name ?? key,
      reason: def?.statusReason ?? 'Not registered in the metric registry.',
    };
  });
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
      COUNT(DISTINCT e.id)::int AS enrollments,
      COUNT(DISTINCT CASE WHEN vs.duration_seconds > 30 OR vs.event_count > 3 THEN v.id END)::int AS engaged
    FROM visitors v
    LEFT JOIN leads l ON l.id = v.lead_id
    LEFT JOIN enrollments e ON LOWER(e.email) = LOWER(l.email)
    LEFT JOIN visitor_sessions vs ON vs.visitor_id = v.id
    WHERE v.campaign_id = :campaignId
  `;

  const [row] = await sequelize.query(query, {
    replacements: { campaignId },
    type: QueryTypes.SELECT,
  }) as any[];

  const visitors = Number(row?.visitors) || 0;
  const leads = Number(row?.leads) || 0;
  const enrollments = Number(row?.enrollments) || 0;
  const engaged = Number(row?.engaged) || 0;
  const budgetSpent = Number(campaign.budget_spent) || 0;

  return {
    campaign_id: campaignId,
    campaign_name: campaign.name,
    channel: campaign.channel || null,
    visitors,
    leads,
    engaged,
    enrollments,
    revenue: null,
    budget_spent: budgetSpent,
    budget_cap: campaign.budget_cap != null ? Number(campaign.budget_cap) : null,
    roi: null,
    // Guarded on budgetSpent > 0, not just leads > 0. Dividing a spend of zero yields zero,
    // and a cost-per-lead of $0 is a claim, not a blank.
    cost_per_lead:
      budgetSpent > 0 && leads > 0 ? Math.round((budgetSpent / leads) * 100) / 100 : null,
    cost_per_enrollment:
      budgetSpent > 0 && enrollments > 0
        ? Math.round((budgetSpent / enrollments) * 100) / 100
        : null,
    approval_status: campaign.approval_status || 'draft',
    unavailable: moneyUnavailable(),
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

    return {
      channel: row.channel,
      campaign_count: Number(row.campaign_count) || 0,
      total_budget_allocated: Number(row.total_budget_allocated) || 0,
      total_budget_spent: totalSpent,
      total_visitors: Number(row.total_visitors) || 0,
      total_leads: Number(row.total_leads) || 0,
      total_enrollments: totalEnrollments,
      total_revenue: null,
      roi: null,
      unavailable: moneyUnavailable(),
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
