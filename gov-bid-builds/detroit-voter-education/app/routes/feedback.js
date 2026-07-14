const express = require('express');
const pool = require('../db');

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

module.exports = router;
