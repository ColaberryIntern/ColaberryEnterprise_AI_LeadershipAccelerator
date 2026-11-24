// Live-DB smoke test for STORY-015 (data refresh -> provenance update/flag).
// NOT part of `npm test`. Run manually against a throwaway Postgres instance:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     node app/services/__tests__/dataIngestionAgent.smoke.js
//
// Uses obviously-fake dummy subjects -- never real officeholders/candidates.
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';

const pool = require('../../db');
const { generateSummary } = require('../summaryGenerationAgent');
const { submitForReview, reviewSummary, getPublishedSummary } = require('../coordinatorAgent');
const { refreshSourceData, listStaleProvenance } = require('../dataIngestionAgent');

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
  // Case 1: refreshing a PENDING_CONTENT subject's data -- no summary exists
  // to flag, refresh should succeed cleanly and just update the source row.
  const pendingSubjectId = await insertDummySubject('Dummy Testcase — Refresh Before Publish', {
    Housing: { text: 'Original position text.', sourceUrl: 'https://demo.example/v1.pdf', recordType: 'Draft', retrievedAt: '2026-01-01' },
  });
  await generateSummary(pendingSubjectId, ['Housing']);

  const refreshBeforePublish = await refreshSourceData(pendingSubjectId, 'Housing', {
    text: 'Updated position text.', sourceUrl: 'https://demo.example/v2.pdf', recordType: 'Final', retrievedAt: '2026-02-01',
  });
  assert.equal(refreshBeforePublish.staleFlagged, false, 'pending_content summary should not be flagged stale');
  assert.equal(refreshBeforePublish.oldPosition.text, 'Original position text.');
  assert.equal(refreshBeforePublish.newPosition.text, 'Updated position text.');
  console.log('ok - refresh on pending_content subject: no stale flag, old/new captured correctly');

  const subjectCheck = await pool.query('SELECT issue_positions FROM officeholders_candidates WHERE id = $1', [pendingSubjectId]);
  assert.equal(subjectCheck.rows[0].issue_positions.Housing.text, 'Updated position text.');
  console.log('ok - officeholders_candidates.issue_positions actually updated in the DB');

  // Case 2: refreshing a PUBLISHED subject's data -- must flag stale, must
  // NOT silently rewrite the live public summary or its provenance snapshot.
  const publishedSubjectId = await insertDummySubject('Dummy Testcase — Refresh After Publish', {
    Housing: { text: 'Original approved position.', sourceUrl: 'https://demo.example/original.pdf', recordType: 'Council minutes', retrievedAt: '2026-01-01' },
  });
  await generateSummary(publishedSubjectId, ['Housing']);
  await submitForReview(publishedSubjectId, 'Draft summary text about the original position.', 'human-reviewer-demo');
  await reviewSummary(publishedSubjectId, 'approve', 'admin-1', 'Approved for smoke test.');

  const beforeRefresh = await getPublishedSummary(publishedSubjectId);
  assert.equal(beforeRefresh.summary_text, 'Draft summary text about the original position.');

  const refreshAfterPublish = await refreshSourceData(publishedSubjectId, 'Housing', {
    text: 'Revised position after refresh.', sourceUrl: 'https://demo.example/revised.pdf', recordType: 'Council minutes (amended)', retrievedAt: '2026-03-01',
  });
  assert.equal(refreshAfterPublish.staleFlagged, true, 'published summary must be flagged stale');
  console.log('ok - refresh on published subject: staleFlagged=true');

  // The live public summary must be completely unchanged -- this is the core
  // guarantee: approved content never silently mutates.
  const afterRefresh = await getPublishedSummary(publishedSubjectId);
  assert.equal(afterRefresh.summary_text, beforeRefresh.summary_text, 'published summary_text must NOT change on refresh');
  console.log('ok - published summary_text is byte-for-byte unchanged after the source data refresh');

  const staleRow = await pool.query('SELECT provenance_stale FROM summaries WHERE subject_id = $1', [publishedSubjectId]);
  assert.equal(staleRow.rows[0].provenance_stale, true);
  console.log('ok - summaries.provenance_stale = true in the DB');

  const auditRows = await pool.query(
    `SELECT metadata FROM audit_log WHERE action = 'PROVENANCE_DATA_REFRESHED' AND (metadata->>'subject_id')::int = $1`,
    [publishedSubjectId],
  );
  assert.equal(auditRows.rows.length, 1);
  const meta = auditRows.rows[0].metadata;
  assert.equal(meta.old_position.text, 'Original approved position.');
  assert.equal(meta.new_position.text, 'Revised position after refresh.');
  assert.equal(meta.stale_flagged, true);
  console.log('ok - PROVENANCE_DATA_REFRESHED audit row captures full old/new diff');

  // Admin-facing stale list surfaces exactly this one summary.
  const stale = await listStaleProvenance();
  assert.ok(stale.some((row) => row.subject_id === publishedSubjectId), 'expected the published+refreshed subject in listStaleProvenance()');
  assert.ok(!stale.some((row) => row.subject_id === pendingSubjectId), 'pending_content subject was never published, must not appear');
  console.log('ok - listStaleProvenance: surfaces the published+refreshed subject, excludes the never-published one');

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
