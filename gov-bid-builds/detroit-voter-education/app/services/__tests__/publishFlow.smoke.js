// Live-DB smoke test for STORY-012 (publish + public read path). NOT part of
// `npm test`. Run manually against a throwaway Postgres instance:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     node app/services/__tests__/publishFlow.smoke.js
//
// Uses obviously-fake dummy subjects — never real officeholders/candidates.
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';

const pool = require('../../db');
const { generateSummary } = require('../summaryGenerationAgent');
const {
  submitForReview, reviewSummary, getPublishedSummary, listPublishedSummaries, PUBLISH_SLA_MS,
} = require('../coordinatorAgent');

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
  // A subject that will go all the way to published.
  const publishedSubjectId = await insertDummySubject('Dummy Testcase — Published', {
    Housing: { text: 'Placeholder position text for smoke test.' },
  });
  await generateSummary(publishedSubjectId, ['Housing']);
  const submitted = await submitForReview(publishedSubjectId, 'Draft summary text.', 'jane.steward@example.test');

  // Not visible publicly before approval.
  const beforeApproval = await getPublishedSummary(publishedSubjectId);
  assert.equal(beforeApproval, null, 'pending_review summary must not be publicly readable');
  console.log('ok - pending_review summary is invisible on the public read path');

  const approved = await reviewSummary(publishedSubjectId, 'approve', 'admin-1', 'Looks good.');
  assert.equal(approved.status, 'published');
  assert.ok(approved.published_at, 'expected published_at to be set on approval');
  assert.ok(approved.publishLatencyMs <= PUBLISH_SLA_MS, 'publish latency must be within the 1-hour SLA');
  console.log(`ok - approve: published, latency ${approved.publishLatencyMs}ms (SLA ${PUBLISH_SLA_MS}ms)`);

  const publishedAuditRows = await countAuditLogRows('SUMMARY_PUBLISHED', submitted.summaryId);
  assert.equal(publishedAuditRows, 1, 'expected exactly one SUMMARY_PUBLISHED audit row');
  const approvedAuditRows = await countAuditLogRows('SUMMARY_APPROVED', submitted.summaryId);
  assert.equal(approvedAuditRows, 1, 'expected SUMMARY_APPROVED to remain its own distinct audit row');
  console.log('ok - SUMMARY_APPROVED and SUMMARY_PUBLISHED are both logged as distinct audit events');

  // Now visible publicly, with the right fields, and no admin-only fields leaked.
  const publicView = await getPublishedSummary(publishedSubjectId);
  assert.ok(publicView, 'expected the published summary to be publicly readable');
  assert.equal(publicView.summary_text, 'Draft summary text.');
  assert.equal(publicView.reviewed_by, undefined, 'public view must not leak reviewed_by');
  assert.equal(publicView.review_notes, undefined, 'public view must not leak review_notes');
  console.log('ok - published summary is publicly readable, admin-only fields (reviewed_by/review_notes) not leaked');

  // A second subject that stays in pending_review must not appear in the public list.
  const pendingSubjectId = await insertDummySubject('Dummy Testcase — Still Pending', {
    Education: { text: 'Placeholder position text for smoke test.' },
  });
  await generateSummary(pendingSubjectId, ['Education']);
  await submitForReview(pendingSubjectId, 'Draft awaiting review.', 'jane.steward@example.test');

  const publicList = await listPublishedSummaries();
  assert.ok(publicList.some((row) => row.subject_id === publishedSubjectId), 'published subject must appear in the public list');
  assert.ok(!publicList.some((row) => row.subject_id === pendingSubjectId), 'pending_review subject must NOT appear in the public list');
  console.log('ok - public list contains only published summaries, pending_review subject correctly excluded');

  // A rejected subject must also never appear.
  const rejectedSubjectId = await insertDummySubject('Dummy Testcase — Rejected', {
    Housing: { text: 'Placeholder position text for smoke test.' },
  });
  await generateSummary(rejectedSubjectId, ['Housing']);
  const rejSubmit = await submitForReview(rejectedSubjectId, 'Draft with issues.', 'jane.steward@example.test');
  await reviewSummary(rejectedSubjectId, 'reject', 'admin-1', 'Needs revision.');

  const publicListAfterReject = await listPublishedSummaries();
  assert.ok(!publicListAfterReject.some((row) => row.subject_id === rejectedSubjectId), 'rejected subject must NOT appear in the public list');
  const rejectedPublicView = await getPublishedSummary(rejectedSubjectId);
  assert.equal(rejectedPublicView, null, 'rejected summary must not be publicly readable');
  console.log('ok - rejected summary is excluded from both public list and public single-read');

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
