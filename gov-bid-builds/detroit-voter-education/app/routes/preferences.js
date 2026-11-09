const express = require('express');
const pool = require('../db');
const { decrypt } = require('../middleware/encryption');
const { requireAdminKey } = require('../middleware/requireAdminKey');

const router = express.Router();

router.get('/:sessionId', requireAdminKey, async (req, res) => {
  const { sessionId } = req.params;
  try {
    const result = await pool.query(
      `SELECT zip_code_enc, zip_iv, issues_enc, issues_iv, updated_at
       FROM user_preferences WHERE session_id = $1`,
      [sessionId],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const row = result.rows[0];
    return res.json({
      sessionId,
      zipCode: decrypt(row.zip_code_enc, row.zip_iv),
      issues: JSON.parse(decrypt(row.issues_enc, row.issues_iv)),
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'preferences_read_failed',
      error_class: err.constructor.name,
    }));
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
