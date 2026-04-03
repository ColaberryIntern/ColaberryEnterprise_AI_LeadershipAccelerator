import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleAdminListCohorts,
  handleAdminGetCohort,
  handleAdminUpdateCohort,
  handleAdminExportCohort,
  handleAdminGetStats,
} from '../../controllers/adminCohortController';

const router = Router();

router.get('/api/admin/stats', requireAdmin, handleAdminGetStats);
router.get('/api/admin/cohorts', requireAdmin, handleAdminListCohorts);
router.get('/api/admin/cohorts/:id', requireAdmin, handleAdminGetCohort);
router.patch('/api/admin/cohorts/:id', requireAdmin, handleAdminUpdateCohort);
router.get('/api/admin/cohorts/:id/export', requireAdmin, handleAdminExportCohort);

// War Room composite activity feed — enriched with lead + campaign data
router.get('/api/admin/war-room/feed', requireAdmin, async (_req, res) => {
  try {
    const { sequelize } = require('../../config/database');
    const { QueryTypes } = require('sequelize');

    const feed = await sequelize.query(`
      (
        SELECT a.created_at, a.type::text AS event_type, a.subject AS detail, 'activity' AS source,
               a.lead_id,
               l.name AS lead_name, l.email AS lead_email, l.lead_score,
               l.lead_source_type, l.pipeline_stage AS lead_pipeline_stage,
               NULL AS campaign_name, NULL AS campaign_type
        FROM activities a
        LEFT JOIN leads l ON a.lead_id = l.id
        ORDER BY a.created_at DESC LIMIT 20
      )
      UNION ALL
      (
        SELECT cl.created_at, cl.channel || '_' || cl.status AS event_type,
               COALESCE(cl.subject, cl.to_address, '') AS detail, 'communication' AS source,
               cl.lead_id,
               l.name AS lead_name, l.email AS lead_email, l.lead_score,
               l.lead_source_type, l.pipeline_stage AS lead_pipeline_stage,
               c.name AS campaign_name, c.type AS campaign_type
        FROM communication_logs cl
        LEFT JOIN leads l ON cl.lead_id = l.id
        LEFT JOIN campaigns c ON cl.campaign_id = c.id
        WHERE cl.status IN ('sent', 'delivered', 'failed', 'bounced')
        ORDER BY cl.created_at DESC LIMIT 20
      )
      UNION ALL
      (
        SELECT se.sent_at AS created_at, se.channel || '_sent' AS event_type,
               COALESCE(se.subject, '') AS detail, 'campaign_email' AS source,
               se.lead_id,
               l.name AS lead_name, l.email AS lead_email, l.lead_score,
               l.lead_source_type, l.pipeline_stage AS lead_pipeline_stage,
               c.name AS campaign_name, c.type AS campaign_type
        FROM scheduled_emails se
        LEFT JOIN leads l ON se.lead_id = l.id
        LEFT JOIN campaigns c ON se.campaign_id = c.id
        WHERE se.status = 'sent' AND se.sent_at IS NOT NULL
        ORDER BY se.sent_at DESC LIMIT 20
      )
      UNION ALL
      (
        SELECT e.created_at, 'enrollment_' || e.payment_status AS event_type,
               e.full_name || ' (' || e.email || ')' AS detail, 'enrollment' AS source,
               NULL AS lead_id,
               e.full_name AS lead_name, e.email AS lead_email, NULL AS lead_score,
               NULL AS lead_source_type, NULL AS lead_pipeline_stage,
               NULL AS campaign_name, NULL AS campaign_type
        FROM enrollments e
        ORDER BY e.created_at DESC LIMIT 10
      )
      UNION ALL
      (
        SELECT io.created_at, io.outcome AS event_type,
               COALESCE(io.metadata->>'subject', io.metadata->>'url', '') AS detail, 'interaction' AS source,
               io.lead_id,
               l.name AS lead_name, l.email AS lead_email, l.lead_score,
               l.lead_source_type, l.pipeline_stage AS lead_pipeline_stage,
               NULL AS campaign_name, NULL AS campaign_type
        FROM interaction_outcomes io
        LEFT JOIN leads l ON io.lead_id = l.id
        WHERE io.outcome IN ('opened', 'clicked', 'replied')
        ORDER BY io.created_at DESC LIMIT 20
      )
      UNION ALL
      (
        SELECT pe.created_at, pe.event_type AS event_type,
               CASE
                 WHEN pe.event_type = 'demo_start' THEN 'Started AI demo on ' || pe.page_url
                 WHEN pe.event_type = 'demo_complete' THEN 'Completed AI demo on ' || pe.page_url
                 WHEN pe.event_type = 'form_start' THEN 'Started form on ' || pe.page_url
                 WHEN pe.event_type = 'cta_click' THEN COALESCE(pe.event_data->>'element_text', 'CTA click') || ' on ' || pe.page_path
                 WHEN pe.event_type = 'pageview' THEN 'Visited ' || pe.page_url
                 ELSE pe.event_type || ' on ' || pe.page_path
               END AS detail,
               'visitor' AS source,
               v.lead_id,
               l.name AS lead_name, l.email AS lead_email, l.lead_score,
               l.lead_source_type, l.pipeline_stage AS lead_pipeline_stage,
               NULL AS campaign_name, NULL AS campaign_type
        FROM page_events pe
        JOIN visitors v ON v.id = pe.visitor_id
        LEFT JOIN leads l ON v.lead_id = l.id
        WHERE pe.event_type IN ('pageview', 'cta_click', 'form_start', 'form_submit', 'demo_start', 'demo_complete', 'demo_skip', 'scroll', 'booking_modal_opened')
          AND pe.event_type != 'heartbeat'
        ORDER BY pe.created_at DESC LIMIT 20
      )
      ORDER BY created_at DESC
      LIMIT 50
    `, { type: QueryTypes.SELECT });

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
