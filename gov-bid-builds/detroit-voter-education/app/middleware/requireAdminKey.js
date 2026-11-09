const pool = require('../db');

async function requireAdminKey(req, res, next) {
  const provided = req.headers['x-admin-key'];
  const expected = process.env.ADMIN_API_KEY;

  const authorized = expected && provided === expected;
  const sessionId = req.params.sessionId || null;

  try {
    await pool.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES ($1, $2, $3)`,
      [
        sessionId,
        authorized ? 'PREFERENCES_READ' : 'PREFERENCES_READ_DENIED',
        JSON.stringify({ ip: req.ip }),
      ],
    );
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'audit_log_write_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
  }

  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
}

module.exports = { requireAdminKey };
