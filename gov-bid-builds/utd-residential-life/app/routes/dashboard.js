'use strict';
const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'open'        THEN 1 ELSE 0 END) AS open_count,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
      SUM(CASE WHEN status = 'escalated'   THEN 1 ELSE 0 END) AS escalated_count,
      SUM(CASE WHEN status = 'resolved'    THEN 1 ELSE 0 END) AS resolved_count,
      COUNT(*) AS total_count
    FROM incident_reports
  `).get();

  const byType = db.prepare(`
    SELECT form_type, COUNT(*) AS cnt
    FROM incident_reports
    GROUP BY form_type
    ORDER BY cnt DESC
  `).all();

  const recent = db.prepare(`
    SELECT r.id, r.form_type, r.status, r.building, r.room_number,
           r.occurred_at, r.created_at, r.escalation_reason,
           u.name AS reporter_name
    FROM incident_reports r
    JOIN users u ON u.id = r.reporter_id
    ORDER BY r.created_at DESC
    LIMIT 10
  `).all();

  const notifications = db.prepare(`
    SELECT n.*, r.form_type
    FROM notifications n
    LEFT JOIN incident_reports r ON r.id = n.report_id
    WHERE n.user_id = ? AND n.read_flag = 0
    ORDER BY n.created_at DESC
    LIMIT 5
  `).all(req.user.id);

  res.render('dashboard', { title: 'Dashboard', counts, byType, recent, notifications });
});

module.exports = router;
