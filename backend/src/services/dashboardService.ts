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
  visitors_today: number;
  visitors_week: number;
  sessions_today: number;
}

export async function getCampaignActivitySummary(): Promise<CampaignActivitySummary> {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); // YYYY-MM-DD in CT
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const todayStart = new Date(); // fallback for non-date queries
  todayStart.setHours(todayStart.getHours() - 18); // rough CT midnight

  const [channelCounts, engagementRates, activeCampaigns, hotLeads, visitorCounts] = await Promise.all([
    // Query 1: Email counts from scheduled_emails, SMS+voice from communication_logs
    sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM scheduled_emails WHERE status = 'sent' AND sent_at::date = :todayStr::date) as emails_today,
        (SELECT COUNT(*) FROM scheduled_emails WHERE status = 'sent' AND sent_at >= :weekAgo) as emails_week,
        (SELECT COUNT(*) FROM communication_logs WHERE channel = 'sms' AND direction = 'outbound' AND created_at::date = :todayStr::date) as sms_today,
        (SELECT COUNT(*) FROM communication_logs WHERE channel = 'sms' AND direction = 'outbound' AND created_at >= :weekAgo) as sms_week,
        (SELECT COUNT(*) FROM communication_logs WHERE channel = 'voice' AND direction = 'outbound' AND created_at::date = :todayStr::date) as voice_today,
        (SELECT COUNT(*) FROM communication_logs WHERE channel = 'voice' AND direction = 'outbound' AND created_at >= :weekAgo) as voice_week
    `, {
      replacements: { todayStr, weekAgo: weekAgo.toISOString() },
      type: QueryTypes.SELECT,
    }),

    // Query 2: Engagement rates — unique leads only, denominator = unique leads communicated to
    sequelize.query(`
      SELECT
        (SELECT COUNT(DISTINCT lead_id) FROM scheduled_emails WHERE status = 'sent' AND sent_at >= :weekAgo) as total_sent,
        (SELECT COUNT(DISTINCT lead_id) FROM interaction_outcomes WHERE outcome = 'opened' AND created_at >= :weekAgo) as total_opened,
        (SELECT COUNT(DISTINCT lead_id) FROM interaction_outcomes WHERE outcome = 'clicked' AND created_at >= :weekAgo) as total_clicked,
        (SELECT COUNT(DISTINCT lead_id) FROM interaction_outcomes WHERE outcome = 'bounced' AND created_at >= :weekAgo) as total_bounced
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

    // Query 5: Visitor traffic counts
    sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM visitors WHERE last_seen_at::date = :todayStr::date) as visitors_today,
        (SELECT COUNT(*) FROM visitors WHERE last_seen_at >= :weekAgo) as visitors_week,
        (SELECT COUNT(*) FROM visitor_sessions WHERE started_at::date = :todayStr::date) as sessions_today
    `, {
      replacements: { todayStr, weekAgo: weekAgo.toISOString() },
      type: QueryTypes.SELECT,
    }),
  ]);

  const ch = (channelCounts as any)[0] || {};
  const eng = (engagementRates as any)[0] || {};
  const hotCount = parseInt((hotLeads as any)[0]?.cnt || '0', 10);
  const vc = (visitorCounts as any)[0] || {};

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
    visitors_today: parseInt(vc.visitors_today || '0', 10),
    visitors_week: parseInt(vc.visitors_week || '0', 10),
    sessions_today: parseInt(vc.sessions_today || '0', 10),
  };
}
