// Live-DB smoke test for STORY-026. NOT part of `npm test`. Run manually:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     ADMIN_API_KEY=<any string> \
//     node app/services/__tests__/pendingApprovals.smoke.js
//
// Runs a real Express app + real ws WebSocketServer (mirroring server.js's
// wiring for the two routes/channels this story touches, not the whole
// file, matching the pattern established by systemHealthAgent.smoke.js)
// against real HTTP/WS -- no mocks. Uses an obviously-fake dummy subject.
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const WebSocket = require('ws');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'smoke-test-admin-key';

const pool = require('../../db');
const { generateSummary } = require('../summaryGenerationAgent');
const { submitForReview, listPendingReview } = require('../coordinatorAgent');
const summaryReviewsRouter = require('../../routes/summaryReviews');

function requestJson(port, path, headers) {
  return new Promise((resolve, reject) => {
    http.get({ port, path, headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null }));
    }).on('error', reject);
  });
}

async function insertDummySubject(name) {
  const result = await pool.query(
    `INSERT INTO officeholders_candidates (name, office, jurisdiction, issue_positions)
     VALUES ($1, 'Dummy Office', 'Dummy Jurisdiction', $2)
     RETURNING id`,
    [name, JSON.stringify({
      Housing: { text: 'Fictional housing position for pending-approvals smoke test.', sourceUrl: 'https://demo.example/pending.pdf', recordType: 'Draft', retrievedAt: '2026-01-01' },
    })],
  );
  return result.rows[0].id;
}

async function run() {
  const app = express();
  app.use(express.json());
  app.use('/api/summary-reviews', summaryReviewsRouter);
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');
    if (pathname !== '/admin/pending-approvals') { ws.close(); return; }
    const providedKey = searchParams.get('key');
    if (providedKey !== process.env.ADMIN_API_KEY) { ws.close(4001, 'Unauthorized'); return; }
    const push = async () => ws.send(JSON.stringify({ type: 'PENDING_APPROVALS_UPDATE', data: await listPendingReview() }));
    push();
    const interval = setInterval(push, 200);
    ws.on('close', () => clearInterval(interval));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const subjectId = await insertDummySubject('Dummy Testcase — Pending Approvals');
    await generateSummary(subjectId, ['Housing']);

    // --- Before submission: not yet pending ------------------------------
    const beforeSubmit = await listPendingReview();
    assert.ok(!beforeSubmit.some((s) => s.subject_id === subjectId), 'subject must not appear as pending before submission');
    console.log('ok - subject does not appear as pending before submitForReview');

    await submitForReview(subjectId, 'Draft summary for pending-approvals smoke test.', 'human-reviewer-demo');

    // --- REST endpoint: real pending-review data --------------------------
    const noKey = await requestJson(port, '/api/summary-reviews/pending', {});
    assert.equal(noKey.status, 401);
    console.log('ok - GET /api/summary-reviews/pending with no key: 401');

    const withKey = await requestJson(port, '/api/summary-reviews/pending', { 'x-admin-key': process.env.ADMIN_API_KEY });
    assert.equal(withKey.status, 200);
    const found = withKey.body.find((s) => s.subject_id === subjectId);
    assert.ok(found, 'the just-submitted subject must appear in the pending list');
    assert.equal(found.name, 'Dummy Testcase — Pending Approvals');
    console.log('ok - GET /api/summary-reviews/pending with a valid key: 200, real pending subject present');

    // --- WebSocket channel: real-time push, wrong-key rejected -----------
    // Note: a server-side ws.close(4001, ...) sent right after 'connection'
    // still lets the client's 'open' event fire first (handshake already
    // completed) -- rejection is proven by the close code arriving shortly
    // after, not the absence of 'open' (same nuance caught in STORY-025).
    const wrongKey = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/admin/pending-approvals?key=wrong`);
      ws.on('close', (code) => resolve(code));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timed out waiting for the server to close the wrong-key connection')), 3000);
    });
    assert.equal(wrongKey, 4001);
    console.log('ok - WS /admin/pending-approvals with the wrong key is closed with code 4001');

    const updates = await new Promise((resolve, reject) => {
      const received = [];
      const ws = new WebSocket(`ws://localhost:${port}/admin/pending-approvals?key=${process.env.ADMIN_API_KEY}`);
      ws.on('message', (raw) => {
        received.push(JSON.parse(raw.toString()));
        if (received.length === 2) { ws.close(); resolve(received); }
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timed out waiting for 2 PENDING_APPROVALS_UPDATE pushes')), 5000);
    });
    assert.equal(updates.length, 2);
    assert.ok(updates.every((u) => u.type === 'PENDING_APPROVALS_UPDATE'));
    assert.ok(updates.every((u) => u.data.some((s) => s.subject_id === subjectId)), 'both pushes must include the real pending subject');
    console.log('ok - WS /admin/pending-approvals with a valid key receives real, repeated pushes including the pending subject');

    // --- Decision endpoint (reused as-is from STORY-011): approving
    // removes the subject from the pending list. -------------------------
    const decision = await new Promise((resolve, reject) => {
      const body = JSON.stringify({ decision: 'approve', adminId: 'city-content-admin', notes: '' });
      const req = http.request({
        port, path: `/api/summary-reviews/${subjectId}/decision`, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-admin-key': process.env.ADMIN_API_KEY },
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    assert.equal(decision.status, 200);
    console.log('ok - POST /api/summary-reviews/:subjectId/decision (approve) succeeds via the reused STORY-011 endpoint');

    const afterApproval = await listPendingReview();
    assert.ok(!afterApproval.some((s) => s.subject_id === subjectId), 'approved subject must no longer appear as pending');
    console.log('ok - approved subject no longer appears in the pending list');

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
