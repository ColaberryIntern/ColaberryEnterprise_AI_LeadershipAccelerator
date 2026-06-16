'use strict';
const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const STATUS_LABELS  = { draft: 'Draft', pending: 'Pending Review', approved: 'Approved', rejected: 'Rejected' };
const STATUS_BADGES  = { draft: 'secondary', pending: 'warning', approved: 'success', rejected: 'danger' };
const STATUS_TEXT    = { pending: 'text-dark', draft: 'text-dark' };

const CAT_LABELS = {
  community_building:  'Community Building',
  academic_success:    'Academic Success',
  wellness:            'Wellness',
  diversity_inclusion: 'Diversity & Inclusion',
  leadership:          'Leadership',
};
const CAT_BADGES = {
  community_building:  'primary',
  academic_success:    'info',
  wellness:            'success',
  diversity_inclusion: 'warning',
  leadership:          'danger',
};

function decorateProposal(p) {
  return {
    ...p,
    statusLabel: STATUS_LABELS[p.status] || p.status,
    statusBadge: STATUS_BADGES[p.status] || 'secondary',
    statusText:  STATUS_TEXT[p.status]   || '',
    catLabel:    CAT_LABELS[p.outcome_category]  || '',
    catBadge:    CAT_BADGES[p.outcome_category]  || 'secondary',
    budgetFmt:   p.budget_estimate != null
      ? `$${Number(p.budget_estimate).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
      : null,
  };
}

const router = express.Router();
router.use(requireAuth);

// ── List ──────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { status } = req.query;
  const canManage = ['residence_director', 'community_coordinator'].includes(req.user.role);

  let query = `
    SELECT p.*,
           u.name  AS submitter_name,  u.role  AS submitter_role,
           r.name  AS reviewer_name,
           o.code  AS outcome_code, o.title AS outcome_title,
           o.category AS outcome_category
    FROM program_proposals p
    JOIN  users u ON u.id = p.submitter_id
    LEFT JOIN users r ON r.id = p.reviewed_by_id
    LEFT JOIN curriculum_outcomes o ON o.id = p.outcome_id
  `;
  const params = [];
  if (status && ['draft','pending','approved','rejected'].includes(status)) {
    query += ' WHERE p.status = ?';
    params.push(status);
  } else if (!canManage) {
    // student staff sees only their own
    query += ' WHERE p.submitter_id = ?';
    params.push(req.user.id);
  }
  query += ' ORDER BY p.created_at DESC';

  const proposals = db.prepare(query).all(...params).map(decorateProposal);
  const outcomes  = db.prepare('SELECT * FROM curriculum_outcomes ORDER BY code').all();

  const counts = db.prepare(`
    SELECT status, COUNT(*) AS n FROM program_proposals GROUP BY status
  `).all().reduce((acc, r) => { acc[r.status] = r.n; return acc; }, {});

  res.render('proposals/index', {
    title: 'Program Proposals',
    proposals,
    outcomes,
    canManage,
    filterStatus: status || '',
    counts,
    pendingCount: counts.pending || 0,
  });
});

// ── New form ──────────────────────────────────────────────────────────────────
router.get('/new', (req, res) => {
  const outcomes = db.prepare('SELECT * FROM curriculum_outcomes ORDER BY category, code').all()
    .map(o => ({ ...o, catLabel: CAT_LABELS[o.category] || o.category }));
  res.render('proposals/new', {
    title: 'Submit Program Proposal',
    outcomes,
    prefill: req.query,
  });
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { title, description, target_audience, proposed_date,
          budget_estimate, expected_outcomes, outcome_id, action } = req.body;

  if (!title || !description || !target_audience || !expected_outcomes) {
    return res.redirect('/proposals/new?error=missing_fields');
  }

  const status = action === 'draft' ? 'draft' : 'pending';
  const result = db.prepare(`
    INSERT INTO program_proposals
      (title, description, target_audience, proposed_date, budget_estimate,
       expected_outcomes, outcome_id, submitter_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title.trim(), description.trim(), target_audience.trim(),
    proposed_date || null,
    budget_estimate ? Number(budget_estimate) : null,
    expected_outcomes.trim(),
    outcome_id ? Number(outcome_id) : null,
    req.user.id,
    status,
  );

  if (status === 'pending') {
    const rd = db.prepare(`SELECT id FROM users WHERE role = 'residence_director' LIMIT 1`).get();
    if (rd) {
      db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
        rd.id,
        `New program proposal: "${title.trim()}" submitted by ${req.user.name} — awaiting your review`
      );
    }
  }

  res.redirect(`/proposals/${result.lastInsertRowid}?submitted=1`);
});

// ── Detail ────────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const proposal = db.prepare(`
    SELECT p.*,
           u.name  AS submitter_name,  u.role  AS submitter_role,
           r.name  AS reviewer_name,
           o.code  AS outcome_code, o.title AS outcome_title,
           o.category AS outcome_category, o.description AS outcome_desc
    FROM program_proposals p
    JOIN  users u ON u.id = p.submitter_id
    LEFT JOIN users r ON r.id = p.reviewed_by_id
    LEFT JOIN curriculum_outcomes o ON o.id = p.outcome_id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!proposal) return res.status(404).send('Proposal not found');

  const canManage  = ['residence_director', 'community_coordinator'].includes(req.user.role);
  const canReview  = req.user.role === 'residence_director' && proposal.status === 'pending';
  const isOwn      = proposal.submitter_id === req.user.id;

  res.render('proposals/show', {
    title: proposal.title,
    proposal: decorateProposal(proposal),
    canManage,
    canReview,
    isOwn,
    submitted:  req.query.submitted === '1',
    reviewed:   req.query.reviewed  === '1',
  });
});

// ── Review (RD approve / reject) ──────────────────────────────────────────────
router.post('/:id/review', (req, res) => {
  if (req.user.role !== 'residence_director') return res.redirect(`/proposals/${req.params.id}`);

  const { decision, review_notes } = req.body;
  if (!['approved', 'rejected'].includes(decision)) return res.redirect(`/proposals/${req.params.id}`);

  const proposal = db.prepare('SELECT * FROM program_proposals WHERE id = ?').get(req.params.id);
  if (!proposal) return res.status(404).send('Proposal not found');

  db.prepare(`
    UPDATE program_proposals
    SET status = ?, reviewed_by_id = ?, review_notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(decision, req.user.id, review_notes || null, req.params.id);

  const p = db.prepare('SELECT title, submitter_id FROM program_proposals WHERE id = ?').get(req.params.id);
  if (p) {
    const verb = decision === 'approved' ? 'approved' : 'rejected';
    db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
      p.submitter_id,
      `Your proposal "${p.title}" was ${verb} by ${req.user.name}${review_notes ? ` — "${review_notes}"` : ''}`
    );
  }

  res.redirect(`/proposals/${req.params.id}?reviewed=1`);
});

module.exports = router;
