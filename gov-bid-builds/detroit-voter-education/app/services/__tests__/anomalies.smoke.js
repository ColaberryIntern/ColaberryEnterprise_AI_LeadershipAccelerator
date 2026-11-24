// Live-DB smoke test for STORY-028. NOT part of `npm test`. Run manually:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     AUDIT_LOG_SIGNING_KEY=<64 hex chars> DATA_STEWARD_API_KEY=<any string> \
//     ADMIN_API_KEY=<any string> \
//     node app/services/__tests__/anomalies.smoke.js
//
// Runs a real Express app + real ws WebSocketServer (mirroring the
// relevant slice of server.js's wiring, matching the pattern established
// by recentActions.smoke.js) against real HTTP/WS -- no mocks. Central
// point of this test: every anomaly surfaced is derived from a REAL event
// this test itself triggers (a real circuit-breaker escalation, real
// access denials) -- not fabricated demo data.
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const WebSocket = require('ws');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';
process.env.AUDIT_LOG_SIGNING_KEY = process.env.AUDIT_LOG_SIGNING_KEY || '7'.repeat(64);
process.env.DATA_STEWARD_API_KEY = process.env.DATA_STEWARD_API_KEY || 'smoke-test-data-steward-key';
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'smoke-test-general-admin-key';

const pool = require('../../db');
const { logAction, listAnomalies } = require('../auditLogAgent');
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
    if (pathname !== '/admin/anomalies') { ws.close(); return; }
    const providedKey = searchParams.get('key');
    (async () => {
      const permitted = hasPermission(providedKey, 'audit_log:read');
      await logAccessAttempt(permitted, providedKey, 'audit_log:read', { channel: 'ws:/admin/anomalies' });
      if (!permitted) { ws.close(4001, 'Unauthorized'); return; }
      const push = async () => ws.send(JSON.stringify({ type: 'ANOMALIES_UPDATE', data: await listAnomalies() }));
      push();
      const interval = setInterval(push, 200);
      ws.on('close', () => clearInterval(interval));
    })();
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // --- Before/after comparison uses a UNIQUE synthetic source name, not
    // "the whole list must be empty" -- this smoke test may share a
    // long-lived throwaway container with other smoke tests in a
    // consolidated regression pass (e.g. governmentApiIngestionAgent's own
    // smoke test legitimately triggers a real ESCALATION_TRIGGERED event),
    // so asserting total emptiness would be a false failure, not a real one.
    const SYNTHETIC_SOURCE = `smoke_test_source_${Date.now()}`;

    const before = await requestJson(port, '/api/audit-log/anomalies', { 'x-admin-key': process.env.DATA_STEWARD_API_KEY });
    assert.equal(before.status, 200);
    assert.ok(
      !before.body.some((a) => a.type === 'circuit_breaker_open' && a.detail.includes(SYNTHETIC_SOURCE)),
      'the unique synthetic source must not already appear as an anomaly before this test triggers it',
    );
    console.log('ok - GET /api/audit-log/anomalies does not yet show this test\'s not-yet-triggered synthetic anomaly');

    // --- Trigger a real circuit-breaker escalation event ------------------
    await logAction(null, 'ESCALATION_TRIGGERED', { source: SYNTHETIC_SOURCE, endpoint: 'https://demo.example/x', reason: 'circuit_open', tier: 'senior_admin' });

    // --- Trigger real repeated access denials (below, then at, threshold) -
    for (let i = 0; i < 3; i += 1) {
      await requestJson(port, '/api/audit-log/recent', { 'x-admin-key': 'definitely-wrong-key' });
    }

    // --- The general ADMIN_API_KEY must NOT be sufficient here either ----
    const generalAdmin = await requestJson(port, '/api/audit-log/anomalies', { 'x-admin-key': process.env.ADMIN_API_KEY });
    assert.equal(generalAdmin.status, 401);
    console.log('ok - GET /api/audit-log/anomalies with the general ADMIN_API_KEY: 401 (data_steward-gated, not admin-gated)');

    const after = await requestJson(port, '/api/audit-log/anomalies', { 'x-admin-key': process.env.DATA_STEWARD_API_KEY });
    assert.equal(after.status, 200);
    const types = after.body.map((a) => a.type);
    assert.ok(types.includes('circuit_breaker_open'), 'expected the real ESCALATION_TRIGGERED event to surface as an anomaly');
    assert.ok(types.includes('repeated_access_denials'), 'expected the real wrong-key requests to surface as a repeated-access-denials anomaly');
    const circuitAnomaly = after.body.find((a) => a.type === 'circuit_breaker_open' && a.detail.includes(SYNTHETIC_SOURCE));
    assert.ok(circuitAnomaly, 'expected an anomaly entry naming this test\'s own unique synthetic source');
    assert.equal(circuitAnomaly.severity, 'high');
    console.log(`ok - GET /api/audit-log/anomalies with the data_steward key: 200, this test's own real triggered anomalies present (${types.join(', ')})`);

    // --- WebSocket channel ------------------------------------------------
    const wrongKey = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/admin/anomalies?key=${process.env.ADMIN_API_KEY}`);
      ws.on('close', (code) => resolve(code));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timed out waiting for the server to close the general-admin-key connection')), 3000);
    });
    assert.equal(wrongKey, 4001, 'the general admin key must be rejected on the WS channel too, not just REST');
    console.log('ok - WS /admin/anomalies with the general ADMIN_API_KEY is closed with code 4001');

    const updates = await new Promise((resolve, reject) => {
      const received = [];
      const ws = new WebSocket(`ws://localhost:${port}/admin/anomalies?key=${process.env.DATA_STEWARD_API_KEY}`);
      ws.on('message', (raw) => {
        received.push(JSON.parse(raw.toString()));
        if (received.length === 2) { ws.close(); resolve(received); }
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timed out waiting for 2 ANOMALIES_UPDATE pushes')), 5000);
    });
    assert.equal(updates.length, 2);
    assert.ok(updates.every((u) => u.type === 'ANOMALIES_UPDATE'));
    assert.ok(
      updates.every((u) => u.data.some((a) => a.type === 'circuit_breaker_open' && a.detail.includes(SYNTHETIC_SOURCE))),
      'both pushes must include this test\'s own real triggered anomaly',
    );
    console.log('ok - WS /admin/anomalies with the data_steward key receives real, repeated pushes including the real anomalies');

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
