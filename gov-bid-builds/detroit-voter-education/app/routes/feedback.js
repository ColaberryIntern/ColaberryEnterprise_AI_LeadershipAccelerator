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
        `SELECT id, session_id, type, message, created_at FROM feedback
         WHERE type = $1 ORDER BY created_at DESC LIMIT 100`,
        [type],
      )
      : await pool.query(
        `SELECT id, session_id, type, message, created_at FROM feedback
         ORDER BY created_at DESC LIMIT 100`,
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

module.exports = router;
