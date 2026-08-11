const express = require('express');
const pool = require('../db');
const { requireAdminKey } = require('../middleware/requireAdminKey');

const router = express.Router();

const VALID_TYPES = ['general', 'bug', 'data_error', 'accessibility', 'other'];

router.post('/', async (req, res) => {
  const { sessionId = null, type = 'general', message } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required' });
  }
  if (message.trim().length > 2000) {
    return res.status(400).json({ error: 'Message must be 2000 characters or fewer' });
  }
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `Type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO feedback (session_id, type, message)
       VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [sessionId, type, message.trim()],
    );

    await client.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES ($1, 'FEEDBACK_SUBMITTED', $2)`,
      [sessionId, JSON.stringify({ feedback_id: result.rows[0].id, type })],
    );

    await client.query('COMMIT');

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'detroit-voter-education',
      event: 'feedback_submitted',
      feedback_id: result.rows[0].id,
      type,
      outcome: 'success',
    }));

    return res.status(201).json({
      ok: true,
      feedbackId: result.rows[0].id,
      message: 'Thank you — your feedback has been recorded.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'feedback_submit_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to submit feedback' });
  } finally {
    client.release();
  }
});

// STORY-021: no admin read path existed for submitted feedback at all --
// including the accessibility-tagged reports the FeedbackForm has accepted
// since STORY-005. Supports an optional ?type= filter so the quarterly
// accessibility audit can pull just the accessibility-tagged rows without a
// second, duplicate query living in accessibilityAuditAgent.js.
router.get('/', requireAdminKey, async (req, res) => {
  const { type } = req.query;
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  try {
    const result = type
      ? await pool.query(
        `SELECT id, session_id, type, message, created_at, reviewed_by, reviewed_at, review_notes
         FROM feedback WHERE type = $1 ORDER BY created_at DESC LIMIT 100`,
        [type],
      )
      : await pool.query(
        `SELECT id, session_id, type, message, created_at, reviewed_by, reviewed_at, review_notes
         FROM feedback ORDER BY created_at DESC LIMIT 100`,
      );
    return res.json(result.rows);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'feedback_list_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Internal error' });
  }
});

// STORY-022: marks a feedback item reviewed. Not an approve/reject gate
// (unlike reviewExportRequest/reviewSummary elsewhere in this app) --
// feedback review doesn't block or unlock anything downstream, it's just a
// record that a City content admin looked at it. Once reviewed, immutable
// via this endpoint -- re-reviewing throws rather than silently
// overwriting who reviewed it and when.
router.post('/:id/review', requireAdminKey, async (req, res) => {
  const feedbackId = Number(req.params.id);
  if (!Number.isInteger(feedbackId)) {
    return res.status(400).json({ error: 'id must be an integer' });
  }
  const { adminId, notes } = req.body;
  if (typeof adminId !== 'string' || adminId.trim().length === 0) {
    return res.status(400).json({ error: 'adminId must be a non-empty string' });
  }

  try {
    const existing = await pool.query('SELECT id, reviewed_at FROM feedback WHERE id = $1', [feedbackId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'No feedback found for this id' });
    }
    if (existing.rows[0].reviewed_at) {
      return res.status(409).json({ error: 'This feedback has already been reviewed', code: 'ALREADY_REVIEWED' });
    }

    const updated = await pool.query(
      `UPDATE feedback SET reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
       WHERE id = $3 RETURNING id, reviewed_at`,
      [adminId, notes || null, feedbackId],
    );

    await pool.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES (NULL, 'FEEDBACK_REVIEWED', $1)`,
      [JSON.stringify({ feedback_id: feedbackId, admin_id: adminId })],
    );

    return res.json({ feedbackId, reviewedAt: updated.rows[0].reviewed_at });
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'feedback_review_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
