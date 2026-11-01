'use strict';
const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const HALLS = ['Andrews Hall', 'Berkner Hall', 'Caruth Hall', 'Hillhouse'];

const CHANNEL_LABELS = { inapp: 'In-App', email: 'Email', sms: 'SMS' };
const CHANNEL_ICONS  = { inapp: 'bi-bell-fill', email: 'bi-envelope-fill', sms: 'bi-phone-fill' };
const CHANNEL_BADGES = { inapp: 'bg-info text-dark', email: 'bg-primary', sms: 'bg-success' };

const SURVEY_STATUS_BADGE  = { draft: 'bg-secondary', active: 'bg-success', closed: 'bg-dark' };
const SURVEY_STATUS_LABEL  = { draft: 'Draft', active: 'Active', closed: 'Closed' };

function resolveAudienceLabel(type, value) {
  if (type === 'all_staff') return 'All Staff';
  if (type === 'hall') return value || 'Unknown Hall';
  if (type === 'individual') {
    const u = db.prepare('SELECT name FROM users WHERE id = ?').get(value);
    return u ? u.name : `User #${value}`;
  }
  return type;
}

function decorateBroadcast(b) {
  return {
    ...b,
    channelLabel: CHANNEL_LABELS[b.channel] || b.channel,
    channelIcon:  CHANNEL_ICONS[b.channel]  || 'bi-megaphone',
    channelBadge: CHANNEL_BADGES[b.channel] || 'bg-secondary',
    audienceLabel: resolveAudienceLabel(b.audience_type, b.audience_value),
    formattedDate: b.created_at
      ? new Date(b.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : '—',
  };
}

function decorateSurvey(s) {
  const questions = JSON.parse(s.questions_json || '[]');
  return {
    ...s,
    questions,
    questionCount: questions.length,
    statusBadge: SURVEY_STATUS_BADGE[s.status] || 'bg-secondary',
    statusLabel: SURVEY_STATUS_LABEL[s.status] || s.status,
    audienceLabel: resolveAudienceLabel(s.audience_type, s.audience_value),
    formattedDate: s.created_at
      ? new Date(s.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : '—',
  };
}

// ── Hub ───────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const user = req.user;
  const canManage = user.role === 'community_coordinator' || user.role === 'residence_director';

  const broadcasts = db.prepare(`
    SELECT b.*, u.name AS sender_name
    FROM broadcasts b JOIN users u ON u.id = b.sender_id
    ORDER BY b.created_at DESC LIMIT 20
  `).all().map(decorateBroadcast);

  const surveys = db.prepare(`
    SELECT s.*, u.name AS creator_name
    FROM surveys s JOIN users u ON u.id = s.creator_id
    ORDER BY s.created_at DESC
  `).all().map(decorateSurvey);

  // Tag active surveys with hasResponded for the current user
  for (const s of surveys) {
    if (s.status === 'active') {
      const resp = db.prepare(
        'SELECT id FROM survey_responses WHERE survey_id = ? AND respondent_id = ?'
      ).get(s.id, user.id);
      s.hasResponded = !!resp;
    }
  }

  const pendingActiveSurveys = surveys.filter(s => s.status === 'active' && !s.hasResponded);

  res.render('communications/index', {
    title: 'Communications Hub',
    user,
    canManage,
    broadcasts,
    surveys,
    pendingCount: pendingActiveSurveys.length,
    allUsers: db.prepare('SELECT id, name, building FROM users ORDER BY name').all(),
    halls: HALLS,
  });
});

// ── New broadcast form ────────────────────────────────────────────────────────
router.get('/new', (req, res) => {
  const user = req.user;
  const canManage = user.role === 'community_coordinator' || user.role === 'residence_director';
  if (!canManage) return res.redirect('/communications');

  res.render('communications/new', {
    title: 'New Broadcast',
    user,
    canManage,
    allUsers: db.prepare('SELECT id, name, building FROM users ORDER BY name').all(),
    halls: HALLS,
  });
});

// ── Create broadcast ──────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const user = req.user;
  const canManage = user.role === 'community_coordinator' || user.role === 'residence_director';
  if (!canManage) return res.redirect('/communications');

  const { subject, body, channel, audience_type, audience_value } = req.body;

  db.prepare(`
    INSERT INTO broadcasts (sender_id, subject, body, channel, audience_type, audience_value)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(user.id, subject, body, channel, audience_type, audience_value || null);

  // Push in-app notifications to recipients
  if (channel === 'inapp') {
    let uids = [];
    if (audience_type === 'all_staff') {
      uids = db.prepare('SELECT id FROM users').all().map(u => u.id);
    } else if (audience_type === 'hall') {
      uids = db.prepare('SELECT id FROM users WHERE building = ?').all(audience_value).map(u => u.id);
    } else if (audience_type === 'individual') {
      uids = [parseInt(audience_value)];
    }
    const insertNotif = db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)');
    for (const uid of uids) {
      if (uid !== user.id) insertNotif.run(uid, `${subject} — from ${user.name}`);
    }
  }

  res.redirect('/communications');
});

// ── New survey form ───────────────────────────────────────────────────────────
router.get('/surveys/new', (req, res) => {
  const user = req.user;
  const canManage = user.role === 'community_coordinator' || user.role === 'residence_director';
  if (!canManage) return res.redirect('/communications');

  res.render('communications/surveys/new', {
    title: 'Create Survey',
    user,
    canManage,
    allUsers: db.prepare('SELECT id, name, building FROM users ORDER BY name').all(),
    halls: HALLS,
  });
});

// ── Create survey ─────────────────────────────────────────────────────────────
router.post('/surveys', (req, res) => {
  const user = req.user;
  const canManage = user.role === 'community_coordinator' || user.role === 'residence_director';
  if (!canManage) return res.redirect('/communications');

  const { title, description, audience_type, audience_value, action } = req.body;
  const texts = [].concat(req.body['question_text[]'] || []);
  const types = [].concat(req.body['question_type[]'] || []);
  const questions = texts
    .map((t, i) => ({ text: t.trim(), type: types[i] || 'text' }))
    .filter(q => q.text);

  const status = action === 'activate' ? 'active' : 'draft';

  db.prepare(`
    INSERT INTO surveys (creator_id, title, description, audience_type, audience_value, questions_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.id, title, description || null,
    audience_type, audience_value || null,
    JSON.stringify(questions), status
  );

  res.redirect('/communications');
});

// ── Survey detail (+ inline respond form) ────────────────────────────────────
router.get('/surveys/:id', (req, res) => {
  const user = req.user;
  const canManage = user.role === 'community_coordinator' || user.role === 'residence_director';

  const survey = db.prepare(`
    SELECT s.*, u.name AS creator_name
    FROM surveys s JOIN users u ON u.id = s.creator_id
    WHERE s.id = ?
  `).get(req.params.id);
  if (!survey) return res.redirect('/communications');

  const decorated = decorateSurvey(survey);

  const myResponse = db.prepare(
    'SELECT * FROM survey_responses WHERE survey_id = ? AND respondent_id = ?'
  ).get(survey.id, user.id);
  const myAnswers = myResponse ? JSON.parse(myResponse.answers_json || '{}') : null;

  const responses = db.prepare(`
    SELECT sr.*, u.name AS respondent_name
    FROM survey_responses sr JOIN users u ON u.id = sr.respondent_id
    WHERE sr.survey_id = ?
    ORDER BY sr.submitted_at DESC
  `).all(survey.id).map(r => ({
    ...r,
    answers: JSON.parse(r.answers_json || '{}'),
    formattedDate: r.submitted_at
      ? new Date(r.submitted_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : '—',
  }));

  // Build per-question aggregate stats
  const stats = decorated.questions.map((q, i) => {
    const key = `q${i}`;
    const vals = responses.map(r => r.answers[key]).filter(v => v != null && v !== '');
    if (q.type === 'rating') {
      const nums = vals.map(Number).filter(n => !isNaN(n));
      const avg = nums.length
        ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1)
        : null;
      const dist = [1, 2, 3, 4, 5].map(v => ({ value: v, count: nums.filter(n => n === v).length }));
      return { ...q, key, avg, dist, answerCount: nums.length };
    }
    if (q.type === 'yesno') {
      const yes = vals.filter(v => v === 'yes').length;
      const no  = vals.filter(v => v === 'no').length;
      const yesPct = vals.length ? Math.round(yes / vals.length * 100) : 0;
      return { ...q, key, yes, no, yesPct, answerCount: vals.length };
    }
    return { ...q, key, textAnswers: vals, answerCount: vals.length };
  });

  res.render('communications/surveys/show', {
    title: survey.title,
    user,
    canManage,
    survey: decorated,
    myResponse: myResponse || null,
    myAnswers,
    responses,
    stats,
    canEditStatus: canManage,
    responseCount: responses.length,
  });
});

// ── Submit survey response ────────────────────────────────────────────────────
router.post('/surveys/:id/respond', (req, res) => {
  const user = req.user;
  const survey = db.prepare('SELECT * FROM surveys WHERE id = ?').get(req.params.id);
  if (!survey || survey.status !== 'active') return res.redirect('/communications');

  const questions = JSON.parse(survey.questions_json || '[]');
  const answers = {};
  questions.forEach((_, i) => {
    const val = req.body[`q${i}`];
    if (val != null) answers[`q${i}`] = val;
  });

  try {
    db.prepare(`
      INSERT INTO survey_responses (survey_id, respondent_id, answers_json)
      VALUES (?, ?, ?)
    `).run(survey.id, user.id, JSON.stringify(answers));
  } catch (_) { /* UNIQUE — already responded */ }

  res.redirect(`/communications/surveys/${req.params.id}?flash=responded`);
});

// ── Update survey status ──────────────────────────────────────────────────────
router.post('/surveys/:id/status', (req, res) => {
  const user = req.user;
  const canManage = user.role === 'community_coordinator' || user.role === 'residence_director';
  if (!canManage) return res.redirect(`/communications/surveys/${req.params.id}`);

  const { status } = req.body;
  if (!['draft', 'active', 'closed'].includes(status)) {
    return res.redirect(`/communications/surveys/${req.params.id}`);
  }

  db.prepare("UPDATE surveys SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, req.params.id);
  res.redirect(`/communications/surveys/${req.params.id}`);
});

module.exports = router;
