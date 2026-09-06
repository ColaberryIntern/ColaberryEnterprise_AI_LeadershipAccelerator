import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { getActivityFeed } from '../../services/adminOs/warRoomFeedService';
import {
  handleAdminListCohorts,
  handleAdminGetCohort,
  handleAdminCreateCohort,
  handleAdminUpdateCohort,
  handleAdminDeleteCohort,
  handleAdminExportCohort,
  handleAdminGetStats,
} from '../../controllers/adminCohortController';

const router = Router();

router.get('/api/admin/stats', requireAdmin, handleAdminGetStats);
router.get('/api/admin/cohorts', requireAdmin, handleAdminListCohorts);
router.post('/api/admin/cohorts', requireAdmin, handleAdminCreateCohort);
router.get('/api/admin/cohorts/:id', requireAdmin, handleAdminGetCohort);
router.patch('/api/admin/cohorts/:id', requireAdmin, handleAdminUpdateCohort);
router.delete('/api/admin/cohorts/:id', requireAdmin, handleAdminDeleteCohort);
router.get('/api/admin/cohorts/:id/export', requireAdmin, handleAdminExportCohort);

// War Room composite activity feed — enriched with lead + campaign data
router.get('/api/admin/war-room/feed', requireAdmin, async (_req, res) => {
  try {
    // Query lives in warRoomFeedService so the Command Center can show the same
    // feed without a second copy of it. Behaviour here is unchanged.
    const feed = await getActivityFeed();
    res.json(feed);
  } catch (err: any) {
    console.error('[WarRoom] Feed error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// War Room live metrics — real-time activity counters
router.get('/api/admin/war-room/live-metrics', requireAdmin, async (_req, res) => {
  try {
    const { sequelize } = require('../../config/database');
    const { QueryTypes } = require('sequelize');
    const today = new Date().toISOString().slice(0, 10);

    const [[emailsToday], [smsToday], [callsToday], [opensToday], [clicksToday], [repliesToday], [bookingsToday], [hotLeads], [qualifiedLeads], [nextCohort], [phase2Today], [aliToday], [advisorClicks], [advisorSessions], [advisorLeads], [demoStarts], [demoCompletes], topDemoRows] = await Promise.all([
      sequelize.query("SELECT COUNT(*) as cnt FROM scheduled_emails WHERE status='sent' AND sent_at::date = :today", { replacements: { today }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM communication_logs WHERE channel='sms' AND direction='outbound' AND created_at::date = :today", { replacements: { today }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM communication_logs WHERE channel='voice' AND direction='outbound' AND created_at::date = :today", { replacements: { today }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM interaction_outcomes WHERE outcome='opened' AND created_at::date = :today", { replacements: { today }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM interaction_outcomes WHERE outcome='clicked' AND created_at::date = :today", { replacements: { today }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM interaction_outcomes WHERE outcome='replied' AND created_at::date = :today", { replacements: { today }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM strategy_calls WHERE created_at::date = :today", { replacements: { today }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM leads WHERE lead_temperature = 'hot'", { type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM leads WHERE lead_temperature = 'qualified'", { type: QueryTypes.SELECT }),
      sequelize.query("SELECT name, start_date, max_seats - seats_taken as seats_remaining FROM cohorts WHERE start_date > NOW() ORDER BY start_date LIMIT 1", { type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM campaign_leads cl JOIN campaigns c ON c.id = cl.campaign_id WHERE c.type = 'cold_outbound_phase2' AND cl.status = 'active'", { type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM scheduled_emails se JOIN campaigns c ON c.id = se.campaign_id WHERE c.type = 'executive_outreach' AND se.status = 'sent' AND se.sent_at::date = :today", { replacements: { today }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM interaction_outcomes WHERE outcome='clicked' AND created_at::date = :today AND metadata->>'url' LIKE '%advisor.colaberry.ai%'", { replacements: { today }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(DISTINCT visitor_id) as cnt FROM page_events WHERE created_at::date = :today AND page_url LIKE '%advisor.colaberry.ai%'", { replacements: { today }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM leads WHERE source = 'advisory' AND created_at::date = :today", { replacements: { today }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM page_events WHERE event_type = 'demo_start' AND created_at::date = :today", { replacements: { today }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM page_events WHERE event_type = 'demo_complete' AND created_at::date = :today", { replacements: { today }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT event_data->>'industry' as industry, COUNT(*) as cnt FROM page_events WHERE event_type IN ('demo_industry_click', 'cta_click') AND created_at::date = :today AND event_data->>'industry' IS NOT NULL GROUP BY event_data->>'industry' ORDER BY cnt DESC LIMIT 1", { replacements: { today }, type: QueryTypes.SELECT }),
    ]);

    res.json({
      emailsToday: parseInt(emailsToday.cnt),
      smsToday: parseInt(smsToday.cnt),
      callsToday: parseInt(callsToday.cnt),
      opensToday: parseInt(opensToday.cnt),
      clicksToday: parseInt(clicksToday.cnt),
      repliesToday: parseInt(repliesToday.cnt),
      bookingsToday: parseInt(bookingsToday.cnt),
      hotLeads: parseInt(hotLeads.cnt),
      qualifiedLeads: parseInt(qualifiedLeads.cnt),
      phase2Active: parseInt(phase2Today.cnt),
      aliEmailsToday: parseInt(aliToday.cnt),
      nextCohort: nextCohort ? { name: nextCohort.name, startDate: nextCohort.start_date, seatsRemaining: parseInt(nextCohort.seats_remaining) } : null,
      advisorClicksToday: parseInt(advisorClicks.cnt),
      advisorSessionsToday: parseInt(advisorSessions.cnt),
      advisorLeadsToday: parseInt(advisorLeads.cnt),
      demoStartsToday: parseInt(demoStarts.cnt),
      demoCompletesToday: parseInt(demoCompletes.cnt),
      topDemoIndustry: (topDemoRows as any[])?.[0]?.industry || null,
    });
  } catch (err: any) {
    console.error('[WarRoom] Live metrics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
