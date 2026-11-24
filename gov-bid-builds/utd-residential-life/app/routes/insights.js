'use strict';
const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const TYPE_LABELS = {
  noise_complaint: 'Noise Complaint', lockout: 'Lockout',
  on_call_log: 'On-Call Log', roommate_agreement: 'Roommate Agreement', evaluation: 'Evaluation',
};
const STATUS_BADGES = { open: 'bg-secondary', in_progress: 'bg-primary', escalated: 'bg-danger', resolved: 'bg-success' };
const STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', escalated: 'Escalated', resolved: 'Resolved' };

const CATEGORY_COLORS = {
  community_building: '#0d6efd',
  academic_success:   '#198754',
  wellness:           '#ffc107',
  diversity_inclusion:'#dc3545',
  leadership:         '#0dcaf0',
};

// ── Macro: all-buildings overview ─────────────────────────────────────────────
router.get('/', (req, res) => {
  const user = req.user;

  // Incidents aggregated by building
  const byBuilding = db.prepare(`
    SELECT building,
      COUNT(*) AS total,
      SUM(CASE WHEN form_type = 'noise_complaint' THEN 1 ELSE 0 END) AS noise,
      SUM(CASE WHEN form_type = 'lockout'         THEN 1 ELSE 0 END) AS lockout,
      SUM(CASE WHEN status    = 'escalated'       THEN 1 ELSE 0 END) AS escalated
    FROM incident_reports
    WHERE building IS NOT NULL
    GROUP BY building ORDER BY total DESC
  `).all().map(b => ({
    ...b,
    other: Math.max(0, b.total - (b.noise || 0) - (b.lockout || 0)),
  }));

  // Residents per building
  const residentMap = {};
  for (const r of db.prepare('SELECT building, COUNT(*) AS c FROM residents GROUP BY building').all()) {
    residentMap[r.building] = r.c;
  }
  for (const b of byBuilding) b.residentCount = residentMap[b.building] || 0;

  // Programs by curriculum category
  const byCategory = db.prepare(`
    SELECT co.category, co.title AS categoryTitle, COUNT(*) AS total
    FROM program_proposals pp
    JOIN curriculum_outcomes co ON co.id = pp.outcome_id
    WHERE pp.status = 'approved'
    GROUP BY co.id ORDER BY total DESC
  `).all();

  // Staff notes by author (RA conversations)
  const notesByAuthor = db.prepare(`
    SELECT u.name, u.role, u.building, COUNT(*) AS total,
      SUM(sn.is_private) AS privateCount
    FROM staff_notes sn JOIN users u ON u.id = sn.author_id
    GROUP BY sn.author_id ORDER BY total DESC
  `).all();

  // KPI summary stats
  const stats = {
    totalResidents:  db.prepare('SELECT COUNT(*) AS c FROM residents').get().c,
    openIncidents:   db.prepare("SELECT COUNT(*) AS c FROM incident_reports WHERE status IN ('open','in_progress','escalated')").get().c,
    totalIncidents:  db.prepare('SELECT COUNT(*) AS c FROM incident_reports WHERE building IS NOT NULL').get().c,
    approvedPrograms:db.prepare("SELECT COUNT(*) AS c FROM program_proposals WHERE status='approved'").get().c,
    totalNotes:      db.prepare('SELECT COUNT(*) AS c FROM staff_notes').get().c,
    activeSurveys:   db.prepare("SELECT COUNT(*) AS c FROM surveys WHERE status='active'").get().c,
  };

  // Recent 6 incidents
  const recentIncidents = db.prepare(`
    SELECT ir.*, u.name AS reporter_name
    FROM incident_reports ir LEFT JOIN users u ON u.id = ir.reporter_id
    WHERE ir.building IS NOT NULL
    ORDER BY ir.created_at DESC LIMIT 6
  `).all().map(i => ({
    ...i,
    typeLabel:     TYPE_LABELS[i.form_type] || i.form_type,
    statusBadge:   STATUS_BADGES[i.status] || 'bg-secondary',
    statusLabel:   STATUS_LABELS[i.status] || i.status,
    formattedDate: new Date(i.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' }),
  }));

  // Chart.js data (pre-serialised to avoid Handlebars escaping issues)
  const chartBuildingLabels = JSON.stringify(byBuilding.map(b => b.building));
  const chartNoiseData      = JSON.stringify(byBuilding.map(b => b.noise   || 0));
  const chartLockoutData    = JSON.stringify(byBuilding.map(b => b.lockout || 0));
  const chartOtherData      = JSON.stringify(byBuilding.map(b => b.other   || 0));
  const chartCategoryLabels = JSON.stringify(byCategory.map(b => b.categoryTitle));
  const chartCategoryData   = JSON.stringify(byCategory.map(b => b.total));
  const chartCategoryColors = JSON.stringify(byCategory.map(b => CATEGORY_COLORS[b.category] || '#adb5bd'));

  res.render('insights/macro', {
    title: 'Insight Dashboard',
    user,
    byBuilding,
    byCategory,
    notesByAuthor,
    stats,
    recentIncidents,
    chartBuildingLabels, chartNoiseData, chartLockoutData, chartOtherData,
    chartCategoryLabels, chartCategoryData, chartCategoryColors,
  });
});

// ── Hall drill-down ───────────────────────────────────────────────────────────
router.get('/hall/:building', (req, res) => {
  const building = req.params.building;
  const user = req.user;

  // Incidents per floor
  const byFloor = db.prepare(`
    SELECT
      CAST(SUBSTR(room_number, 1, 1) AS INTEGER) AS floor,
      COUNT(*) AS total,
      SUM(CASE WHEN form_type = 'noise_complaint' THEN 1 ELSE 0 END) AS noise,
      SUM(CASE WHEN form_type = 'lockout'         THEN 1 ELSE 0 END) AS lockout,
      SUM(CASE WHEN status    = 'escalated'       THEN 1 ELSE 0 END) AS escalated
    FROM incident_reports
    WHERE building = ? AND room_number IS NOT NULL AND room_number != ''
    GROUP BY floor ORDER BY floor
  `).all(building);

  // Residents per floor
  const residentsByFloor = db.prepare(`
    SELECT CAST(SUBSTR(room, 1, 1) AS INTEGER) AS floor, COUNT(*) AS count
    FROM residents WHERE building = ?
    GROUP BY floor ORDER BY floor
  `).all(building);

  // Build merged floor map
  const floorMap = {};
  for (const f of byFloor)          floorMap[f.floor] = { ...f, residentCount: 0 };
  for (const f of residentsByFloor) {
    if (!floorMap[f.floor]) floorMap[f.floor] = { floor: f.floor, total: 0, noise: 0, lockout: 0, escalated: 0 };
    floorMap[f.floor].residentCount = f.count;
  }
  const floors = Object.values(floorMap).sort((a, b) => a.floor - b.floor);

  // Approved programs for this building
  const programs = db.prepare(`
    SELECT pp.*, co.title AS categoryTitle, u.name AS submitter_name
    FROM program_proposals pp
    LEFT JOIN curriculum_outcomes co ON co.id = pp.outcome_id
    LEFT JOIN users u ON u.id = pp.submitter_id
    WHERE pp.status = 'approved'
      AND (pp.target_audience LIKE '%' || ? || '%' OR pp.target_audience LIKE '%all%')
    ORDER BY pp.proposed_date
  `).all(building);

  // Staff assigned here
  const staff = db.prepare(
    "SELECT * FROM users WHERE building = ? AND role != 'residence_director' ORDER BY role, name"
  ).all(building);

  // KPIs for this hall
  const hallStats = {
    residents:  db.prepare('SELECT COUNT(*) AS c FROM residents WHERE building = ?').get(building).c,
    incidents:  db.prepare('SELECT COUNT(*) AS c FROM incident_reports WHERE building = ?').get(building).c,
    open:       db.prepare("SELECT COUNT(*) AS c FROM incident_reports WHERE building = ? AND status IN ('open','in_progress','escalated')").get(building).c,
    notes:      db.prepare('SELECT COUNT(*) AS c FROM staff_notes sn JOIN residents r ON r.id = sn.resident_id WHERE r.building = ?').get(building).c,
  };

  const chartFloorLabels = JSON.stringify(floors.map(f => `Floor ${f.floor}`));
  const chartFloorTotal  = JSON.stringify(floors.map(f => f.total || 0));
  const chartFloorNoise  = JSON.stringify(floors.map(f => f.noise  || 0));
  const chartFloorLockout= JSON.stringify(floors.map(f => f.lockout|| 0));

  res.render('insights/hall', {
    title: `${building} — Insights`,
    user, building, floors, programs, staff, hallStats,
    chartFloorLabels, chartFloorTotal, chartFloorNoise, chartFloorLockout,
  });
});

// ── Floor drill-down ──────────────────────────────────────────────────────────
router.get('/hall/:building/floor/:floor', (req, res) => {
  const { building } = req.params;
  const floor = parseInt(req.params.floor);
  const user = req.user;

  const residents = db.prepare(`
    SELECT * FROM residents
    WHERE building = ? AND CAST(SUBSTR(room, 1, 1) AS INTEGER) = ?
    ORDER BY room, name
  `).all(building, floor);

  const incidents = db.prepare(`
    SELECT ir.*, u.name AS reporter_name
    FROM incident_reports ir LEFT JOIN users u ON u.id = ir.reporter_id
    WHERE ir.building = ? AND ir.room_number IS NOT NULL
      AND CAST(SUBSTR(ir.room_number, 1, 1) AS INTEGER) = ?
    ORDER BY ir.created_at DESC
  `).all(building, floor).map(i => ({
    ...i,
    typeLabel:     TYPE_LABELS[i.form_type] || i.form_type,
    statusBadge:   STATUS_BADGES[i.status] || 'bg-secondary',
    statusLabel:   STATUS_LABELS[i.status] || i.status,
    formattedDate: new Date(i.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
  }));

  res.render('insights/floor', {
    title: `${building} — Floor ${floor}`,
    user, building, floor, residents, incidents,
  });
});

module.exports = router;
