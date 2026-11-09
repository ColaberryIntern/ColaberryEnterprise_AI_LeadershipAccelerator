'use strict';
const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const FORM_TYPES = ['noise_complaint', 'lockout', 'on_call_log', 'roommate_agreement', 'evaluation'];
const STATUSES = ['open', 'in_progress', 'escalated', 'resolved'];

const BUILDINGS = [
  'Andrews Hall', 'Berkner Hall', 'Caruth Hall', 'Coman Hall',
  'Galatyn Park', 'Hillhouse', 'Northside', 'Residence Hall West', 'University Village',
];

function checkEscalation(formType, occurredAt) {
  if (formType === 'noise_complaint') {
    const dt = occurredAt ? new Date(occurredAt) : new Date();
    const hour = dt.getHours();
    if (hour >= 22 || hour < 8) {
      return {
        shouldEscalate: true,
        reason: 'Noise complaint filed during quiet hours (10 PM – 8 AM)',
      };
    }
  }
  return { shouldEscalate: false };
}

module.exports = function makeRouter(upload) {
  const router = express.Router();
  router.use(requireAuth);

  // ── List ──────────────────────────────────────────────────────────────────
  router.get('/', (req, res) => {
    const { type, status } = req.query;
    const clauses = [];
    const params = [];

    if (type && FORM_TYPES.includes(type)) {
      clauses.push('r.form_type = ?');
      params.push(type);
    }
    if (status && STATUSES.includes(status)) {
      clauses.push('r.status = ?');
      params.push(status);
    }

    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const reports = db.prepare(`
      SELECT r.id, r.form_type, r.status, r.building, r.room_number,
             r.occurred_at, r.created_at, r.escalation_reason,
             u.name AS reporter_name
      FROM incident_reports r
      JOIN users u ON u.id = r.reporter_id
      ${where}
      ORDER BY r.created_at DESC
    `).all(...params);

    const typeOptions = [
      { value: '', label: 'All Types', selected: !type },
      ...FORM_TYPES.map(f => ({
        value: f,
        label: f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        selected: f === type,
      })),
    ];

    const statusOptions = [
      { value: '', label: 'All Statuses', selected: !status },
      { value: 'open',        label: 'Open',        selected: status === 'open' },
      { value: 'in_progress', label: 'In Progress', selected: status === 'in_progress' },
      { value: 'escalated',   label: 'Escalated',   selected: status === 'escalated' },
      { value: 'resolved',    label: 'Resolved',    selected: status === 'resolved' },
    ];

    res.render('reports/index', {
      title: 'Reports',
      reports,
      typeOptions,
      statusOptions,
      hasFilter: Boolean(type || status),
    });
  });

  // ── New form ──────────────────────────────────────────────────────────────
  router.get('/new', (req, res) => {
    const selectedType = FORM_TYPES.includes(req.query.type) ? req.query.type : null;
    res.render('reports/new', {
      title: selectedType
        ? selectedType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : 'New Report',
      buildings: BUILDINGS,
      selectedType,
    });
  });

  // ── Create ────────────────────────────────────────────────────────────────
  router.post('/', upload.single('photo'), (req, res) => {
    const { form_type, building, room_number, description, occurred_at, ...rest } = req.body;

    if (!form_type || !FORM_TYPES.includes(form_type)) {
      return res.redirect('/reports/new?error=invalid_type');
    }
    const trimmedDesc = (description || '').trim();
    if (trimmedDesc.length < 5) {
      return res.redirect(`/reports/new?type=${form_type}&error=description_required`);
    }

    const escalation = checkEscalation(form_type, occurred_at);
    const rd = db.prepare(`SELECT id FROM users WHERE role = 'residence_director' LIMIT 1`).get();
    const cc = db.prepare(`SELECT id FROM users WHERE role = 'community_coordinator' LIMIT 1`).get();

    // Collect type-specific fields into form_data JSON
    const formData = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && String(v).trim() !== '') formData[k] = String(v).trim();
    }

    const result = db.prepare(`
      INSERT INTO incident_reports
        (form_type, status, reporter_id, building, room_number, description,
         occurred_at, form_data, photo_filename, escalated_to_id, escalation_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      form_type,
      escalation.shouldEscalate ? 'escalated' : 'open',
      req.user.id,
      building || null,
      room_number || null,
      trimmedDesc,
      occurred_at || null,
      JSON.stringify(formData),
      req.file ? req.file.filename : null,
      escalation.shouldEscalate && rd ? rd.id : null,
      escalation.reason || null,
    );

    const reportId = result.lastInsertRowid;

    // Notifications
    if (escalation.shouldEscalate && rd) {
      db.prepare(`INSERT INTO notifications (user_id, report_id, message) VALUES (?, ?, ?)`).run(
        rd.id, reportId,
        `Escalated noise complaint #${reportId} — filed during quiet hours at ${building || 'unknown location'}`,
      );
    }
    if (form_type === 'lockout' && cc) {
      db.prepare(`INSERT INTO notifications (user_id, report_id, message) VALUES (?, ?, ?)`).run(
        cc.id, reportId,
        `Lockout #${reportId} at ${building || 'unknown'} ${room_number || ''} — please assist`,
      );
    }

    res.redirect(`/reports/${reportId}`);
  });

  // ── Show ──────────────────────────────────────────────────────────────────
  router.get('/:id', (req, res) => {
    const report = db.prepare(`
      SELECT r.*, u.name AS reporter_name, u.role AS reporter_role,
             eu.name AS escalated_to_name
      FROM incident_reports r
      JOIN users u ON u.id = r.reporter_id
      LEFT JOIN users eu ON eu.id = r.escalated_to_id
      WHERE r.id = ?
    `).get(req.params.id);

    if (!report) return res.status(404).send('Report not found');

    let formData = {};
    try { formData = JSON.parse(report.form_data || '{}'); } catch { /* ignore */ }

    const formDataEntries = Object.entries(formData)
      .filter(([, v]) => String(v).trim() !== '')
      .map(([k, v]) => ({
        key: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        value: v,
      }));

    const statusOptions = STATUSES
      .filter(s => s !== report.status)
      .map(s => ({
        value: s,
        label: s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      }));

    res.render('reports/show', {
      title: `Report #${report.id}`,
      report,
      formDataEntries,
      statusOptions,
      hasPhoto: Boolean(report.photo_filename),
    });
  });

  // ── Update status ─────────────────────────────────────────────────────────
  router.post('/:id/status', (req, res) => {
    const { status } = req.body;
    if (!STATUSES.includes(status)) return res.redirect(`/reports/${req.params.id}`);
    db.prepare(`
      UPDATE incident_reports SET status = ?, updated_at = datetime('now') WHERE id = ?
    `).run(status, req.params.id);
    res.redirect(`/reports/${req.params.id}`);
  });

  return router;
};
