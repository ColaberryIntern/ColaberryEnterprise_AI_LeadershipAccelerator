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

// War Room composite activity feed
router.get('/api/admin/war-room/feed', requireAdmin, async (_req, res) => {
  try {
    const { sequelize } = require('../../config/database');
    const { QueryTypes } = require('sequelize');

    // Union query: activities + communication_logs + scheduled_emails (sent) + enrollments
    const feed = await sequelize.query(`
      (
        SELECT created_at, type AS event_type, subject AS detail, 'activity' AS source
        FROM activities
        ORDER BY created_at DESC LIMIT 20
      )
      UNION ALL
      (
        SELECT created_at, channel || '_' || status AS event_type,
               COALESCE(subject, to_address, '') AS detail, 'communication' AS source
        FROM communication_logs
        WHERE status IN ('sent', 'delivered', 'failed', 'bounced')
        ORDER BY created_at DESC LIMIT 20
      )
      UNION ALL
      (
        SELECT sent_at AS created_at, channel || '_sent' AS event_type,
               COALESCE(subject, '') AS detail, 'campaign_email' AS source
        FROM scheduled_emails
        WHERE status = 'sent' AND sent_at IS NOT NULL
        ORDER BY sent_at DESC LIMIT 20
      )
      UNION ALL
      (
        SELECT created_at, 'enrollment_' || payment_status AS event_type,
               email AS detail, 'enrollment' AS source
        FROM enrollments
        ORDER BY created_at DESC LIMIT 10
      )
      ORDER BY created_at DESC
      LIMIT 50
    `, { type: QueryTypes.SELECT });

    res.json(feed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
