// Live-DB smoke test for STORY-024. NOT part of `npm test`. Run manually:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     AUDIT_LOG_SIGNING_KEY=<64 hex chars> DATA_STEWARD_API_KEY=<any string> \
//     node app/services/__tests__/rbac.smoke.js
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';
process.env.AUDIT_LOG_SIGNING_KEY = process.env.AUDIT_LOG_SIGNING_KEY || '2'.repeat(64);
process.env.DATA_STEWARD_API_KEY = process.env.DATA_STEWARD_API_KEY || 'smoke-test-data-steward-key';
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'smoke-test-general-admin-key';

const pool = require('../../db');
const auditLogRouter = require('../../routes/auditLog');

function requestJson(port, path, headers) {
  return new Promise((resolve, reject) => {
    http.get({ port, path, headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null }));
    }).on('error', reject);
  });
}

async function run() {
  const app = express();
  app.use('/api/audit-log', auditLogRouter);
  const server = app.listen(0);
  const port = server.address().port;

  try {
    // A real audit_log row to attempt reading via the newly-role-gated route.
    const written = await pool.query(
      `INSERT INTO audit_log (session_id, action, metadata) VALUES (NULL, 'SMOKE_SETUP', '{}') RETURNING id`,
    );
    const targetId = written.rows[0].id;

    // --- Denied: no credential at all -------------------------------
    const noKey = await requestJson(port, `/api/audit-log/${targetId}`, {});
    assert.equal(noKey.status, 401);
    console.log('ok - no credential: denied with 401');

    // --- Denied: the general ADMIN_API_KEY is not sufficient ---------
    const generalAdmin = await requestJson(port, `/api/audit-log/${targetId}`, { 'x-admin-key': process.env.ADMIN_API_KEY });
    assert.equal(generalAdmin.status, 401);
    console.log('ok - general ADMIN_API_KEY alone: denied with 401 (deliberate strengthening over the prior binary gate)');

    // --- Granted: the data_steward credential works -------------------
    const steward = await requestJson(port, `/api/audit-log/${targetId}`, { 'x-admin-key': process.env.DATA_STEWARD_API_KEY });
    assert.equal(steward.status, 200);
    assert.equal(steward.body.id, targetId);
    console.log('ok - data_steward credential: granted with 200, correct entry returned');

    // --- Every attempt above must be correctly logged, not mislabeled -
    const grantedLog = await pool.query(
      `SELECT * FROM audit_log WHERE action = 'AUDIT_LOG_ACCESS_GRANTED' ORDER BY id DESC LIMIT 1`,
    );
    assert.equal(grantedLog.rows.length, 1);
    assert.equal(grantedLog.rows[0].metadata.role, 'data_steward');
    assert.ok(grantedLog.rows[0].signature, 'the access-granted entry must be signed via logAction(), not a raw unsigned INSERT');
    console.log('ok - AUDIT_LOG_ACCESS_GRANTED entry written, correctly labeled, signed');

    const deniedLogs = await pool.query(
      `SELECT * FROM audit_log WHERE action = 'AUDIT_LOG_ACCESS_DENIED' ORDER BY id DESC LIMIT 2`,
    );
    assert.equal(deniedLogs.rows.length, 2, 'expected both denial attempts (no key, general admin key) to be logged');
    for (const row of deniedLogs.rows) {
      assert.ok(row.signature, 'denied attempts must also be signed, not just granted ones');
    }
    console.log('ok - both AUDIT_LOG_ACCESS_DENIED attempts logged and signed');

    // --- No entry was mislabeled as the old PREFERENCES_READ action --
    const mislabeled = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_log WHERE action IN ('PREFERENCES_READ', 'PREFERENCES_READ_DENIED') AND metadata->>'path' LIKE '%audit-log%'`,
    );
    assert.equal(mislabeled.rows[0].n, 0, 'no audit-log access attempt should be mislabeled as a preferences-read event');
    console.log('ok - no audit-log access attempt was mislabeled as PREFERENCES_READ');

    console.log('\nAll live-DB smoke assertions passed.');
  } finally {
    server.close();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('SMOKE TEST FAILED:', err);
  process.exitCode = 1;
});
