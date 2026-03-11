import { Op, fn, col, literal } from 'sequelize';
import Campaign from '../models/Campaign';
import CampaignHealth from '../models/CampaignHealth';
import CampaignError from '../models/CampaignError';
import { ScheduledEmail, CampaignLead, InteractionOutcome } from '../models';
import { env } from '../config/env';
import { logAiEvent } from './aiEventService';
import type { HealthStatus } from '../models/CampaignHealth';

interface ComponentHealth {
  ok: boolean;
  error?: string;
}

interface ScanResult {
  campaign_id: string;
  health_score: number;
  status: HealthStatus;
  lead_count: number;
  active_lead_count: number;
  sent_count: number;
  error_count: number;
  components: Record<string, ComponentHealth>;
  metrics: Record<string, number>;
}

/**
 * Scan all active campaigns and compute health scores.
 */
export async function scanAllCampaigns(): Promise<ScanResult[]> {
  const startTime = Date.now();
  const activeCampaigns = await Campaign.findAll({
    where: { status: 'active' },
  });

  const results: ScanResult[] = [];
  for (const campaign of activeCampaigns) {
    try {
      const result = await scanCampaign(campaign);
      results.push(result);
    } catch (err: any) {
      console.error(`[HealthScanner] Error scanning campaign ${campaign.id}:`, err.message);
    }
  }

  await logAiEvent('campaign_health_scanner', 'scan_completed', undefined, undefined, {
    campaigns_scanned: results.length,
    healthy: results.filter((r) => r.status === 'healthy').length,
    degraded: results.filter((r) => r.status === 'degraded').length,
    critical: results.filter((r) => r.status === 'critical').length,
    duration_ms: Date.now() - startTime,
  });

  console.log(
    `[HealthScanner] Scan complete: ${results.length} campaigns — ` +
      `${results.filter((r) => r.status === 'healthy').length} healthy, ` +
      `${results.filter((r) => r.status === 'degraded').length} degraded, ` +
      `${results.filter((r) => r.status === 'critical').length} critical`,
  );

  return results;
}

/**
 * Scan a single campaign and upsert its health record.
 */
export async function scanCampaign(campaign: Campaign): Promise<ScanResult> {
  const now = new Date();
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // --- Lead counts ---
  const leadCount = await CampaignLead.count({
    where: { campaign_id: campaign.id },
  });
  const activeLeadCount = await CampaignLead.count({
    where: { campaign_id: campaign.id, status: { [Op.in]: ['enrolled', 'active'] } },
  });

  // --- Action counts (last 24h) ---
  const sentCount = await ScheduledEmail.count({
    where: { campaign_id: campaign.id, status: 'sent', sent_at: { [Op.gte]: last24h } },
  });
  const failedCount = await ScheduledEmail.count({
    where: { campaign_id: campaign.id, status: 'failed', created_at: { [Op.gte]: last24h } },
  });
  const totalActions24h = sentCount + failedCount;

  // --- AI generation stats (last 24h) ---
  const aiAttempted = await ScheduledEmail.count({
    where: { campaign_id: campaign.id, ai_generated: true, created_at: { [Op.gte]: last24h } },
  });
  const aiFailed = await ScheduledEmail.count({
    where: {
      campaign_id: campaign.id,
      ai_generated: false,
      ai_instructions: { [Op.ne]: null as any },
      status: 'failed',
      created_at: { [Op.gte]: last24h },
    },
  });

  // --- Engagement metrics (last 7 days) ---
  const outcomes = await InteractionOutcome.findAll({
    where: { campaign_id: campaign.id, created_at: { [Op.gte]: last7d } },
    attributes: [
      'outcome',
      [fn('COUNT', col('id')), 'count'],
    ],
    group: ['outcome'],
    raw: true,
  }) as any[];

  const outcomeCounts: Record<string, number> = {};
  for (const row of outcomes) {
    outcomeCounts[row.outcome] = parseInt(row.count, 10);
  }
  const totalSent7d = (outcomeCounts['sent'] || 0) + (outcomeCounts['opened'] || 0) +
    (outcomeCounts['clicked'] || 0) + (outcomeCounts['replied'] || 0) +
    (outcomeCounts['bounced'] || 0);
  const openRate = totalSent7d > 0 ? ((outcomeCounts['opened'] || 0) + (outcomeCounts['clicked'] || 0) + (outcomeCounts['replied'] || 0)) / totalSent7d : 0;
  const replyRate = totalSent7d > 0 ? (outcomeCounts['replied'] || 0) / totalSent7d : 0;
  const bounceRate = totalSent7d > 0 ? (outcomeCounts['bounced'] || 0) / totalSent7d : 0;

  // --- Unresolved errors ---
  const unresolvedErrors = await CampaignError.count({
    where: { campaign_id: campaign.id, resolved: false },
  });

  // --- Channel connectivity checks ---
  const channelConfig = campaign.channel_config || {};
  const components: Record<string, ComponentHealth> = {};

  // Email
  if (channelConfig.email?.enabled) {
    components.email = { ok: !!(env.smtpUser && env.smtpPass) };
    if (!components.email.ok) components.email.error = 'SMTP credentials not configured';
  }

  // Voice
  if (channelConfig.voice?.enabled) {
    components.voice = { ok: !!(env.synthflowApiKey && env.synthflowInterestAgentId) };
    if (!components.voice.ok) components.voice.error = 'Synthflow API key or agent ID missing';
  }

  // SMS
  if (channelConfig.sms?.enabled) {
    components.sms = { ok: true }; // GHL key is in DB settings, not env — assume ok if enabled
  }

  // AI
  components.ai = { ok: !!env.openaiApiKey };
  if (!components.ai.ok) components.ai.error = 'OpenAI API key not configured';

  // --- Compute health score (weighted composite 0–100) ---
  let score = 0;

  // Channel connectivity (30 points)
  const enabledChannels = Object.values(components);
  if (enabledChannels.length > 0) {
    const channelScore = enabledChannels.filter((c) => c.ok).length / enabledChannels.length;
    score += 30 * channelScore;
  } else {
    score += 30; // No channels configured = no penalty
  }

  // Delivery rate (25 points)
  if (totalActions24h > 0) {
    score += 25 * (sentCount / totalActions24h);
  } else {
    score += 25; // No actions = no penalty (campaign may be new)
  }

  // AI generation success (15 points)
  if (aiAttempted > 0) {
    const aiSuccessRate = Math.max(0, 1 - (Number(aiFailed) / aiAttempted));
    score += 15 * aiSuccessRate;
  } else {
    score += 15; // No AI attempts = no penalty
  }

  // Engagement (15 points)
  if (totalSent7d >= 5) {
    // Require minimum sample size
    const openCredit = Math.min(1, openRate / 0.10); // Full credit at 10%+
    const replyCredit = Math.min(1, replyRate / 0.02); // Full credit at 2%+
    score += 15 * ((openCredit + replyCredit) / 2);
  } else {
    score += 15; // Insufficient data = no penalty
  }

  // Error rate (15 points)
  if (totalActions24h > 0) {
    const errorPenalty = Math.min(1, unresolvedErrors / Math.max(totalActions24h, 1));
    score += 15 * (1 - errorPenalty);
  } else {
    score += 15 * (unresolvedErrors === 0 ? 1 : Math.max(0, 1 - unresolvedErrors / 5));
  }

  const healthScore = Math.round(Math.min(100, Math.max(0, score)));
  const status: HealthStatus = healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'degraded' : 'critical';

  // Compute additional rates for autonomous campaign support
  let unsubscribeRate = 0;
  let conversionRate = 0;
  if (totalSent7d >= 5) {
    const unsubCount = await InteractionOutcome.count({
      where: { campaign_id: campaign.id, outcome: 'unsubscribed', created_at: { [Op.gte]: last7d } },
    });
    const convertCount = await InteractionOutcome.count({
      where: { campaign_id: campaign.id, outcome: 'converted', created_at: { [Op.gte]: last7d } },
    });
    unsubscribeRate = unsubCount / totalSent7d;
    conversionRate = convertCount / totalSent7d;
  }

  const metrics: Record<string, any> = {
    open_rate: Math.round(openRate * 10000) / 100,
    reply_rate: Math.round(replyRate * 10000) / 100,
    bounce_rate: Math.round(bounceRate * 10000) / 100,
    unsubscribe_rate: Math.round(unsubscribeRate * 10000) / 100,
    conversion_rate: Math.round(conversionRate * 10000) / 100,
    sent_24h: sentCount,
    failed_24h: failedCount,
    ai_attempted_24h: aiAttempted,
    ai_failed_24h: Number(aiFailed),
  };

  // Add autonomous campaign signals
  if ((campaign as any).campaign_mode === 'autonomous') {
    const { CampaignVariant } = require('../models');
    metrics.ramp_phase = (campaign as any).ramp_state?.current_phase || 0;
    metrics.ramp_status = (campaign as any).ramp_state?.status || 'none';
    metrics.active_variants = await CampaignVariant.count({
      where: { campaign_id: campaign.id, status: { [Op.in]: ['active', 'testing', 'promoted'] } },
    });
  }

  // --- Upsert health record ---
  const existing = await CampaignHealth.findOne({
    where: { campaign_id: campaign.id },
  });

  if (existing) {
    await existing.update({
      health_score: healthScore,
      status,
      lead_count: leadCount,
      active_lead_count: activeLeadCount,
      sent_count: sentCount,
      error_count: unresolvedErrors,
      components,
      metrics,
      last_scan_at: now,
      updated_at: now,
    });
  } else {
    await CampaignHealth.create({
      campaign_id: campaign.id,
      health_score: healthScore,
      status,
      lead_count: leadCount,
      active_lead_count: activeLeadCount,
      sent_count: sentCount,
      error_count: unresolvedErrors,
      components,
      metrics,
      last_scan_at: now,
    });
  }

  return {
    campaign_id: campaign.id,
    health_score: healthScore,
    status,
    lead_count: leadCount,
    active_lead_count: activeLeadCount,
    sent_count: sentCount,
    error_count: unresolvedErrors,
    components,
    metrics,
  };
}
