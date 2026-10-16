'use strict';
const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const TYPE_LABELS = {
  academic: 'Academic', mental_health: 'Mental Health', safety: 'Safety',
  financial: 'Financial', behavioral: 'Behavioral', other: 'Other',
};
const TYPE_BADGES = {
  academic: 'bg-primary', mental_health: 'bg-info text-dark', safety: 'bg-danger',
  financial: 'bg-warning text-dark', behavioral: 'bg-secondary', other: 'bg-light text-dark border',
};
const TYPE_ICONS = {
  academic: 'bi-book', mental_health: 'bi-heart-pulse', safety: 'bi-shield-exclamation',
  financial: 'bi-currency-dollar', behavioral: 'bi-exclamation-triangle', other: 'bi-flag',
};
const URGENCY_BADGES = {
  low: 'bg-light text-dark border', medium: 'bg-warning text-dark',
  high: 'bg-danger', critical: 'bg-dark',
};
const STATUS_BADGES = {
  open: 'bg-danger', under_review: 'bg-warning text-dark',
  resolved: 'bg-success', dismissed: 'bg-light text-dark border',
};
const STATUS_LABELS = {
  open: 'Open', under_review: 'Under Review', resolved: 'Resolved', dismissed: 'Dismissed',
};

function decorate(flag) {
  return {
    ...flag,
    typeLabel:   TYPE_LABELS[flag.concern_type]   || flag.concern_type,
    typeBadge:   TYPE_BADGES[flag.concern_type]   || 'bg-secondary',
    typeIcon:    TYPE_ICONS[flag.concern_type]     || 'bi-flag',
    urgencyLabel: flag.urgency.charAt(0).toUpperCase() + flag.urgency.slice(1),
    urgencyBadge: URGENCY_BADGES[flag.urgency]    || 'bg-secondary',
    statusLabel: STATUS_LABELS[flag.status]        || flag.status,
    statusBadge: STATUS_BADGES[flag.status]        || 'bg-secondary',
    isOpen:      flag.status === 'open',
    isUnderReview: flag.status === 'under_review',
    isResolved:  flag.status === 'resolved' || flag.status === 'dismissed',
    formattedDate: new Date(flag.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
  };
}

// ── List ──────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const user = req.user;
  const isRD = user.role === 'residence_director';
  const canManage = user.role === 'community_coordinator' || isRD;

  const statusFilter = req.query.status || 'active';

  // Scope: RD sees all; CC sees own building; SS sees flags they created
  let flagsRaw;
  if (isRD) {
    flagsRaw = statusFilter === 'active'
      ? db.prepare(`
          SELECT cf.*, r.name AS resident_name, r.building, r.room,
            u1.name AS flagged_by_name, u1.role AS flagged_by_role,
            u2.name AS assigned_to_name
          FROM concern_flags cf
          JOIN residents r ON r.id = cf.resident_id
          JOIN users u1 ON u1.id = cf.flagged_by_id
          LEFT JOIN users u2 ON u2.id = cf.assigned_to_id
          WHERE cf.status IN ('open','under_review')
          ORDER BY CASE cf.urgency WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                   cf.created_at DESC
        `).all()
      : db.prepare(`
          SELECT cf.*, r.name AS resident_name, r.building, r.room,
            u1.name AS flagged_by_name, u1.role AS flagged_by_role,
            u2.name AS assigned_to_name
          FROM concern_flags cf
          JOIN residents r ON r.id = cf.resident_id
          JOIN users u1 ON u1.id = cf.flagged_by_id
          LEFT JOIN users u2 ON u2.id = cf.assigned_to_id
          ORDER BY cf.created_at DESC
        `).all();
  } else if (canManage) {
    flagsRaw = statusFilter === 'active'
      ? db.prepare(`
          SELECT cf.*, r.name AS resident_name, r.building, r.room,
            u1.name AS flagged_by_name, u1.role AS flagged_by_role,
            u2.name AS assigned_to_name
          FROM concern_flags cf
          JOIN residents r ON r.id = cf.resident_id
          JOIN users u1 ON u1.id = cf.flagged_by_id
          LEFT JOIN users u2 ON u2.id = cf.assigned_to_id
          WHERE r.building = ? AND cf.status IN ('open','under_review')
          ORDER BY CASE cf.urgency WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                   cf.created_at DESC
        `).all(user.building)
      : db.prepare(`
          SELECT cf.*, r.name AS resident_name, r.building, r.room,
            u1.name AS flagged_by_name, u1.role AS flagged_by_role,
            u2.name AS assigned_to_name
          FROM concern_flags cf
          JOIN residents r ON r.id = cf.resident_id
          JOIN users u1 ON u1.id = cf.flagged_by_id
          LEFT JOIN users u2 ON u2.id = cf.assigned_to_id
          WHERE r.building = ?
          ORDER BY cf.created_at DESC
        `).all(user.building);
  } else {
    // SS: only their own flags
    flagsRaw = db.prepare(`
      SELECT cf.*, r.name AS resident_name, r.building, r.room,
        u1.name AS flagged_by_name, u1.role AS flagged_by_role,
        u2.name AS assigned_to_name
      FROM concern_flags cf
      JOIN residents r ON r.id = cf.resident_id
      JOIN users u1 ON u1.id = cf.flagged_by_id
      LEFT JOIN users u2 ON u2.id = cf.assigned_to_id
      WHERE cf.flagged_by_id = ?
      ORDER BY cf.created_at DESC
    `).all(user.id);
  }

  const flags = flagsRaw.map(decorate);

  const openCount = isRD
    ? db.prepare("SELECT COUNT(*) AS c FROM concern_flags WHERE status IN ('open','under_review')").get().c
    : canManage
      ? db.prepare("SELECT COUNT(*) AS c FROM concern_flags cf JOIN residents r ON r.id = cf.resident_id WHERE r.building = ? AND cf.status IN ('open','under_review')").get(user.building).c
      : db.prepare("SELECT COUNT(*) AS c FROM concern_flags WHERE flagged_by_id = ? AND status IN ('open','under_review')").get(user.id).c;

  res.render('concerns/index', {
    title: 'Student Concerns',
    user, canManage, isRD,
    flags,
    openCount,
    statusFilter,
    showAll: statusFilter === 'all',
  });
});

// ── New flag form ─────────────────────────────────────────────────────────────
router.get('/new', (req, res) => {
  const user = req.user;
  const isRD = user.role === 'residence_director';

  // All residents the current user can see
  const residents = isRD
    ? db.prepare('SELECT * FROM residents ORDER BY building, name').all()
    : db.prepare('SELECT * FROM residents WHERE building = ? ORDER BY name').all(user.building);

  const preselected = req.query.resident_id ? Number(req.query.resident_id) : null;

  res.render('concerns/new', {
    title: 'Flag Student of Concern',
    user, isRD,
    residents,
    preselected,
    flash: req.query.flash || null,
  });
});

// ── Create flag ───────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const user = req.user;
  const { resident_id, concern_type, urgency, description } = req.body;

  if (!resident_id || !concern_type || !description) {
    return res.redirect('/concerns/new?flash=missing_fields');
  }

  const resident = db.prepare('SELECT * FROM residents WHERE id = ?').get(resident_id);
  if (!resident) return res.redirect('/concerns/new');

  const result = db.prepare(`
    INSERT INTO concern_flags (resident_id, flagged_by_id, concern_type, description, urgency)
    VALUES (?, ?, ?, ?, ?)
  `).run(Number(resident_id), user.id, concern_type, description, urgency || 'medium');

  const flagId = result.lastInsertRowid;

  // Notify professional staff in the resident's building
  const professionalStaff = db.prepare(`
    SELECT id, role FROM users
    WHERE role IN ('community_coordinator','residence_director')
      AND (building = ? OR role = 'residence_director')
  `).all(resident.building);

  const urgencyLabel = urgency ? urgency.charAt(0).toUpperCase() + urgency.slice(1) : 'Medium';
  const notifMsg = `[${urgencyLabel} concern] ${user.name} flagged ${resident.name} (${resident.building} Rm ${resident.room}) — ${TYPE_LABELS[concern_type] || concern_type}`;

  for (const staff of professionalStaff) {
    if (staff.id !== user.id) {
      db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(staff.id, notifMsg);
    }
  }

  res.redirect(`/concerns/${flagId}?flash=created`);
});

// ── Flag detail ───────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const user = req.user;
  const isRD = user.role === 'residence_director';
  const canManage = user.role === 'community_coordinator' || isRD;

  const flag = db.prepare(`
    SELECT cf.*,
      r.name AS resident_name, r.building, r.room, r.year, r.major,
      u1.name AS flagged_by_name, u1.role AS flagged_by_role,
      u2.name AS assigned_to_name,
      u3.name AS resolved_by_name
    FROM concern_flags cf
    JOIN residents r ON r.id = cf.resident_id
    JOIN users u1 ON u1.id = cf.flagged_by_id
    LEFT JOIN users u2 ON u2.id = cf.assigned_to_id
    LEFT JOIN users u3 ON u3.id = cf.resolved_by_id
    WHERE cf.id = ?
  `).get(req.params.id);

  if (!flag) return res.redirect('/concerns');

  // Access control: SS can only see flags they created in their building
  if (!isRD && !canManage && flag.flagged_by_id !== user.id) {
    return res.redirect('/concerns');
  }
  if (!isRD && canManage && flag.building !== user.building) {
    return res.redirect('/concerns');
  }

  // Potential assignees (CC/RD in this building)
  const assignees = db.prepare(`
    SELECT id, name, role FROM users
    WHERE role IN ('community_coordinator','residence_director')
      AND (building = ? OR role = 'residence_director')
    ORDER BY role, name
  `).all(flag.building);

  const decorated = decorate(flag);
  decorated.resolvedAt = flag.resolved_at
    ? new Date(flag.resolved_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  const canEdit = canManage || isRD;
  const isMyFlag = flag.flagged_by_id === user.id;

  res.render('concerns/show', {
    title: `Concern — ${flag.resident_name}`,
    user, canManage, isRD, canEdit, isMyFlag,
    flag: decorated,
    assignees,
    flash: req.query.flash || null,
  });
});

// ── Update status / assign / resolve ─────────────────────────────────────────
router.post('/:id/update', (req, res) => {
  const user = req.user;
  if (user.role === 'student_staff') return res.redirect(`/concerns/${req.params.id}`);

  const flag = db.prepare('SELECT * FROM concern_flags WHERE id = ?').get(req.params.id);
  if (!flag) return res.redirect('/concerns');

  const isRD = user.role === 'residence_director';
  const canManage = user.role === 'community_coordinator' || isRD;

  const resident = db.prepare('SELECT building FROM residents WHERE id = ?').get(flag.resident_id);
  if (!isRD && resident.building !== user.building) return res.redirect('/concerns');

  const { new_status, assigned_to_id, resolution_notes } = req.body;

  const isResolving = new_status === 'resolved' || new_status === 'dismissed';

  db.prepare(`
    UPDATE concern_flags
    SET status = ?,
        assigned_to_id = ?,
        resolution_notes = ?,
        resolved_by_id = ?,
        resolved_at = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    new_status || flag.status,
    assigned_to_id ? Number(assigned_to_id) : flag.assigned_to_id,
    resolution_notes || flag.resolution_notes,
    isResolving ? user.id : flag.resolved_by_id,
    isResolving ? new Date().toISOString() : flag.resolved_at,
    flag.id,
  );

  // Notify the flagger when status changes (if they're not the updater)
  if (flag.flagged_by_id !== user.id && new_status && new_status !== flag.status) {
    const residentRow = db.prepare('SELECT name FROM residents WHERE id = ?').get(flag.resident_id);
    db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
      flag.flagged_by_id,
      `Your concern flag for ${residentRow.name} has been updated to "${STATUS_LABELS[new_status] || new_status}" by ${user.name}`
    );
  }

  res.redirect(`/concerns/${flag.id}?flash=updated`);
});

module.exports = router;
