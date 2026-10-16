// Live-DB smoke test for STORY-016 (in-app subscriptions + notification
// fan-out on provenance refresh). NOT part of `npm test`. Run manually:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     node app/services/__tests__/userInputAgent.smoke.js
//
// Uses obviously-fake dummy subjects -- never real officeholders/candidates.
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';

const pool = require('../../db');
const { generateSummary } = require('../summaryGenerationAgent');
const { submitForReview, reviewSummary } = require('../coordinatorAgent');
const { refreshSourceData } = require('../dataIngestionAgent');
const { subscribe, unsubscribe, listSubscriptions, getUpdates } = require('../userInputAgent');

const SUBSCRIBER_A = '11111111-1111-1111-1111-111111111111';
const SUBSCRIBER_B = '22222222-2222-2222-2222-222222222222';
const NOT_SUBSCRIBED = '33333333-3333-3333-3333-333333333333';

async function insertDummySubject(name, issuePositions) {
  const result = await pool.query(
    `INSERT INTO officeholders_candidates (name, office, jurisdiction, issue_positions)
     VALUES ($1, 'Dummy Office', 'Dummy Jurisdiction', $2)
     RETURNING id`,
    [name, JSON.stringify(issuePositions)],
  );
  return result.rows[0].id;
}

async function run() {
  const subjectId = await insertDummySubject('Dummy Testcase — Notifications', {
    Housing: { text: 'Original position.', sourceUrl: 'https://demo.example/v1.pdf', recordType: 'Draft', retrievedAt: '2026-01-01' },
  });
  await generateSummary(subjectId, ['Housing']);
  await submitForReview(subjectId, 'Draft summary about the original position.', 'human-reviewer-demo');
  await reviewSummary(subjectId, 'approve', 'admin-1', 'Approved for smoke test.');

  // Two subscribers, idempotent subscribe (calling twice must not error or duplicate).
  await subscribe(SUBSCRIBER_A, subjectId);
  await subscribe(SUBSCRIBER_A, subjectId);
  await subscribe(SUBSCRIBER_B, subjectId);
  const subsForA = await listSubscriptions(SUBSCRIBER_A);
  assert.deepEqual(subsForA, [subjectId]);
  console.log('ok - subscribe is idempotent, listSubscriptions returns the subject once');

  const dupeCheck = await pool.query('SELECT COUNT(*)::int AS n FROM subscriptions WHERE session_id = $1 AND subject_id = $2', [SUBSCRIBER_A, subjectId]);
  assert.equal(dupeCheck.rows[0].n, 1, 'double-subscribe must not create a duplicate row');
  console.log('ok - no duplicate subscription row in the DB');

  // Before any refresh, no updates for either subscriber.
  const updatesBefore = await getUpdates(SUBSCRIBER_A);
  assert.equal(updatesBefore.length, 0);
  console.log('ok - no updates before any source-data refresh');

  // Refresh the source data -> summary flagged stale -> notifications fan out.
  const refreshResult = await refreshSourceData(subjectId, 'Housing', {
    text: 'Revised position.', sourceUrl: 'https://demo.example/v2.pdf', recordType: 'Amended', retrievedAt: '2026-03-01',
  });
  assert.equal(refreshResult.staleFlagged, true);
  assert.equal(refreshResult.notifiedCount, 2, 'expected exactly 2 subscribers notified (A and B)');
  console.log(`ok - refreshSourceData: staleFlagged=true, notifiedCount=${refreshResult.notifiedCount}`);

  const notificationRows = await pool.query(
    `SELECT session_id FROM audit_log WHERE action = 'NOTIFICATION_SENT' AND (metadata->>'subject_id')::int = $1`,
    [subjectId],
  );
  const notifiedSessions = notificationRows.rows.map((r) => r.session_id).sort();
  assert.deepEqual(notifiedSessions, [SUBSCRIBER_A, SUBSCRIBER_B].sort());
  console.log('ok - NOTIFICATION_SENT audit rows written for exactly the 2 subscribers, none for the non-subscriber');

  const naiveRow = await pool.query(
    `SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'NOTIFICATION_SENT' AND session_id = $1`,
    [NOT_SUBSCRIBED],
  );
  assert.equal(naiveRow.rows[0].n, 0, 'a session that never subscribed must never receive a notification');
  console.log('ok - non-subscriber received zero notifications');

  // Both subscribers now see the update.
  const updatesAfterA = await getUpdates(SUBSCRIBER_A);
  const updatesAfterB = await getUpdates(SUBSCRIBER_B);
  assert.equal(updatesAfterA.length, 1);
  assert.equal(updatesAfterB.length, 1);
  assert.equal(updatesAfterA[0].subject_id, subjectId);
  console.log('ok - getUpdates() surfaces the stale subject for both subscribers');

  // Unsubscribe A -> no longer sees updates; B still does.
  await unsubscribe(SUBSCRIBER_A, subjectId);
  const updatesAfterUnsub = await getUpdates(SUBSCRIBER_A);
  assert.equal(updatesAfterUnsub.length, 0);
  const stillSubscribedB = await getUpdates(SUBSCRIBER_B);
  assert.equal(stillSubscribedB.length, 1);
  console.log('ok - unsubscribe removes updates visibility for A, B unaffected');

  console.log('\nAll live-DB smoke assertions passed.');
}

run()
  .catch((err) => {
    console.error('SMOKE TEST FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
