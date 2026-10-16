// Live-DB smoke test for CoordinatorAgent (STORY-011). NOT part of `npm test`.
// Run manually against a throwaway Postgres instance:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     node app/services/__tests__/coordinatorAgent.smoke.js
//
// Uses obviously-fake dummy subjects — never real officeholders/candidates.
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';

const pool = require('../../db');
const { generateSummary } = require('../summaryGenerationAgent');
const { submitForReview, listPendingReview, reviewSummary, NOTIFICATION_SLA_MS } = require('../coordinatorAgent');

async function insertDummySubject(name, issuePositions) {
  const result = await pool.query(
    `INSERT INTO officeholders_candidates (name, office, jurisdiction, issue_positions)
     VALUES ($1, 'Dummy Office', 'Dummy Jurisdiction', $2)
     RETURNING id`,
    [name, JSON.stringify(issuePositions)],
  );
  return result.rows[0].id;
}

async function countAuditLogRows(action, summaryId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS n FROM audit_log
     WHERE action = $1 AND (metadata->>'summary_id')::int = $2`,
    [action, summaryId],
  );
  return result.rows[0].n;
}

async function run() {
  // Seed: a full-coverage summary in pending_content, via the real STORY-010 agent.
  const subjectId = await insertDummySubject('Dummy Testcase — Review Workflow', {
    Housing: { text: 'Placeholder position text for smoke test.' },
    Education: { text: 'Placeholder position text for smoke test.' },
  });
  const generated = await generateSummary(subjectId, ['Housing', 'Education']);
  assert.equal(generated.status, 'pending_content');
  console.log('ok - seed: SummaryGenerationAgent produced a pending_content row');

  // Cannot review before content is submitted.
  await assert.rejects(
    () => reviewSummary(subjectId, 'approve', 'admin-1', null),
    (err) => err.code === 'INVALID_STATE_TRANSITION',
  );
  console.log('ok - cannot review a pending_content summary (must be pending_review first)');

  // Human submits authored content for review -> pending_review + stubbed notification.
  const submitted = await submitForReview(subjectId, 'Draft summary text authored by a human reviewer.', 'jane.steward@example.test');
  assert.equal(submitted.status, 'pending_review');
  assert.ok(submitted.notificationId, 'expected a notification row to be created');
  assert.ok(submitted.latencyMs <= NOTIFICATION_SLA_MS, 'notification latency must be within the 15-minute SLA');
  assert.equal(submitted.meetsSla, true);
  console.log(`ok - submitForReview: pending_review + notification fired (latency ${submitted.latencyMs}ms, SLA ${NOTIFICATION_SLA_MS}ms)`);

  const deferredAuditRows = await countAuditLogRows('SUMMARY_SUBMITTED_FOR_REVIEW', submitted.summaryId);
  assert.equal(deferredAuditRows, 1, 'expected exactly one SUMMARY_SUBMITTED_FOR_REVIEW audit row');
  const notificationRows = await pool.query('SELECT * FROM admin_notifications WHERE summary_id = $1', [submitted.summaryId]);
  assert.equal(notificationRows.rows.length, 1, 'expected exactly one admin_notifications row');
  assert.equal(notificationRows.rows[0].channel, 'log_stub');
  console.log('ok - audit_log + admin_notifications rows verified');

  // It shows up in the pending-review queue.
  const pending = await listPendingReview();
  assert.ok(pending.some((row) => row.subject_id === subjectId), 'expected the subject to appear in listPendingReview()');
  console.log('ok - listPendingReview: subject appears in the queue');

  // Cannot double-submit while already pending_review.
  await assert.rejects(
    () => submitForReview(subjectId, 'second attempt', 'jane.steward@example.test'),
    (err) => err.code === 'INVALID_STATE_TRANSITION',
  );
  console.log('ok - cannot resubmit a summary that is already pending_review');

  // Reject requires notes.
  await assert.rejects(
    () => reviewSummary(subjectId, 'reject', 'admin-1', ''),
    (err) => err.code === 'REJECTION_REQUIRES_NOTES',
  );
  console.log('ok - reject without notes is rejected (pun intended)');

  // Admin rejects with notes -> status rejected, audit logged, no longer in pending queue.
  const rejected = await reviewSummary(subjectId, 'reject', 'admin-1', 'Tone reads as editorializing — please revise.');
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.reviewed_by, 'admin-1');
  const rejectedAuditRows = await countAuditLogRows('SUMMARY_REJECTED', submitted.summaryId);
  assert.equal(rejectedAuditRows, 1);
  const pendingAfterReject = await listPendingReview();
  assert.ok(!pendingAfterReject.some((row) => row.subject_id === subjectId), 'rejected summary must leave the pending-review queue');
  console.log('ok - reject: status=rejected, audit logged, removed from pending queue');

  // Human resubmits after rejection -> back to pending_review.
  const resubmitted = await submitForReview(subjectId, 'Revised draft addressing the rejection notes.', 'jane.steward@example.test');
  assert.equal(resubmitted.status, 'pending_review');
  console.log('ok - resubmit after rejection succeeds (pending_content/rejected -> pending_review)');

  // Admin approves -> published. This is the only code path that sets status='published'.
  const approved = await reviewSummary(subjectId, 'approve', 'admin-1', 'Looks accurate and neutral.');
  assert.equal(approved.status, 'published');
  assert.equal(approved.reviewed_by, 'admin-1');
  const approvedAuditRows = await countAuditLogRows('SUMMARY_APPROVED', submitted.summaryId);
  assert.equal(approvedAuditRows, 1);
  console.log('ok - approve: status=published, audit logged');

  // Cannot review an already-published summary again.
  await assert.rejects(
    () => reviewSummary(subjectId, 'approve', 'admin-1', null),
    (err) => err.code === 'INVALID_STATE_TRANSITION',
  );
  console.log('ok - cannot re-review a published summary');

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
