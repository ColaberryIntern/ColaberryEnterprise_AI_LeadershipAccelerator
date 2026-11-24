'use strict';
const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const DIMS = [
  { key: 'communication_rating',         label: 'Communication' },
  { key: 'resident_engagement_rating',   label: 'Resident Engagement' },
  { key: 'program_planning_rating',      label: 'Program Planning' },
  { key: 'crisis_response_rating',       label: 'Crisis Response' },
  { key: 'documentation_rating',         label: 'Documentation & Reporting' },
];

const CURRENT_PERIOD = 'Spring 2026';

function ratingBadge(v) {
  return { 5: 'success', 4: 'primary', 3: 'warning', 2: 'danger', 1: 'danger' }[v] || 'secondary';
}
function ratingTextClass(v) {
  return { 5: '', 4: '', 3: 'text-dark', 2: '', 1: '' }[v] || '';
}
function ratingLabel(v) {
  return {
    5: 'Excellent', 4: 'Good', 3: 'Satisfactory', 2: 'Needs Work', 1: 'Unsatisfactory',
  }[v] || '—';
}

function decorateEval(e) {
  if (!e) return null;
  const dimRows = DIMS.map(d => ({
    label: d.label,
    key: d.key,
    value: e[d.key],
    badge: ratingBadge(e[d.key]),
    textClass: ratingTextClass(e[d.key]),
    ratingLabel: ratingLabel(e[d.key]),
    pct: e[d.key] ? Math.round((e[d.key] / 5) * 100) : 0,
  }));
  const rated = dimRows.filter(r => r.value != null);
  const avg   = rated.length
    ? (rated.reduce((s, r) => s + r.value, 0) / rated.length).toFixed(1)
    : null;
  const avgBadge = avg ? ratingBadge(Math.round(Number(avg))) : 'secondary';
  const typeLabel = e.eval_type === 'self' ? 'Self-Evaluation' : 'Supervisor Evaluation';
  return { ...e, dimRows, avg, avgBadge, typeLabel };
}

const router = express.Router();
router.use(requireAuth);

// ── List ──────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const canManage = ['residence_director', 'community_coordinator'].includes(req.user.role);

  const query = canManage
    ? `SELECT e.*, evaluatee.name AS evaluatee_name, evaluatee.role AS evaluatee_role,
              evaluatee.building AS evaluatee_building, evaluator.name AS evaluator_name
       FROM evaluations e
       JOIN users evaluatee ON evaluatee.id = e.evaluatee_id
       JOIN users evaluator ON evaluator.id = e.evaluator_id
       WHERE evaluatee.role = 'student_staff'
       ORDER BY evaluatee.name, e.period DESC, e.eval_type`
    : `SELECT e.*, evaluatee.name AS evaluatee_name, evaluatee.role AS evaluatee_role,
              evaluatee.building AS evaluatee_building, evaluator.name AS evaluator_name
       FROM evaluations e
       JOIN users evaluatee ON evaluatee.id = e.evaluatee_id
       JOIN users evaluator ON evaluator.id = e.evaluator_id
       WHERE e.evaluatee_id = ?
       ORDER BY e.period DESC, e.eval_type`;

  const rows = canManage
    ? db.prepare(query).all()
    : db.prepare(query).all(req.user.id);

  // Group by evaluatee + period
  const groupMap = new Map();
  for (const r of rows) {
    const key = `${r.evaluatee_id}|${r.period}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        evaluatee_id:       r.evaluatee_id,
        evaluatee_name:     r.evaluatee_name,
        evaluatee_building: r.evaluatee_building,
        period:             r.period,
        self:       null,
        supervisor: null,
      });
    }
    const g = groupMap.get(key);
    if (r.eval_type === 'self') g.self       = decorateEval(r);
    else                        g.supervisor = decorateEval(r);
  }

  const groups = [...groupMap.values()].map(g => ({
    ...g,
    hasBoth:        !!(g.self && g.supervisor),
    selfOnly:       !!(g.self && !g.supervisor),
    supervisorOnly: !!(!g.self && g.supervisor),
    compareUrl: `/evaluations/compare/${g.evaluatee_id}?period=${encodeURIComponent(g.period)}`,
  }));

  const pendingReviewCount = canManage
    ? groups.filter(g => g.selfOnly).length
    : 0;

  const staffList = canManage
    ? db.prepare(`SELECT id, name, building FROM users WHERE role = 'student_staff' ORDER BY name`).all()
    : [];

  res.render('evaluations/index', {
    title: 'Performance Evaluations',
    groups,
    canManage,
    pendingReviewCount,
    staffList,
    currentPeriod: CURRENT_PERIOD,
  });
});

// ── Compare — MUST be before /:id ─────────────────────────────────────────────
router.get('/compare/:staffId', (req, res) => {
  const canManage = ['residence_director', 'community_coordinator'].includes(req.user.role);
  const staffId   = Number(req.params.staffId);

  if (!canManage && req.user.id !== staffId) return res.redirect('/evaluations');

  const staff = db.prepare('SELECT id, name, building, role FROM users WHERE id = ?').get(staffId);
  if (!staff || staff.role !== 'student_staff') return res.status(404).send('Staff member not found');

  const periods = db.prepare(
    'SELECT DISTINCT period FROM evaluations WHERE evaluatee_id = ? ORDER BY period DESC'
  ).all(staffId).map(r => r.period);

  const period = req.query.period || periods[0] || null;

  const evalQ = `
    SELECT e.*, evaluator.name AS evaluator_name
    FROM evaluations e
    JOIN users evaluator ON evaluator.id = e.evaluator_id
    WHERE e.evaluatee_id = ? AND e.period = ? AND e.eval_type = ?
  `;
  const selfEval       = period ? decorateEval(db.prepare(evalQ).get(staffId, period, 'self')) : null;
  const supervisorEval = period ? decorateEval(db.prepare(evalQ).get(staffId, period, 'supervisor')) : null;

  const compareRows = (selfEval || supervisorEval)
    ? DIMS.map(d => {
        const sv = selfEval       ? selfEval[d.key]       : null;
        const su = supervisorEval ? supervisorEval[d.key] : null;
        const delta = sv != null && su != null ? su - sv : null;
        return {
          label:      d.label,
          selfVal:    sv,
          supVal:     su,
          selfBadge:  sv != null ? ratingBadge(sv) : 'light',
          supBadge:   su != null ? ratingBadge(su) : 'light',
          selfLabel:  sv != null ? ratingLabel(sv) : '—',
          supLabel:   su != null ? ratingLabel(su) : '—',
          selfPct:    sv != null ? Math.round((sv / 5) * 100) : 0,
          supPct:     su != null ? Math.round((su / 5) * 100) : 0,
          delta,
          deltaLabel: delta == null ? '' : delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : '=',
          deltaClass: delta == null ? 'text-muted'
            : delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-muted',
        };
      })
    : [];

  res.render('evaluations/compare', {
    title: `${staff.name} — Evaluation Comparison`,
    staff,
    period,
    periods,
    selfEval,
    supervisorEval,
    compareRows,
    canManage,
  });
});

// ── New form ──────────────────────────────────────────────────────────────────
router.get('/new', (req, res) => {
  const canManage = ['residence_director', 'community_coordinator'].includes(req.user.role);
  const evalType  = req.query.type === 'supervisor' && canManage ? 'supervisor' : 'self';
  const targetId  = req.query.evaluatee_id ? Number(req.query.evaluatee_id) : null;

  let evaluatee = null;
  if (evalType === 'supervisor' && targetId) {
    evaluatee = db.prepare(`SELECT id, name, building FROM users WHERE id = ? AND role = 'student_staff'`).get(targetId);
  } else if (evalType === 'self') {
    evaluatee = db.prepare('SELECT id, name, building FROM users WHERE id = ?').get(req.user.id);
  }

  const staffList = canManage
    ? db.prepare(`SELECT id, name, building FROM users WHERE role = 'student_staff' ORDER BY name`).all()
    : [];

  res.render('evaluations/new', {
    title: 'New Evaluation',
    evalType,
    isSelf:       evalType === 'self',
    isSupervisor: evalType === 'supervisor',
    evaluatee,
    targetId,
    canManage,
    staffList,
    currentPeriod: CURRENT_PERIOD,
    prefill: req.query,
  });
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const canManage = ['residence_director', 'community_coordinator'].includes(req.user.role);
  const {
    eval_type, evaluatee_id, period,
    communication_rating, resident_engagement_rating,
    program_planning_rating, crisis_response_rating, documentation_rating,
    strengths, growth_areas, goals_next_semester, supervisor_notes, action,
  } = req.body;

  const resolvedType     = eval_type === 'supervisor' && canManage ? 'supervisor' : 'self';
  const resolvedEvaluatee = resolvedType === 'self'
    ? req.user.id
    : (evaluatee_id ? Number(evaluatee_id) : null);

  if (!resolvedEvaluatee || !period) return res.redirect('/evaluations/new?error=missing');

  const status = action === 'submit' ? 'submitted' : 'draft';

  const result = db.prepare(`
    INSERT INTO evaluations
      (evaluatee_id, evaluator_id, eval_type, period,
       communication_rating, resident_engagement_rating,
       program_planning_rating, crisis_response_rating, documentation_rating,
       strengths, growth_areas, goals_next_semester, supervisor_notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    resolvedEvaluatee, req.user.id, resolvedType, period,
    communication_rating  ? Number(communication_rating)  : null,
    resident_engagement_rating ? Number(resident_engagement_rating) : null,
    program_planning_rating    ? Number(program_planning_rating)    : null,
    crisis_response_rating     ? Number(crisis_response_rating)     : null,
    documentation_rating       ? Number(documentation_rating)       : null,
    strengths || null, growth_areas || null, goals_next_semester || null,
    supervisor_notes || null,
    status,
  );

  if (resolvedType === 'supervisor' && status === 'submitted') {
    db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
      resolvedEvaluatee,
      `Your ${period} supervisor evaluation has been submitted by ${req.user.name}`
    );
  }
  if (resolvedType === 'self' && status === 'submitted') {
    const rd = db.prepare(`SELECT id FROM users WHERE role = 'residence_director' LIMIT 1`).get();
    if (rd) {
      db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
        rd.id,
        `${req.user.name} submitted their ${period} self-evaluation`
      );
    }
  }

  res.redirect(`/evaluations/${result.lastInsertRowid}?submitted=1`);
});

// ── Detail ────────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT e.*,
      evaluatee.name AS evaluatee_name, evaluatee.role AS evaluatee_role,
      evaluatee.building AS evaluatee_building,
      evaluator.name AS evaluator_name
    FROM evaluations e
    JOIN users evaluatee ON evaluatee.id = e.evaluatee_id
    JOIN users evaluator ON evaluator.id = e.evaluator_id
    WHERE e.id = ?
  `).get(req.params.id);

  if (!row) return res.status(404).send('Evaluation not found');

  const canManage = ['residence_director', 'community_coordinator'].includes(req.user.role);
  const isRelated = row.evaluatee_id === req.user.id || row.evaluator_id === req.user.id;
  if (!canManage && !isRelated) return res.redirect('/evaluations');

  const compareUrl = `/evaluations/compare/${row.evaluatee_id}?period=${encodeURIComponent(row.period)}`;

  res.render('evaluations/show', {
    title: `${row.evaluatee_name} — ${row.eval_type === 'self' ? 'Self' : 'Supervisor'} Evaluation`,
    eval: decorateEval(row),
    canManage,
    submitted: req.query.submitted === '1',
    compareUrl,
  });
});

module.exports = router;
