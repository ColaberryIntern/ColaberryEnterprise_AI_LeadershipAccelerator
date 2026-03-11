import { Op } from 'sequelize';
import { Campaign, InteractionOutcome, CampaignLead, ScheduledEmail } from '../models';
import CampaignInsight, { type InsightType } from '../models/CampaignInsight';
import { getCampaignAnalytics } from './campaignAnalyticsService';

// ── Harvest Insights ────────────────────────────────────────────────────

/**
 * Analyze a completed/active campaign and extract performance insights
 * into the knowledge memory for future campaign improvement.
 */
export async function harvestInsights(campaignId: string): Promise<CampaignInsight[]> {
  const analytics = await getCampaignAnalytics(campaignId);
  const campaign = await Campaign.findByPk(campaignId, { raw: true }) as any;
  if (!campaign) throw new Error('Campaign not found');

  const insights: CampaignInsight[] = [];
  const campaignIdNum = parseInt(campaignId, 10) || null;

  // 1. Channel performance insights
  for (const ch of analytics.channel_performance) {
    if (ch.sent < 5) continue; // Need minimum sample size

    const quality = ch.reply_rate > 0.1 ? 'strong' : ch.reply_rate > 0.05 ? 'moderate' : 'weak';
    const insight = `${ch.channel} channel achieved ${(ch.open_rate * 100).toFixed(1)}% open rate and ${(ch.reply_rate * 100).toFixed(1)}% reply rate (${quality} performance) across ${ch.sent} sends.`;

    insights.push(await upsertInsight({
      campaign_id: campaignIdNum,
      insight_type: 'channel_perf',
      category: `channel_${ch.channel}`,
      insight,
      evidence: {
        channel: ch.channel,
        sent: ch.sent,
        open_rate: ch.open_rate,
        reply_rate: ch.reply_rate,
        bounce_rate: ch.sent > 0 ? ch.bounced / ch.sent : 0,
      },
      confidence: Math.min(ch.sent / 50, 1), // Higher confidence with more data
      applicable_to: {
        campaign_type: campaign.type,
        channel: ch.channel,
      },
    }));
  }

  // 2. Step performance insights — identify best/worst performing steps
  if (analytics.step_performance.length >= 2) {
    const sorted = [...analytics.step_performance]
      .filter((s) => s.sent >= 3)
      .sort((a, b) => b.reply_rate - a.reply_rate);

    if (sorted.length > 0) {
      const best = sorted[0];
      insights.push(await upsertInsight({
        campaign_id: campaignIdNum,
        insight_type: 'message_pattern',
        category: 'best_performing_step',
        insight: `Step ${best.step_index + 1} (${best.channel}) had the highest reply rate at ${(best.reply_rate * 100).toFixed(1)}% across ${best.sent} sends.`,
        evidence: {
          step_index: best.step_index,
          channel: best.channel,
          reply_rate: best.reply_rate,
          open_rate: best.open_rate,
          sent: best.sent,
        },
        confidence: Math.min(best.sent / 30, 1),
        applicable_to: {
          campaign_type: campaign.type,
          step_position: best.step_index < 2 ? 'early' : best.step_index < 4 ? 'mid' : 'late',
        },
      }));

      const worst = sorted[sorted.length - 1];
      if (worst.step_index !== best.step_index) {
        insights.push(await upsertInsight({
          campaign_id: campaignIdNum,
          insight_type: 'message_pattern',
          category: 'lowest_performing_step',
          insight: `Step ${worst.step_index + 1} (${worst.channel}) had the lowest reply rate at ${(worst.reply_rate * 100).toFixed(1)}% — consider revising messaging or timing.`,
          evidence: {
            step_index: worst.step_index,
            channel: worst.channel,
            reply_rate: worst.reply_rate,
            open_rate: worst.open_rate,
            sent: worst.sent,
          },
          confidence: Math.min(worst.sent / 30, 1),
          applicable_to: { campaign_type: campaign.type },
        }));
      }
    }
  }

  // 3. Conversion funnel insight
  const { overview } = analytics;
  if (overview.sent_count >= 10) {
    insights.push(await upsertInsight({
      campaign_id: campaignIdNum,
      insight_type: 'conversion',
      category: 'funnel_efficiency',
      insight: `Campaign "${campaign.name}" converted ${(overview.conversion_rate * 100).toFixed(1)}% of ${overview.total_leads} leads. Funnel: ${overview.sent_count} sent → ${overview.opened_count} opened → ${overview.replied_count} replied → ${overview.meetings_booked} meetings → ${overview.conversions} converted.`,
      evidence: {
        total_leads: overview.total_leads,
        sent: overview.sent_count,
        opened: overview.opened_count,
        replied: overview.replied_count,
        meetings: overview.meetings_booked,
        conversions: overview.conversions,
        open_rate: overview.open_rate,
        reply_rate: overview.reply_rate,
        conversion_rate: overview.conversion_rate,
      },
      confidence: Math.min(overview.sent_count / 100, 1),
      applicable_to: { campaign_type: campaign.type },
    }));
  }

  // 4. Audience insight — which lead segments respond best
  const leadOutcomeData = analytics.lead_outcomes;
  const totalOutcomes = leadOutcomeData.reduce((sum, o) => sum + o.count, 0);
  if (totalOutcomes > 0) {
    const positiveOutcomes = leadOutcomeData
      .filter((o) => ['replied', 'meeting_booked', 'converted'].includes(o.outcome))
      .reduce((sum, o) => sum + o.count, 0);
    const positiveRate = positiveOutcomes / totalOutcomes;

    insights.push(await upsertInsight({
      campaign_id: campaignIdNum,
      insight_type: 'audience',
      category: 'lead_responsiveness',
      insight: `${(positiveRate * 100).toFixed(1)}% of leads showed positive engagement (replied, booked meeting, or converted) out of ${totalOutcomes} total outcomes.`,
      evidence: {
        positive_outcomes: positiveOutcomes,
        total_outcomes: totalOutcomes,
        positive_rate: positiveRate,
        outcome_breakdown: Object.fromEntries(leadOutcomeData.map((o) => [o.outcome, o.count])),
      },
      confidence: Math.min(totalOutcomes / 50, 1),
      applicable_to: { campaign_type: campaign.type },
    }));
  }

  console.log(`[CampaignKnowledge] Harvested ${insights.length} insights from campaign ${campaignId}`);
  return insights;
}

// ── Query Insights ──────────────────────────────────────────────────────

interface InsightQuery {
  campaign_type?: string;
  channel?: string;
  insight_type?: InsightType;
  category?: string;
  min_confidence?: number;
  limit?: number;
}

/**
 * Retrieve insights matching a campaign context.
 * Used by AI message generation to inject proven patterns.
 */
export async function getRelevantInsights(query: InsightQuery): Promise<CampaignInsight[]> {
  const where: Record<string, any> = {};

  if (query.insight_type) where.insight_type = query.insight_type;
  if (query.category) where.category = query.category;
  if (query.min_confidence) where.confidence = { [Op.gte]: query.min_confidence };

  const insights = await CampaignInsight.findAll({
    where,
    order: [['confidence', 'DESC'], ['times_applied', 'DESC']],
    limit: query.limit || 20,
  });

  // Post-filter by applicable_to fields
  if (query.campaign_type || query.channel) {
    return insights.filter((i) => {
      const app = i.applicable_to || {};
      if (query.campaign_type && app.campaign_type && app.campaign_type !== query.campaign_type) return false;
      if (query.channel && app.channel && app.channel !== query.channel) return false;
      return true;
    });
  }

  return insights;
}

/**
 * Get insights formatted as context string for AI prompt injection.
 */
export async function getInsightsForPrompt(query: InsightQuery): Promise<string> {
  const insights = await getRelevantInsights({ ...query, min_confidence: 0.3, limit: 5 });
  if (insights.length === 0) return '';

  const lines = insights.map((i) => `- ${i.insight} (confidence: ${(i.confidence * 100).toFixed(0)}%)`);

  // Mark these insights as applied
  for (const i of insights) {
    await applyInsight(i.id);
  }

  return `\nCAMPAIGN KNOWLEDGE (proven patterns from past campaigns):\n${lines.join('\n')}`;
}

// ── Apply & Track ───────────────────────────────────────────────────────

/**
 * Increment usage counter when an insight is applied to a new campaign.
 */
export async function applyInsight(insightId: number): Promise<void> {
  await CampaignInsight.update(
    {
      times_applied: CampaignInsight.sequelize!.literal('times_applied + 1') as any,
      last_applied_at: new Date(),
      updated_at: new Date(),
    },
    { where: { id: insightId } },
  );
}

// ── Dashboard Summary ───────────────────────────────────────────────────

export interface KnowledgeSummary {
  total_insights: number;
  by_type: Record<string, number>;
  by_category: Record<string, number>;
  top_insights: CampaignInsight[];
  most_applied: CampaignInsight[];
  avg_confidence: number;
}

/**
 * Aggregated view for the admin dashboard.
 */
export async function getKnowledgeSummary(): Promise<KnowledgeSummary> {
  const all = await CampaignInsight.findAll({ order: [['confidence', 'DESC']] });

  const byType: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let totalConf = 0;

  for (const i of all) {
    byType[i.insight_type] = (byType[i.insight_type] || 0) + 1;
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
    totalConf += i.confidence;
  }

  const topInsights = all.slice(0, 10);
  const mostApplied = [...all].sort((a, b) => b.times_applied - a.times_applied).slice(0, 5);

  return {
    total_insights: all.length,
    by_type: byType,
    by_category: byCategory,
    top_insights: topInsights,
    most_applied: mostApplied,
    avg_confidence: all.length > 0 ? totalConf / all.length : 0,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function upsertInsight(data: {
  campaign_id: number | null;
  insight_type: InsightType;
  category: string;
  insight: string;
  evidence: Record<string, any>;
  confidence: number;
  applicable_to: Record<string, any>;
}): Promise<CampaignInsight> {
  // Check for existing insight with same campaign + category to update rather than duplicate
  const existing = await CampaignInsight.findOne({
    where: {
      campaign_id: data.campaign_id,
      insight_type: data.insight_type,
      category: data.category,
    },
  });

  if (existing) {
    await existing.update({
      insight: data.insight,
      evidence: data.evidence,
      confidence: data.confidence,
      applicable_to: data.applicable_to,
      updated_at: new Date(),
    });
    return existing;
  }

  return CampaignInsight.create(data as any);
}
