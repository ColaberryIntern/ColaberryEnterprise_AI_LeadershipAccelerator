// Live-DB smoke test for STORY-029. NOT part of `npm test`. Run manually:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     ADMIN_API_KEY=<any string> \
//     node app/services/__tests__/governanceScore.smoke.js
//
// Runs a real Express app + WebSocket server (mirroring the relevant slice
// of server.js's wiring, same pattern as systemHealthAgent.smoke.js) against
// real HTTP/WS -- no mocks. Exercises GET /api/governance/score (STORY-013,
// already existed) plus the new /admin/governance WS channel this story
// adds, and proves the score reflects a real evaluation this test itself
// triggers via the full demo pipeline (STORY-010-013), not fabricated numbers.
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const WebSocket = require('ws');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'smoke-test-admin-key';

const pool = require('../../db');
const governanceRouter = require('../../routes/governance');
const { getGovernanceScore } = require('../trustGovernanceAgent');
const { runFullDemoPipeline } = require('../demoPipeline');

function requestJson(port, path, headers) {
  return new Promise((resolve, reject) => {
    http.get({ port, path, headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null }));
    }).on('error', reject);
  });
}

async function insertDummySubject(name, issuePositions) {
  const result = await pool.query(
    `INSERT INTO officeholders_candidates (name, office, jurisdiction, issue_positions)
     VALUES ($1, 'Fictional Demo Office', 'Fictional Demo District', $2)
     RETURNING id`,
    [name, JSON.stringify(issuePositions)],
  );
  return result.rows[0].id;
}

async function run() {
  const app = express();
  app.use('/api/governance', governanceRouter);
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');
    if (pathname !== '/admin/governance') { ws.close(); return; }
    const providedKey = searchParams.get('key');
    if (providedKey !== process.env.ADMIN_API_KEY) { ws.close(4001, 'Unauthorized'); return; }
    const push = async () => ws.send(JSON.stringify({ type: 'GOVERNANCE_UPDATE', data: await getGovernanceScore() }));
    push();
    const interval = setInterval(push, 200);
    ws.on('close', () => clearInterval(interval));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // --- REST endpoint: auth ----------------------------------------------
    const noKey = await requestJson(port, '/api/governance/score', {});
    assert.equal(noKey.status, 401);
    console.log('ok - GET /api/governance/score with no key: 401');

    const before = await requestJson(port, '/api/governance/score', { 'x-admin-key': process.env.ADMIN_API_KEY });
    assert.equal(before.status, 200);
    const beforeEvaluated = before.body.evaluatedCount;
    console.log(`ok - GET /api/governance/score with a valid key: 200 (evaluatedCount=${beforeEvaluated} before this test's own evaluation)`);

    // --- Trigger a real evaluation via the full demo pipeline --------------
    const subjectId = await insertDummySubject('Dummy Testcase — Governance Score Smoke', {
      Housing: { text: 'Supports expanding the affordable housing tax credit program citywide.' },
    });
    const pipelineResult = await runFullDemoPipeline(subjectId, ['Housing']);
    assert.equal(pipelineResult.stage, 'published_and_evaluated');

    const after = await requestJson(port, '/api/governance/score', { 'x-admin-key': process.env.ADMIN_API_KEY });
    assert.equal(after.status, 200);
    assert.equal(after.body.evaluatedCount, beforeEvaluated + 1, "expected the just-triggered evaluation to be reflected in the real aggregate count");
    assert.ok(after.body.evaluationCoveragePct >= 0 && after.body.evaluationCoveragePct <= 1);
    assert.ok(after.body.passRatePct >= 0 && after.body.passRatePct <= 1);
    console.log(`ok - GET /api/governance/score reflects the real new evaluation (evaluatedCount=${after.body.evaluatedCount}, passRatePct=${after.body.passRatePct.toFixed(2)})`);

    // --- WebSocket channel ---------------------------------------------------
    // Note: a server-side ws.close(4001, ...) sent right after 'connection'
    // still lets the client's 'open' event fire first (handshake already
    // completed) -- rejection is proven by the close code that follows
    // shortly after, not the absence of 'open' (same nuance as STORY-025/027).
    const wrongKey = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/admin/governance?key=wrong`);
      ws.on('close', (code) => resolve(code));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timed out waiting for the server to close the wrong-key connection')), 3000);
    });
    assert.equal(wrongKey, 4001);
    console.log('ok - WS /admin/governance with the wrong key is closed with code 4001');

    const updates = await new Promise((resolve, reject) => {
      const received = [];
      const ws = new WebSocket(`ws://localhost:${port}/admin/governance?key=${process.env.ADMIN_API_KEY}`);
      ws.on('message', (raw) => {
        received.push(JSON.parse(raw.toString()));
        if (received.length === 2) { ws.close(); resolve(received); }
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timed out waiting for 2 GOVERNANCE_UPDATE pushes')), 5000);
    });
    assert.equal(updates.length, 2);
    assert.ok(updates.every((u) => u.type === 'GOVERNANCE_UPDATE' && u.data.evaluatedCount === after.body.evaluatedCount));
    console.log('ok - WS /admin/governance with a valid key receives real, repeated GOVERNANCE_UPDATE pushes matching the REST snapshot');

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
