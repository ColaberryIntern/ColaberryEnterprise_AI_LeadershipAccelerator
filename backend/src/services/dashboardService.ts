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
    // Query 1: Email counts from scheduled_emails, SMS+voice from communication_logs
    sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM scheduled_emails WHERE channel = 'email' AND status = 'sent' AND sent_at >= :today) as emails_today,
        (SELECT COUNT(*) FROM scheduled_emails WHERE channel = 'email' AND status = 'sent' AND sent_at >= :weekAgo) as emails_week,
        (SELECT COUNT(*) FROM communication_logs WHERE channel = 'sms' AND direction = 'outbound' AND status IN ('sent','delivered') AND created_at >= :today) as sms_today,
        (SELECT COUNT(*) FROM communication_logs WHERE channel = 'sms' AND direction = 'outbound' AND status IN ('sent','delivered') AND created_at >= :weekAgo) as sms_week,
        (SELECT COUNT(*) FROM communication_logs WHERE channel = 'voice' AND direction = 'outbound' AND created_at >= :today) as voice_today,
        (SELECT COUNT(*) FROM communication_logs WHERE channel = 'voice' AND direction = 'outbound' AND created_at >= :weekAgo) as voice_week
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

    // Query 4: Hot leads count (2+ opens OR any click — matches escalation trigger)
    sequelize.query(`
      SELECT COUNT(DISTINCT sub.lead_id) as cnt FROM (
        SELECT lead_id FROM interaction_outcomes WHERE outcome = 'opened'
        GROUP BY lead_id HAVING COUNT(*) >= 2
        UNION
        SELECT DISTINCT lead_id FROM interaction_outcomes WHERE outcome = 'clicked'
      ) sub
    `, { type: QueryTypes.SELECT }),
  ]);

  const ch = (channelCounts as any)[0] || {};
  const eng = (engagementRates as any)[0] || {};
  const hotCount = parseInt((hotLeads as any)[0]?.cnt || '0', 10);

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
    hot_leads_count: hotCount,
    active_campaigns: activeCampaigns,
  };
}
