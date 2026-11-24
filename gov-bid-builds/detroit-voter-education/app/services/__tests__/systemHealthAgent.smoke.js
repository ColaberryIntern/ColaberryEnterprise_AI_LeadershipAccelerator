// Live-DB smoke test for STORY-025. NOT part of `npm test`. Run manually:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     ADMIN_API_KEY=<any string> \
//     node app/services/__tests__/systemHealthAgent.smoke.js
//
// Runs a real Express app + WebSocket server (mirroring server.js's wiring,
// not the whole file, so this stays independent of the other ~10 routers)
// and exercises the REST endpoint, the real-time WS channel, and /metrics
// all over real HTTP/WS -- no mocks.
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const WebSocket = require('ws');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'smoke-test-admin-key';

const pool = require('../../db');
const systemHealthRouter = require('../../routes/systemHealth');
const metricsEndpointRouter = require('../../routes/metricsEndpoint');
const { getSystemHealth } = require('../systemHealthAgent');

function requestRaw(port, path, headers) {
  return new Promise((resolve, reject) => {
    http.get({ port, path, headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

async function run() {
  const app = express();
  app.use('/api/system-health', systemHealthRouter);
  app.use('/metrics', metricsEndpointRouter);
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');
    if (pathname !== '/admin/health') { ws.close(); return; }
    const providedKey = searchParams.get('key');
    if (providedKey !== process.env.ADMIN_API_KEY) { ws.close(4001, 'Unauthorized'); return; }
    // STORY-026: server.js's real admin push channels now use a shared
    // { type, data } shape (see handleAdminPushChannel) -- mirrored here
    // so this independent reimplementation stays representative.
    const push = async () => ws.send(JSON.stringify({ type: 'HEALTH_UPDATE', data: await getSystemHealth() }));
    push();
    const interval = setInterval(push, 200);
    ws.on('close', () => clearInterval(interval));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // --- REST endpoint: real DB ping, real uptime/memory -----------------
    const noKey = await requestRaw(port, '/api/system-health', {});
    assert.equal(noKey.status, 401);
    console.log('ok - GET /api/system-health with no key: 401');

    const withKey = await requestRaw(port, '/api/system-health', { 'x-admin-key': process.env.ADMIN_API_KEY });
    assert.equal(withKey.status, 200);
    const health = JSON.parse(withKey.body);
    assert.equal(health.database.status, 'up', 'expected a real DB ping to succeed against the throwaway container');
    assert.ok(health.database.latencyMs >= 0);
    assert.ok(health.uptimeSeconds >= 0);
    assert.ok(health.memory.heapUsed > 0);
    assert.ok(['healthy', 'degraded', 'down'].includes(health.status));
    console.log(`ok - GET /api/system-health with a valid key: 200, real DB ping (${health.database.latencyMs}ms), status=${health.status}`);

    // --- /metrics: unauthenticated, real Prometheus text format ----------
    const metrics = await requestRaw(port, '/metrics', {});
    assert.equal(metrics.status, 200);
    assert.match(metrics.body, /# HELP/, 'expected real Prometheus text-format output from prom-client');
    console.log('ok - GET /metrics is unauthenticated and returns real Prometheus text-format output');

    // --- WebSocket channel: real-time push, wrong key rejected -----------
    // Note: the server's ws.close(4001, ...) happens *after* the WebSocket
    // handshake already completed, so the client's 'open' event still
    // fires -- what proves rejection is the close code that follows
    // shortly after, not the absence of 'open'.
    const wrongKey = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/admin/health?key=wrong`);
      ws.on('close', (code) => resolve(code));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timed out waiting for the server to close the wrong-key connection')), 3000);
    });
    assert.equal(wrongKey, 4001);
    console.log('ok - WS /admin/health with the wrong key is closed with code 4001');

    const updates = await new Promise((resolve, reject) => {
      const received = [];
      const ws = new WebSocket(`ws://localhost:${port}/admin/health?key=${process.env.ADMIN_API_KEY}`);
      ws.on('message', (raw) => {
        received.push(JSON.parse(raw.toString()));
        if (received.length === 2) { ws.close(); resolve(received); }
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timed out waiting for 2 HEALTH_UPDATE pushes')), 5000);
    });
    assert.equal(updates.length, 2);
    assert.ok(updates.every((u) => u.type === 'HEALTH_UPDATE' && u.data.status));
    console.log('ok - WS /admin/health with a valid key receives real, repeated HEALTH_UPDATE pushes (proves the interval push actually works, not just a one-shot send)');

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
