import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import Campaign from '../models/Campaign';
import Lead from '../models/Lead';

export interface CampaignActivitySummary {
  emails_sent_today: number;
  emails_sent_week: number;
  sms_sent_today: number;
  sms_sent_week: number;
  voice_calls_today: number;
  voice_calls_week: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
  hot_leads_count: number;
  active_campaigns: number;
}

export async function getCampaignActivitySummary(): Promise<CampaignActivitySummary> {
  const nowCT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const todayStart = new Date(nowCT);
  todayStart.setHours(0, 0, 0, 0);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [channelCounts, engagementRates, activeCampaigns, hotLeads] = await Promise.all([
    // Query 1: Channel send counts
    sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE channel = 'email' AND sent_at >= :today) as emails_today,
        COUNT(*) FILTER (WHERE channel = 'email' AND sent_at >= :weekAgo) as emails_week,
        COUNT(*) FILTER (WHERE channel = 'sms' AND sent_at >= :today) as sms_today,
        COUNT(*) FILTER (WHERE channel = 'sms' AND sent_at >= :weekAgo) as sms_week,
        COUNT(*) FILTER (WHERE channel = 'voice' AND sent_at >= :today) as voice_today,
        COUNT(*) FILTER (WHERE channel = 'voice' AND sent_at >= :weekAgo) as voice_week
      FROM scheduled_emails
      WHERE status = 'sent' AND sent_at >= :weekAgo
    `, {
      replacements: { today: todayStart.toISOString(), weekAgo: weekAgo.toISOString() },
      type: QueryTypes.SELECT,
    }),

    // Query 2: Engagement rates from interaction_outcomes
    sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE outcome = 'sent') as total_sent,
        COUNT(*) FILTER (WHERE outcome = 'opened') as total_opened,
        COUNT(*) FILTER (WHERE outcome = 'clicked') as total_clicked,
        COUNT(*) FILTER (WHERE outcome = 'bounced') as total_bounced
      FROM interaction_outcomes
      WHERE created_at >= :weekAgo
    `, {
      replacements: { weekAgo: weekAgo.toISOString() },
      type: QueryTypes.SELECT,
    }),

    // Query 3: Active campaigns count
    Campaign.count({ where: { status: 'active' } }),

    // Query 4: Hot leads count
    Lead.count({ where: { lead_temperature: 'hot' } }),
  ]);

  const ch = (channelCounts as any)[0] || {};
  const eng = (engagementRates as any)[0] || {};

  const totalSent = parseInt(eng.total_sent || '0', 10);
  const totalOpened = parseInt(eng.total_opened || '0', 10);
  const totalClicked = parseInt(eng.total_clicked || '0', 10);
  const totalBounced = parseInt(eng.total_bounced || '0', 10);

  return {
    emails_sent_today: parseInt(ch.emails_today || '0', 10),
    emails_sent_week: parseInt(ch.emails_week || '0', 10),
    sms_sent_today: parseInt(ch.sms_today || '0', 10),
    sms_sent_week: parseInt(ch.sms_week || '0', 10),
    voice_calls_today: parseInt(ch.voice_today || '0', 10),
    voice_calls_week: parseInt(ch.voice_week || '0', 10),
    open_rate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100 * 10) / 10 : 0,
    click_rate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100 * 10) / 10 : 0,
    bounce_rate: totalSent > 0 ? Math.round((totalBounced / totalSent) * 100 * 10) / 10 : 0,
    hot_leads_count: hotLeads,
    active_campaigns: activeCampaigns,
  };
}
