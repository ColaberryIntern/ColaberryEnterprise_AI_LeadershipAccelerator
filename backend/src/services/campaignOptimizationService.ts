import { getCampaignAnalytics, type CampaignAnalytics } from './campaignAnalyticsService';
import { getRelevantInsights } from './campaignKnowledgeService';
import { Campaign } from '../models';

// ── Types ───────────────────────────────────────────────────────────────

export interface Recommendation {
  type: 'timing' | 'channel' | 'message' | 'audience' | 'budget' | 'sequence';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  expected_impact: string;
  auto_applicable: boolean;
  evidence: Record<string, any>;
}

export interface OptimizationReport {
  campaign_id: string;
  campaign_name: string;
  overall_health: 'strong' | 'moderate' | 'needs_attention' | 'critical';
  recommendations: Recommendation[];
  generated_at: string;
}

// ── Main Entry Point ────────────────────────────────────────────────────

/**
 * Analyze campaign metrics and generate ranked optimization recommendations.
 */
export async function generateOptimizations(campaignId: string): Promise<OptimizationReport> {
  const campaign = await Campaign.findByPk(campaignId, { raw: true }) as any;
  if (!campaign) throw new Error('Campaign not found');

  const analytics = await getCampaignAnalytics(campaignId);
  const recommendations: Recommendation[] = [];

  // Run all analyzers
  analyzeDeliverability(analytics, recommendations);
  analyzeEngagement(analytics, recommendations);
  analyzeChannelMix(analytics, recommendations);
  analyzeStepPerformance(analytics, recommendations);
  analyzeFunnel(analytics, recommendations);
  await analyzeFromKnowledge(campaign, recommendations);

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Determine overall health
  const highCount = recommendations.filter((r) => r.priority === 'high').length;
  const overall_health = highCount >= 3 ? 'critical'
    : highCount >= 1 ? 'needs_attention'
    : recommendations.length >= 3 ? 'moderate'
    : 'strong';

  return {
    campaign_id: campaignId,
    campaign_name: campaign.name,
    overall_health,
    recommendations,
    generated_at: new Date().toISOString(),
  };
}

// ── Analyzers ───────────────────────────────────────────────────────────

function analyzeDeliverability(analytics: CampaignAnalytics, recs: Recommendation[]) {
  const { overview } = analytics;
  if (overview.sent_count < 5) return;

  if (overview.bounce_rate > 0.1) {
    recs.push({
      type: 'audience',
      priority: 'high',
      title: 'High bounce rate detected',
      description: `${(overview.bounce_rate * 100).toFixed(1)}% of emails are bouncing. Review lead email quality and consider cleaning your list.`,
      expected_impact: 'Reduce bounces by 50-80%, improve sender reputation',
      auto_applicable: false,
      evidence: { bounce_rate: overview.bounce_rate, bounced: overview.bounced_count, sent: overview.sent_count },
    });
  }

  if (overview.bounce_rate > 0.03 && overview.bounce_rate <= 0.1) {
    recs.push({
      type: 'audience',
      priority: 'medium',
      title: 'Moderate bounce rate',
      description: `${(overview.bounce_rate * 100).toFixed(1)}% bounce rate — above the 3% healthy threshold. Verify email addresses before adding to campaign.`,
      expected_impact: 'Maintain good sender reputation',
      auto_applicable: false,
      evidence: { bounce_rate: overview.bounce_rate },
    });
  }
}

function analyzeEngagement(analytics: CampaignAnalytics, recs: Recommendation[]) {
  const { overview } = analytics;
  if (overview.sent_count < 10) return;

  if (overview.open_rate < 0.15) {
    recs.push({
      type: 'message',
      priority: 'high',
      title: 'Low open rate — subject lines need improvement',
      description: `Only ${(overview.open_rate * 100).toFixed(1)}% open rate (healthy is 20-40%). Test shorter, more personalized subject lines. Consider A/B testing with the lead's name or company.`,
      expected_impact: 'Increase open rate by 30-50%',
      auto_applicable: false,
      evidence: { open_rate: overview.open_rate, sent: overview.sent_count },
    });
  }

  if (overview.reply_rate < 0.02 && overview.open_rate >= 0.15) {
    recs.push({
      type: 'message',
      priority: 'high',
      title: 'Emails opened but not replied — body content issue',
      description: `Opens are decent (${(overview.open_rate * 100).toFixed(1)}%) but reply rate is only ${(overview.reply_rate * 100).toFixed(1)}%. The email body or CTA needs strengthening. Consider softer CTAs or more relevant value propositions.`,
      expected_impact: 'Increase reply rate by 2-5x',
      auto_applicable: false,
      evidence: { open_rate: overview.open_rate, reply_rate: overview.reply_rate },
    });
  }

  if (overview.reply_rate >= 0.05) {
    recs.push({
      type: 'message',
      priority: 'low',
      title: 'Strong reply rate — consider scaling',
      description: `${(overview.reply_rate * 100).toFixed(1)}% reply rate is above average. Consider increasing send volume or adding more leads to this campaign.`,
      expected_impact: 'More conversions with proven messaging',
      auto_applicable: false,
      evidence: { reply_rate: overview.reply_rate },
    });
  }
}

function analyzeChannelMix(analytics: CampaignAnalytics, recs: Recommendation[]) {
  const channels = analytics.channel_performance;
  if (channels.length < 2) return;

  // Find best performing channel by reply rate
  const withData = channels.filter((c) => c.sent >= 3);
  if (withData.length < 2) return;

  const sorted = [...withData].sort((a, b) => b.reply_rate - a.reply_rate);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  if (best.reply_rate > worst.reply_rate * 2 && worst.sent >= 5) {
    recs.push({
      type: 'channel',
      priority: 'medium',
      title: `${best.channel} outperforming ${worst.channel}`,
      description: `${best.channel} has ${(best.reply_rate * 100).toFixed(1)}% reply rate vs ${worst.channel} at ${(worst.reply_rate * 100).toFixed(1)}%. Consider shifting more touchpoints to ${best.channel}.`,
      expected_impact: 'Improve overall campaign reply rate by rebalancing channels',
      auto_applicable: false,
      evidence: { best_channel: best, worst_channel: worst },
    });
  }
}

function analyzeStepPerformance(analytics: CampaignAnalytics, recs: Recommendation[]) {
  const steps = analytics.step_performance.filter((s) => s.sent >= 3);
  if (steps.length < 2) return;

  // Find steps with zero replies
  const deadSteps = steps.filter((s) => s.replied === 0 && s.sent >= 5);
  for (const step of deadSteps) {
    recs.push({
      type: 'sequence',
      priority: 'medium',
      title: `Step ${step.step_index + 1} has zero replies`,
      description: `Step ${step.step_index + 1} (${step.channel}) has been sent ${step.sent} times with no replies. Revise the messaging or consider removing this step.`,
      expected_impact: 'Improve sequence efficiency by fixing or removing dead steps',
      auto_applicable: false,
      evidence: { step_index: step.step_index, channel: step.channel, sent: step.sent },
    });
  }

  // Identify drop-off point
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const curr = steps[i];
    if (prev.open_rate > 0.2 && curr.open_rate < 0.1 && curr.sent >= 5) {
      recs.push({
        type: 'sequence',
        priority: 'medium',
        title: `Sharp engagement drop at Step ${curr.step_index + 1}`,
        description: `Open rate dropped from ${(prev.open_rate * 100).toFixed(1)}% (Step ${prev.step_index + 1}) to ${(curr.open_rate * 100).toFixed(1)}% (Step ${curr.step_index + 1}). Leads may be losing interest — consider refreshing the approach at this point.`,
        expected_impact: 'Recover 10-20% engagement in later steps',
        auto_applicable: false,
        evidence: { prev_step: prev.step_index, curr_step: curr.step_index, prev_open: prev.open_rate, curr_open: curr.open_rate },
      });
    }
  }
}

function analyzeFunnel(analytics: CampaignAnalytics, recs: Recommendation[]) {
  const { overview } = analytics;

  if (overview.meetings_booked > 0 && overview.conversions === 0) {
    recs.push({
      type: 'sequence',
      priority: 'high',
      title: 'Meetings booked but no conversions',
      description: `${overview.meetings_booked} meetings were booked but none converted. Review meeting quality, follow-up process, or pricing alignment.`,
      expected_impact: 'Convert booked meetings into enrollments',
      auto_applicable: false,
      evidence: { meetings: overview.meetings_booked, conversions: overview.conversions },
    });
  }

  if (overview.total_leads >= 20 && overview.sent_count < overview.total_leads * 0.5) {
    recs.push({
      type: 'sequence',
      priority: 'medium',
      title: 'Low send rate — many leads not yet contacted',
      description: `Only ${overview.sent_count} of ${overview.total_leads} leads have received messages. Check if the scheduler is running or if there are configuration issues.`,
      expected_impact: 'Reach more enrolled leads',
      auto_applicable: false,
      evidence: { leads: overview.total_leads, sent: overview.sent_count },
    });
  }
}

async function analyzeFromKnowledge(campaign: any, recs: Recommendation[]) {
  try {
    const insights = await getRelevantInsights({
      campaign_type: campaign.type,
      insight_type: 'channel_perf',
      min_confidence: 0.5,
      limit: 3,
    });

    for (const insight of insights) {
      const evidence = insight.evidence || {};
      if (evidence.reply_rate && evidence.reply_rate > 0.08) {
        recs.push({
          type: 'channel',
          priority: 'low',
          title: `Historical insight: ${insight.category}`,
          description: insight.insight,
          expected_impact: 'Apply proven patterns from successful past campaigns',
          auto_applicable: false,
          evidence: { source: 'campaign_knowledge', insight_id: insight.id, confidence: insight.confidence },
        });
      }
    }
  } catch {
    // Knowledge service unavailable — skip
  }
}
