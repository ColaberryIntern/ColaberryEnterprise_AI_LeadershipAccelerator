// Live-DB smoke test for STORY-027. NOT part of `npm test`. Run manually:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     AUDIT_LOG_SIGNING_KEY=<64 hex chars> DATA_STEWARD_API_KEY=<any string> \
//     ADMIN_API_KEY=<any string> \
//     node app/services/__tests__/recentActions.smoke.js
//
// Runs a real Express app + real ws WebSocketServer (mirroring the
// relevant slice of server.js's wiring, matching the pattern established
// by systemHealthAgent.smoke.js and pendingApprovals.smoke.js) against
// real HTTP/WS -- no mocks. Central point of this test: the general
// ADMIN_API_KEY must NOT grant access to this resource, only the
// data_steward credential -- see decision-record-STORY-027.md.
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const WebSocket = require('ws');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';
process.env.AUDIT_LOG_SIGNING_KEY = process.env.AUDIT_LOG_SIGNING_KEY || '3'.repeat(64);
process.env.DATA_STEWARD_API_KEY = process.env.DATA_STEWARD_API_KEY || 'smoke-test-data-steward-key';
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'smoke-test-general-admin-key';

const pool = require('../../db');
const { logAction, listRecentActions } = require('../auditLogAgent');
const { hasPermission, logAccessAttempt } = require('../../middleware/rbac');
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
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');
    if (pathname !== '/admin/recent-actions') { ws.close(); return; }
    const providedKey = searchParams.get('key');
    (async () => {
      const permitted = hasPermission(providedKey, 'audit_log:read');
      await logAccessAttempt(permitted, providedKey, 'audit_log:read', { channel: 'ws:/admin/recent-actions' });
      if (!permitted) { ws.close(4001, 'Unauthorized'); return; }
      const push = async () => ws.send(JSON.stringify({ type: 'RECENT_ACTIONS_UPDATE', data: await listRecentActions() }));
      push();
      const interval = setInterval(push, 200);
      ws.on('close', () => clearInterval(interval));
    })();
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // A real, signed audit_log entry to find in the recent-actions list.
    const written = await logAction(null, 'RECENT_ACTIONS_SMOKE_MARKER', { note: 'real signed entry for the smoke test' });

    // --- REST endpoint --------------------------------------------------
    const noKey = await requestJson(port, '/api/audit-log/recent', {});
    assert.equal(noKey.status, 401);
    console.log('ok - GET /api/audit-log/recent with no key: 401');

    // The central point of this story: the general ADMIN_API_KEY must NOT
    // be sufficient here, even though it works for most other admin routes.
    const generalAdmin = await requestJson(port, '/api/audit-log/recent', { 'x-admin-key': process.env.ADMIN_API_KEY });
    assert.equal(generalAdmin.status, 401);
    console.log('ok - GET /api/audit-log/recent with the general ADMIN_API_KEY: 401 (must be data_steward-gated, not admin-gated)');

    const withStewardKey = await requestJson(port, '/api/audit-log/recent', { 'x-admin-key': process.env.DATA_STEWARD_API_KEY });
    assert.equal(withStewardKey.status, 200);
    const found = withStewardKey.body.find((row) => row.id === written.id);
    assert.ok(found, 'the just-written entry must appear in the recent-actions list');
    assert.equal(found.signatureStatus, 'valid', 'a freshly signed entry must verify as valid in the list, not just via single-entry lookup');
    console.log('ok - GET /api/audit-log/recent with the data_steward key: 200, real signed entry present with signatureStatus=valid');

    // --- limit bounding, exercised over real HTTP (not just the hermetic
    // unit test of boundLimit() in isolation) --------------------------
    const limited = await requestJson(port, '/api/audit-log/recent?limit=1', { 'x-admin-key': process.env.DATA_STEWARD_API_KEY });
    assert.equal(limited.status, 200);
    assert.equal(limited.body.length, 1);
    console.log('ok - GET /api/audit-log/recent?limit=1 returns exactly 1 row over real HTTP');

    // --- WebSocket channel -----------------------------------------------
    // Note: a server-side ws.close(4001, ...) sent right after 'connection'
    // still lets the client's 'open' event fire first (handshake already
    // completed) -- rejection is proven by the close code arriving shortly
    // after, not the absence of 'open' (same nuance caught in STORY-025).
    const wrongChannelKey = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/admin/recent-actions?key=${process.env.ADMIN_API_KEY}`);
      ws.on('close', (code) => resolve(code));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timed out waiting for the server to close the general-admin-key connection')), 3000);
    });
    assert.equal(wrongChannelKey, 4001, 'the general admin key must be rejected on the WS channel too, not just REST');
    console.log('ok - WS /admin/recent-actions with the general ADMIN_API_KEY is closed with code 4001');

    const updates = await new Promise((resolve, reject) => {
      const received = [];
      const ws = new WebSocket(`ws://localhost:${port}/admin/recent-actions?key=${process.env.DATA_STEWARD_API_KEY}`);
      ws.on('message', (raw) => {
        received.push(JSON.parse(raw.toString()));
        if (received.length === 2) { ws.close(); resolve(received); }
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timed out waiting for 2 RECENT_ACTIONS_UPDATE pushes')), 5000);
    });
    assert.equal(updates.length, 2);
    assert.ok(updates.every((u) => u.type === 'RECENT_ACTIONS_UPDATE'));
    assert.ok(updates.every((u) => u.data.some((row) => row.id === written.id)), 'both pushes must include the real written entry');
    console.log('ok - WS /admin/recent-actions with the data_steward key receives real, repeated pushes including the real entry');

    // --- WS connection attempts must be logged too, same as HTTP -------
    const wsAccessLogs = await pool.query(
      `SELECT action, metadata FROM audit_log WHERE metadata->>'channel' = 'ws:/admin/recent-actions' ORDER BY id DESC LIMIT 2`,
    );
    assert.equal(wsAccessLogs.rows.length, 2);
    assert.ok(wsAccessLogs.rows.some((r) => r.action === 'AUDIT_LOG_ACCESS_GRANTED'));
    assert.ok(wsAccessLogs.rows.some((r) => r.action === 'AUDIT_LOG_ACCESS_DENIED'));
    console.log('ok - both the granted and denied WS connection attempts were logged, same as HTTP access attempts');

    console.log('\nAll live-DB smoke assertions passed.');
  } finally {
    wss.close();
    server.close();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('SMOKE TEST FAILED:', err);
  process.exitCode = 1;
});
