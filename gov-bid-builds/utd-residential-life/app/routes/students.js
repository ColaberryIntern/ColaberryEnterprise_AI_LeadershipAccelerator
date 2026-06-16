'use strict';
const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const YEAR_LABELS = { freshman: 'Freshman', sophomore: 'Sophomore', junior: 'Junior', senior: 'Senior' };
const YEAR_BADGES = { freshman: 'bg-info text-dark', sophomore: 'bg-primary', junior: 'bg-warning text-dark', senior: 'bg-success' };

const TYPE_LABELS = {
  noise_complaint: 'Noise Complaint', lockout: 'Lockout',
  on_call_log: 'On-Call Log', roommate_agreement: 'Roommate Agreement', evaluation: 'Evaluation',
};
const TYPE_ICONS = {
  noise_complaint: 'bi-volume-up', lockout: 'bi-lock',
  on_call_log: 'bi-journal-text', roommate_agreement: 'bi-people', evaluation: 'bi-star',
};
const STATUS_BADGES = { open: 'bg-secondary', in_progress: 'bg-primary', escalated: 'bg-danger', resolved: 'bg-success' };
const STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', escalated: 'Escalated', resolved: 'Resolved' };

// ── List ──────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const user = req.user;
  const isRD = user.role === 'residence_director';
  const canManage = user.role === 'community_coordinator' || isRD;

  const residents = isRD
    ? db.prepare('SELECT * FROM residents ORDER BY building, name').all()
    : db.prepare('SELECT * FROM residents WHERE building = ? ORDER BY name').all(user.building);

  // Group by building
  const buildingMap = {};
  for (const r of residents) {
    if (!buildingMap[r.building]) buildingMap[r.building] = [];
    r.yearLabel  = YEAR_LABELS[r.year] || r.year;
    r.yearBadge  = YEAR_BADGES[r.year] || 'bg-secondary';
    buildingMap[r.building].push(r);
  }
  const buildingGroups = Object.entries(buildingMap).map(([building, list]) => ({ building, list }));

  const tierLabel = isRD ? 'Director view — full access'
    : canManage ? 'Coordinator view — excludes RD-private records'
    : 'Staff view — basic profiles only';
  const tierBadge = isRD ? 'bg-success' : canManage ? 'bg-warning text-dark' : 'bg-secondary';

  res.render('students/index', {
    title: 'Student Profiles',
    user, canManage, isRD,
    buildingGroups,
    totalCount: residents.length,
    tierLabel, tierBadge,
  });
});

// ── 360 profile ───────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const user = req.user;
  const isRD = user.role === 'residence_director';
  const isCC = user.role === 'community_coordinator';
  const isSS = user.role === 'student_staff';
  const canManage = isCC || isRD;

  const resident = db.prepare('SELECT * FROM residents WHERE id = ?').get(req.params.id);
  if (!resident) return res.redirect('/students');
  if (!isRD && resident.building !== user.building) return res.redirect('/students');

  resident.yearLabel = YEAR_LABELS[resident.year] || resident.year;
  resident.yearBadge = YEAR_BADGES[resident.year] || 'bg-secondary';

  // Incident history (excluding roommate agreements — shown separately)
  const rawIncidents = db.prepare(`
    SELECT ir.*, u.name AS reporter_name
    FROM incident_reports ir LEFT JOIN users u ON u.id = ir.reporter_id
    WHERE ir.building = ? AND ir.room_number = ? AND ir.form_type != 'roommate_agreement'
    ORDER BY ir.created_at DESC
  `).all(resident.building, resident.room);

  const incidents = rawIncidents.map(i => ({
    ...i,
    typeLabel:     TYPE_LABELS[i.form_type] || i.form_type,
    typeIcon:      TYPE_ICONS[i.form_type]  || 'bi-file-earmark',
    statusBadge:   STATUS_BADGES[i.status]  || 'bg-secondary',
    statusLabel:   STATUS_LABELS[i.status]  || i.status,
    formData:      JSON.parse(i.form_data || '{}'),
    formattedDate: i.occurred_at
      ? new Date(i.occurred_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : '—',
  }));

  // Roommate agreement (most recent for this room)
  const rawAgreement = db.prepare(`
    SELECT ir.*, u.name AS reporter_name
    FROM incident_reports ir LEFT JOIN users u ON u.id = ir.reporter_id
    WHERE ir.form_type = 'roommate_agreement' AND ir.building = ? AND ir.room_number = ?
    ORDER BY ir.created_at DESC LIMIT 1
  `).get(resident.building, resident.room);

  let agreement = null;
  if (rawAgreement) {
    const fd = JSON.parse(rawAgreement.form_data || '{}');
    agreement = {
      ...rawAgreement, ...fd,
      formattedDate: rawAgreement.occurred_at
        ? new Date(rawAgreement.occurred_at).toLocaleDateString('en-US', { dateStyle: 'long' })
        : '—',
    };
  }

  // Program history — approved proposals targeting this building or all residents
  const programs = db.prepare(`
    SELECT pp.*, u.name AS submitter_name
    FROM program_proposals pp LEFT JOIN users u ON u.id = pp.submitter_id
    WHERE pp.status = 'approved'
      AND (pp.target_audience LIKE '%' || ? || '%' OR pp.target_audience LIKE '%all%')
    ORDER BY pp.proposed_date DESC
  `).all(resident.building);

  // Staff notes — privacy gated
  const notesQuery = isRD
    ? `SELECT sn.*, u.name AS author_name, u.role AS author_role
       FROM staff_notes sn JOIN users u ON u.id = sn.author_id
       WHERE sn.resident_id = ? ORDER BY sn.created_at DESC`
    : `SELECT sn.*, u.name AS author_name, u.role AS author_role
       FROM staff_notes sn JOIN users u ON u.id = sn.author_id
       WHERE sn.resident_id = ? AND sn.is_private = 0 ORDER BY sn.created_at DESC`;

  const notes = (canManage ? db.prepare(notesQuery).all(resident.id) : []).map(n => ({
    ...n,
    isPrivate: !!n.is_private,
    formattedDate: new Date(n.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
  }));

  const tierLabel = isRD ? 'Director view — full access'
    : isCC ? 'Coordinator view — excludes RD-private records'
    : 'Staff view — basic profile only';
  const tierBadge = isRD ? 'bg-success' : isCC ? 'bg-warning text-dark' : 'bg-secondary';

  res.render('students/show', {
    title: `${resident.name} — 360 Profile`,
    user, canManage, isRD, isCC, isSS,
    resident, incidents, agreement, programs, notes,
    tierLabel, tierBadge,
    flash: req.query.flash || null,
  });
});

// ── Add staff note ────────────────────────────────────────────────────────────
router.post('/:id/notes', (req, res) => {
  const user = req.user;
  if (user.role === 'student_staff') return res.redirect(`/students/${req.params.id}`);

  const resident = db.prepare('SELECT * FROM residents WHERE id = ?').get(req.params.id);
  if (!resident) return res.redirect('/students');

  const isRD = user.role === 'residence_director';
  const isPrivate = isRD && req.body.is_private === 'on' ? 1 : 0;

  db.prepare(
    'INSERT INTO staff_notes (resident_id, author_id, body, is_private) VALUES (?, ?, ?, ?)'
  ).run(resident.id, user.id, req.body.body, isPrivate);

  res.redirect(`/students/${resident.id}?flash=note_added`);
});

module.exports = router;
