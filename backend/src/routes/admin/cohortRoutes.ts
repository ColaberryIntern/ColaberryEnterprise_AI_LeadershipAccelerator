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
        SELECT a.created_at, a.type AS event_type, a.subject AS detail, 'activity' AS source,
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
      ORDER BY created_at DESC
      LIMIT 50
    `, { type: QueryTypes.SELECT });

    res.json(feed);
  } catch (err: any) {
    console.error('[WarRoom] Feed error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
