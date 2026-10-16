'use strict';
const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const SHIFT_TYPES = ['front_desk', 'on_call', 'ra_duty'];

const TYPE_LABELS  = { front_desk: 'Front Desk', on_call: 'On-Call', ra_duty: 'RA Duty' };
const TYPE_BADGES  = { front_desk: 'primary',    on_call: 'danger',  ra_duty: 'success' };
const STATUS_BADGES = { scheduled: 'secondary', completed: 'success', cancelled: 'dark' };
const STATUS_LABELS = { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled' };

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTimeRange(s, e) { return `${fmtTime(s)} – ${fmtTime(e)}`; }
function toDateStr(d) { return d.toISOString().slice(0, 10); }

function getMondayOf(weekParam) {
  const d = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
    ? new Date(weekParam + 'T12:00:00')
    : new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

function decorateShift(s, userId) {
  return {
    ...s,
    timeRange:   fmtTimeRange(s.start_time, s.end_time),
    typeLabel:   TYPE_LABELS[s.shift_type]  || s.shift_type,
    typeBadge:   TYPE_BADGES[s.shift_type]  || 'secondary',
    statusLabel: STATUS_LABELS[s.status]    || s.status,
    statusBadge: STATUS_BADGES[s.status]    || 'secondary',
    dateLabel:   fmtDate(s.start_time),
    isMyShift:   s.assigned_user_id === userId,
  };
}

const router = express.Router();
router.use(requireAuth);

// ── Weekly calendar ───────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const today      = toDateStr(new Date());
  const weekStart  = getMondayOf(req.query.week);
  const startStr   = toDateStr(weekStart);
  const weekEnd    = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const endStr     = toDateStr(weekEnd);

  const shifts = db.prepare(`
    SELECT s.*, u.name AS assigned_user_name, u.role AS assigned_user_role
    FROM shifts s JOIN users u ON u.id = s.assigned_user_id
    WHERE date(s.start_time) >= ? AND date(s.start_time) < ?
    ORDER BY s.start_time ASC
  `).all(startStr, endStr);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = toDateStr(d);
    return {
      date:      dateStr,
      dayLabel:  d.toLocaleDateString('en-US', { weekday: 'long' }),
      dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isToday:   dateStr === today,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      shifts: shifts
        .filter(s => s.start_time.slice(0, 10) === dateStr)
        .map(s => decorateShift(s, req.user.id)),
    };
  });

  const prevWeek   = new Date(weekStart); prevWeek.setDate(prevWeek.getDate() - 7);
  const nextWeek   = new Date(weekStart); nextWeek.setDate(nextWeek.getDate() + 7);
  const weekLabel  = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  const canManage  = ['residence_director', 'community_coordinator'].includes(req.user.role);

  // Auto-reminders: upcoming shifts within 24 h
  const nowIso  = new Date().toISOString().slice(0, 16);
  const in24    = new Date(); in24.setHours(in24.getHours() + 24);
  const in24Iso = in24.toISOString().slice(0, 16);
  const upcoming = db.prepare(`
    SELECT id, shift_type, start_time FROM shifts
    WHERE assigned_user_id = ? AND start_time > ? AND start_time <= ? AND status = 'scheduled'
  `).all(req.user.id, nowIso, in24Iso);

  for (const us of upcoming) {
    const already = db.prepare(
      `SELECT id FROM notifications WHERE user_id = ? AND message LIKE ? LIMIT 1`
    ).get(req.user.id, `%shift #${us.id}%`);
    if (!already) {
      db.prepare(`INSERT INTO notifications (user_id, message) VALUES (?, ?)`).run(
        req.user.id,
        `Shift reminder: ${TYPE_LABELS[us.shift_type]} shift #${us.id} starts at ${fmtTime(us.start_time)}`
      );
    }
  }

  res.render('schedule/index', {
    title: 'Schedule',
    days,
    weekLabel,
    prevWeek:    toDateStr(prevWeek),
    nextWeek:    toDateStr(nextWeek),
    currentWeek: startStr,
    canManage,
  });
});

// ── New shift form ────────────────────────────────────────────────────────────
router.get('/new', (req, res) => {
  if (!['residence_director', 'community_coordinator'].includes(req.user.role)) {
    return res.redirect('/schedule');
  }
  const staff = db.prepare(`SELECT id, name, role FROM users ORDER BY role, name`).all();
  res.render('schedule/new', { title: 'Add Shift', staff, currentWeek: req.query.week || '' });
});

// ── Create shift ──────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  if (!['residence_director', 'community_coordinator'].includes(req.user.role)) {
    return res.redirect('/schedule');
  }
  const { shift_type, assigned_user_id, start_time, end_time, notes } = req.body;
  if (!shift_type || !SHIFT_TYPES.includes(shift_type) || !assigned_user_id || !start_time || !end_time) {
    return res.redirect('/schedule/new?error=missing_fields');
  }
  const result = db.prepare(`
    INSERT INTO shifts (shift_type, assigned_user_id, start_time, end_time, notes, created_by_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(shift_type, Number(assigned_user_id), start_time, end_time, notes || null, req.user.id);

  db.prepare(`INSERT INTO notifications (user_id, message) VALUES (?, ?)`).run(
    Number(assigned_user_id),
    `New shift scheduled: ${TYPE_LABELS[shift_type]} on ${fmtDate(start_time)}, ${fmtTime(start_time)} – ${fmtTime(end_time)}`
  );
  res.redirect(`/schedule/${result.lastInsertRowid}`);
});

// ── Shift detail ──────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const shift = db.prepare(`
    SELECT s.*, u.name AS assigned_user_name, u.role AS assigned_user_role,
           cb.name AS created_by_name
    FROM shifts s
    JOIN users u ON u.id = s.assigned_user_id
    LEFT JOIN users cb ON cb.id = s.created_by_id
    WHERE s.id = ?
  `).get(req.params.id);
  if (!shift) return res.status(404).send('Shift not found');

  const swaps = db.prepare(`
    SELECT sw.*,
           r.name  AS requester_name,
           w.name  AS swap_with_name,
           res.name AS resolved_by_name
    FROM shift_swaps sw
    JOIN  users r   ON r.id   = sw.requester_id
    LEFT JOIN users w   ON w.id   = sw.swap_with_user_id
    LEFT JOIN users res ON res.id = sw.resolved_by_id
    WHERE sw.shift_id = ?
    ORDER BY sw.created_at DESC
  `).all(shift.id).map(s => ({
    ...s,
    statusBadge: s.status === 'pending' ? 'warning' : s.status === 'approved' ? 'success' : 'secondary',
    statusText:  s.status === 'pending' ? 'text-dark' : '',
  }));

  const canManage     = ['residence_director', 'community_coordinator'].includes(req.user.role);
  const isMyShift     = shift.assigned_user_id === req.user.id;
  const hasPending    = swaps.some(s => s.requester_id === req.user.id && s.status === 'pending');
  const otherStaff    = db.prepare(
    `SELECT id, name, role FROM users WHERE id != ? AND role IN ('student_staff','community_coordinator') ORDER BY name`
  ).all(req.user.id);

  res.render('schedule/show', {
    title: `${TYPE_LABELS[shift.shift_type] || shift.shift_type} Shift`,
    shift: decorateShift(shift, req.user.id),
    swaps,
    canManage,
    isMyShift,
    hasPending,
    canRequestSwap: isMyShift && shift.status === 'scheduled' && !hasPending,
    otherStaff,
    swapRequested:  req.query.swapRequested === '1',
  });
});

// ── Update status (CC/RD) ─────────────────────────────────────────────────────
router.post('/:id/status', (req, res) => {
  if (!['residence_director', 'community_coordinator'].includes(req.user.role)) {
    return res.redirect(`/schedule/${req.params.id}`);
  }
  const { status } = req.body;
  if (!['scheduled', 'completed', 'cancelled'].includes(status)) {
    return res.redirect(`/schedule/${req.params.id}`);
  }
  db.prepare(`UPDATE shifts SET status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(status, req.params.id);
  res.redirect(`/schedule/${req.params.id}`);
});

// ── Request swap ──────────────────────────────────────────────────────────────
router.post('/:id/swap', (req, res) => {
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id);
  if (!shift || shift.assigned_user_id !== req.user.id) {
    return res.redirect(`/schedule/${req.params.id}`);
  }
  const { swap_with_user_id, reason } = req.body;
  db.prepare(`
    INSERT INTO shift_swaps (shift_id, requester_id, swap_with_user_id, reason)
    VALUES (?, ?, ?, ?)
  `).run(shift.id, req.user.id, swap_with_user_id ? Number(swap_with_user_id) : null, reason || null);

  if (swap_with_user_id) {
    db.prepare(`INSERT INTO notifications (user_id, message) VALUES (?, ?)`).run(
      Number(swap_with_user_id),
      `${req.user.name} requested you cover their ${TYPE_LABELS[shift.shift_type]} shift on ${fmtDate(shift.start_time)}`
    );
  }
  const supervisor = db.prepare(
    `SELECT id FROM users WHERE role IN ('community_coordinator','residence_director') AND id != ? LIMIT 1`
  ).get(req.user.id);
  if (supervisor) {
    db.prepare(`INSERT INTO notifications (user_id, message) VALUES (?, ?)`).run(
      supervisor.id,
      `Swap request pending: ${req.user.name}'s ${TYPE_LABELS[shift.shift_type]} on ${fmtDate(shift.start_time)} needs approval`
    );
  }
  res.redirect(`/schedule/${req.params.id}?swapRequested=1`);
});

// ── Approve / deny swap (CC/RD) ───────────────────────────────────────────────
router.post('/swap/:id/respond', (req, res) => {
  if (!['residence_director', 'community_coordinator'].includes(req.user.role)) {
    return res.redirect('/schedule');
  }
  const swap = db.prepare(`
    SELECT sw.*, s.id AS shift_id, s.start_time, s.shift_type
    FROM shift_swaps sw JOIN shifts s ON s.id = sw.shift_id
    WHERE sw.id = ?
  `).get(req.params.id);
  if (!swap) return res.redirect('/schedule');

  const { decision } = req.body;
  if (!['approved', 'denied'].includes(decision)) return res.redirect(`/schedule/${swap.shift_id}`);

  db.prepare(`UPDATE shift_swaps SET status = ?, resolved_by_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(decision, req.user.id, swap.id);

  if (decision === 'approved' && swap.swap_with_user_id) {
    db.prepare(`UPDATE shifts SET assigned_user_id = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(swap.swap_with_user_id, swap.shift_id);
    db.prepare(`INSERT INTO notifications (user_id, message) VALUES (?, ?)`).run(
      swap.requester_id,
      `Your swap request for ${fmtDate(swap.start_time)} was approved by ${req.user.name}`
    );
    db.prepare(`INSERT INTO notifications (user_id, message) VALUES (?, ?)`).run(
      swap.swap_with_user_id,
      `You have been assigned a shift swap: ${TYPE_LABELS[swap.shift_type]} on ${fmtDate(swap.start_time)}`
    );
  } else if (decision === 'denied') {
    db.prepare(`INSERT INTO notifications (user_id, message) VALUES (?, ?)`).run(
      swap.requester_id,
      `Your swap request for ${fmtDate(swap.start_time)} was denied by ${req.user.name}`
    );
  }
  res.redirect(`/schedule/${swap.shift_id}`);
});

module.exports = router;
