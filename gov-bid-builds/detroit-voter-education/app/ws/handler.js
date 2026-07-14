const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const pool = require('../db');
const { encrypt } = require('../middleware/encryption');

const VALID_ISSUES = ['Healthcare', 'Education', 'Transportation', 'Housing', 'Public Safety', 'Environment'];
const ZIP_REGEX = /^\d{5}$/;

async function handleMessage(ws, wss, msg) {
  if (msg.type !== 'SET_PREFERENCES') return;

  const { zipCode, issues } = msg;
  const sessionId = msg.sessionId || uuidv4();

  if (!ZIP_REGEX.test(zipCode)) {
    ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid ZIP code — must be 5 digits' }));
    return;
  }
  if (!Array.isArray(issues) || issues.length === 0) {
    ws.send(JSON.stringify({ type: 'ERROR', error: 'Select at least one civic issue' }));
    return;
  }
  const unknown = issues.filter((i) => !VALID_ISSUES.includes(i));
  if (unknown.length > 0) {
    ws.send(JSON.stringify({ type: 'ERROR', error: `Unknown issues: ${unknown.join(', ')}` }));
    return;
  }

  const encZip = encrypt(zipCode);
  const encIssues = encrypt(JSON.stringify(issues));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO user_preferences (session_id, zip_code_enc, zip_iv, issues_enc, issues_iv)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_id) DO UPDATE
         SET zip_code_enc = $2, zip_iv = $3, issues_enc = $4, issues_iv = $5, updated_at = NOW()`,
      [sessionId, encZip.enc, encZip.iv, encIssues.enc, encIssues.iv],
    );

    await client.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES ($1, 'PREFERENCES_SET', $2)`,
      [sessionId, JSON.stringify({ issue_count: issues.length })],
    );

    await client.query('COMMIT');

    const event = JSON.stringify({
      type: 'PREFERENCES_UPDATED',
      sessionId,
      zipCode,
      issues,
      timestamp: new Date().toISOString(),
    });

    wss.clients.forEach((c) => {
      if (c.readyState === WebSocket.OPEN) c.send(event);
    });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'detroit-voter-education',
      event: 'preferences_set',
      session_id: sessionId,
      outcome: 'success',
    }));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'preferences_set_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    ws.send(JSON.stringify({ type: 'ERROR', error: 'Failed to save preferences' }));
  } finally {
    client.release();
  }
}

module.exports = { handleMessage };
