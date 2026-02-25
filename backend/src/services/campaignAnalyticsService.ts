import { Op, fn, col, literal, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { InteractionOutcome, ScheduledEmail, CampaignLead, Campaign } from '../models';

export interface CampaignAnalytics {
  overview: {
    total_leads: number;
    total_interactions: number;
    sent_count: number;
    opened_count: number;
    clicked_count: number;
    replied_count: number;
    bounced_count: number;
    meetings_booked: number;
    conversions: number;
    open_rate: number;
    click_rate: number;
    reply_rate: number;
    bounce_rate: number;
    meeting_rate: number;
    conversion_rate: number;
    budget_total: number | null;
    budget_spent: number;
    cost_per_lead: number | null;
    cost_per_meeting: number | null;
  };
  channel_performance: Array<{
    channel: string;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    meetings: number;
    open_rate: number;
    reply_rate: number;
  }>;
  funnel: Array<{
    stage: string;
    count: number;
    rate: number;
  }>;
  daily_series: Array<{
    date: string;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
  }>;
  step_performance: Array<{
    step_index: number;
    channel: string;
    total: number;
    sent: number;
    opened: number;
    replied: number;
    ai_generated: number;
    open_rate: number;
    reply_rate: number;
  }>;
  lead_outcomes: Array<{
    outcome: string;
    count: number;
  }>;
}

/** Get comprehensive analytics for a campaign */
export async function getCampaignAnalytics(
  campaignId: string,
  days?: number,
): Promise<CampaignAnalytics> {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const dateFilter: Record<string, any> = {};
  if (days) {
    dateFilter.created_at = { [Op.gte]: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
  }

  // Total leads enrolled
  const totalLeads = await CampaignLead.count({ where: { campaign_id: campaignId } });

  // All interaction outcomes for this campaign
  const outcomes = await InteractionOutcome.findAll({
    where: { campaign_id: campaignId, ...dateFilter },
    raw: true,
  }) as any[];

  const outcomeCounts: Record<string, number> = {};
  for (const o of outcomes) {
    outcomeCounts[o.outcome] = (outcomeCounts[o.outcome] || 0) + 1;
  }

  const sent = outcomeCounts['sent'] || 0;
  const opened = outcomeCounts['opened'] || 0;
  const clicked = outcomeCounts['clicked'] || 0;
  const replied = outcomeCounts['replied'] || 0;
  const bounced = outcomeCounts['bounced'] || 0;
  const meetings = outcomeCounts['booked_meeting'] || 0;
  const conversions = outcomeCounts['converted'] || 0;

  const budgetTotal = campaign.budget_total ? parseFloat(String(campaign.budget_total)) : null;
  const budgetSpent = parseFloat(String(campaign.budget_spent || 0));

  // Overview
  const overview = {
    total_leads: totalLeads,
    total_interactions: outcomes.length,
    sent_count: sent,
    opened_count: opened,
    clicked_count: clicked,
    replied_count: replied,
    bounced_count: bounced,
    meetings_booked: meetings,
    conversions,
    open_rate: sent > 0 ? opened / sent : 0,
    click_rate: sent > 0 ? clicked / sent : 0,
    reply_rate: sent > 0 ? replied / sent : 0,
    bounce_rate: sent > 0 ? bounced / sent : 0,
    meeting_rate: sent > 0 ? meetings / sent : 0,
    conversion_rate: totalLeads > 0 ? conversions / totalLeads : 0,
    budget_total: budgetTotal,
    budget_spent: budgetSpent,
    cost_per_lead: budgetSpent > 0 && totalLeads > 0 ? budgetSpent / totalLeads : null,
    cost_per_meeting: budgetSpent > 0 && meetings > 0 ? budgetSpent / meetings : null,
  };

  // Channel performance
  const channelMap: Record<string, Record<string, number>> = {};
  for (const o of outcomes) {
    if (!channelMap[o.channel]) {
      channelMap[o.channel] = { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, meetings: 0 };
    }
    const ch = channelMap[o.channel];
    if (o.outcome === 'sent') ch.sent++;
    else if (o.outcome === 'opened') ch.opened++;
    else if (o.outcome === 'clicked') ch.clicked++;
    else if (o.outcome === 'replied') ch.replied++;
    else if (o.outcome === 'bounced') ch.bounced++;
    else if (o.outcome === 'booked_meeting') ch.meetings++;
  }

  const channel_performance = Object.entries(channelMap).map(([channel, counts]) => ({
    channel,
    sent: counts.sent,
    opened: counts.opened,
    clicked: counts.clicked,
    replied: counts.replied,
    bounced: counts.bounced,
    meetings: counts.meetings,
    open_rate: counts.sent > 0 ? counts.opened / counts.sent : 0,
    reply_rate: counts.sent > 0 ? counts.replied / counts.sent : 0,
  }));

  // Funnel: sent → opened → clicked → replied → meeting → converted
  const funnelStages = [
    { stage: 'Sent', count: sent },
    { stage: 'Opened', count: opened },
    { stage: 'Clicked', count: clicked },
    { stage: 'Replied', count: replied },
    { stage: 'Meeting Booked', count: meetings },
    { stage: 'Converted', count: conversions },
  ];

  const funnel = funnelStages.map((s, i) => ({
    stage: s.stage,
    count: s.count,
    rate: i === 0 ? 1 : (funnelStages[0].count > 0 ? s.count / funnelStages[0].count : 0),
  }));

  // Daily time series
  const dailyMap: Record<string, Record<string, number>> = {};
  for (const o of outcomes) {
    const date = new Date(o.created_at).toISOString().substring(0, 10);
    if (!dailyMap[date]) {
      dailyMap[date] = { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 };
    }
    const day = dailyMap[date];
    if (o.outcome === 'sent') day.sent++;
    else if (o.outcome === 'opened') day.opened++;
    else if (o.outcome === 'clicked') day.clicked++;
    else if (o.outcome === 'replied') day.replied++;
    else if (o.outcome === 'bounced') day.bounced++;
  }

  const daily_series = Object.entries(dailyMap)
    .map(([date, counts]) => ({
      date,
      sent: counts.sent,
      opened: counts.opened,
      clicked: counts.clicked,
      replied: counts.replied,
      bounced: counts.bounced,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Step performance from ScheduledEmails
  const stepData: any[] = await sequelize.query(`
    SELECT
      se.step_index,
      se.channel,
      COUNT(*) as total,
      SUM(CASE WHEN se.status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN se.ai_generated = true THEN 1 ELSE 0 END) as ai_generated
    FROM scheduled_emails se
    WHERE se.campaign_id = :campaignId
    GROUP BY se.step_index, se.channel
    ORDER BY se.step_index
  `, {
    replacements: { campaignId },
    type: QueryTypes.SELECT,
  });

  // Get outcome counts per step from interaction_outcomes
  const stepOutcomes: any[] = await sequelize.query(`
    SELECT
      io.step_index,
      io.outcome,
      COUNT(*) as count
    FROM interaction_outcomes io
    WHERE io.campaign_id = :campaignId
    GROUP BY io.step_index, io.outcome
    ORDER BY io.step_index
  `, {
    replacements: { campaignId },
    type: QueryTypes.SELECT,
  });

  const stepOutcomeMap: Record<number, Record<string, number>> = {};
  for (const so of stepOutcomes) {
    const idx = so.step_index;
    if (!stepOutcomeMap[idx]) stepOutcomeMap[idx] = {};
    stepOutcomeMap[idx][so.outcome] = parseInt(so.count, 10);
  }

  const step_performance = stepData.map((s: any) => {
    const sentCount = parseInt(s.sent, 10) || 0;
    const stepOuts = stepOutcomeMap[s.step_index] || {};
    const openedCount = stepOuts['opened'] || 0;
    const repliedCount = stepOuts['replied'] || 0;
    return {
      step_index: s.step_index,
      channel: s.channel,
      total: parseInt(s.total, 10),
      sent: sentCount,
      opened: openedCount,
      replied: repliedCount,
      ai_generated: parseInt(s.ai_generated, 10) || 0,
      open_rate: sentCount > 0 ? openedCount / sentCount : 0,
      reply_rate: sentCount > 0 ? repliedCount / sentCount : 0,
    };
  });

  // Lead outcomes from CampaignLead
  const leadOutcomes = await CampaignLead.findAll({
    where: { campaign_id: campaignId },
    attributes: [
      [fn('COALESCE', col('outcome'), literal("'pending'")), 'outcome'],
      [fn('COUNT', col('id')), 'count'],
    ],
    group: [fn('COALESCE', col('outcome'), literal("'pending'"))],
    raw: true,
  }) as any[];

  const lead_outcomes = leadOutcomes.map((lo: any) => ({
    outcome: lo.outcome,
    count: parseInt(lo.count, 10),
  }));

  return {
    overview,
    channel_performance,
    funnel,
    daily_series,
    step_performance,
    lead_outcomes,
  };
}

/** Get campaign attribution data for the revenue dashboard */
export async function getCampaignAttribution(): Promise<{
  campaigns: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    total_leads: number;
    total_sent: number;
    meetings_booked: number;
    conversions: number;
    conversion_rate: number;
    budget_spent: number;
  }>;
  by_type: Array<{
    type: string;
    campaigns: number;
    leads: number;
    conversions: number;
    meetings: number;
  }>;
}> {
  const campaigns = await Campaign.findAll({
    order: [['created_at', 'DESC']],
    raw: true,
  }) as any[];

  const result: any[] = [];
  const typeMap: Record<string, { campaigns: number; leads: number; conversions: number; meetings: number }> = {};

  for (const c of campaigns) {
    const totalLeads = await CampaignLead.count({ where: { campaign_id: c.id } });

    const outcomes = await InteractionOutcome.findAll({
      where: { campaign_id: c.id },
      attributes: ['outcome', [fn('COUNT', col('id')), 'count']],
      group: ['outcome'],
      raw: true,
    }) as any[];

    const outcomeCounts: Record<string, number> = {};
    for (const o of outcomes) {
      outcomeCounts[o.outcome] = parseInt(o.count, 10);
    }

    const totalSent = outcomeCounts['sent'] || 0;
    const meetingsBooked = outcomeCounts['booked_meeting'] || 0;
    const conversions = outcomeCounts['converted'] || 0;

    result.push({
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      total_leads: totalLeads,
      total_sent: totalSent,
      meetings_booked: meetingsBooked,
      conversions,
      conversion_rate: totalLeads > 0 ? conversions / totalLeads : 0,
      budget_spent: parseFloat(c.budget_spent || '0'),
    });

    // Aggregate by type
    if (!typeMap[c.type]) {
      typeMap[c.type] = { campaigns: 0, leads: 0, conversions: 0, meetings: 0 };
    }
    typeMap[c.type].campaigns++;
    typeMap[c.type].leads += totalLeads;
    typeMap[c.type].conversions += conversions;
    typeMap[c.type].meetings += meetingsBooked;
  }

  const by_type = Object.entries(typeMap).map(([type, data]) => ({ type, ...data }));

  return { campaigns: result, by_type };
}
