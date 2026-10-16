// Live-DB smoke test for SummaryGenerationAgent. NOT part of `npm test` (unit suite
// stays hermetic). Run manually against a throwaway Postgres instance:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     node app/services/__tests__/summaryGenerationAgent.smoke.js
//
// Uses obviously-fake dummy subjects ("Dummy Testcase") — never real officeholders/
// candidates — since this only proves the DB round-trip, not summary content quality.
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';

const pool = require('../../db');
const { generateSummary, getSummary, COVERAGE_THRESHOLD } = require('../summaryGenerationAgent');

async function insertDummySubject(name, issuePositions) {
  const result = await pool.query(
    `INSERT INTO officeholders_candidates (name, office, jurisdiction, issue_positions)
     VALUES ($1, 'Dummy Office', 'Dummy Jurisdiction', $2)
     RETURNING id`,
    [name, JSON.stringify(issuePositions)],
  );
  return result.rows[0].id;
}

async function countAuditLogRows(action, subjectId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS n FROM audit_log
     WHERE action = $1 AND (metadata->>'subject_id')::int = $2`,
    [action, subjectId],
  );
  return result.rows[0].n;
}

async function run() {
  console.log(`Coverage threshold under test: ${COVERAGE_THRESHOLD}`);

  // Case 1: full coverage -> pending_content row + SUMMARY_GENERATION_DEFERRED audit entry.
  const fullSubjectId = await insertDummySubject('Dummy Testcase — Full Coverage', {
    Housing: { text: 'Placeholder position text for smoke test.' },
    Education: { text: 'Placeholder position text for smoke test.' },
  });

  const fullResult = await generateSummary(fullSubjectId, ['Housing', 'Education']);
  assert.equal(fullResult.status, 'pending_content');
  assert.equal(fullResult.coveragePct, 1);
  assert.ok(fullResult.summaryId, 'expected a summaryId to be returned');

  const storedFull = await getSummary(fullSubjectId);
  assert.ok(storedFull, 'expected a row in summaries for the full-coverage subject');
  assert.equal(storedFull.status, 'pending_content');
  assert.equal(storedFull.summary_text, null, 'summary_text must stay NULL — no fabricated content');
  assert.equal(Number(storedFull.coverage_pct), 1);

  const deferredAuditRows = await countAuditLogRows('SUMMARY_GENERATION_DEFERRED', fullSubjectId);
  assert.equal(deferredAuditRows, 1, 'expected exactly one SUMMARY_GENERATION_DEFERRED audit row');
  console.log('ok - full coverage: pending_content row + audit log written, summary_text stayed NULL');

  // Case 2: below-threshold coverage -> no summaries row, insufficient-coverage audit entry.
  const lowSubjectId = await insertDummySubject('Dummy Testcase — Low Coverage', {
    Housing: { text: 'Placeholder position text for smoke test.' },
  });

  const lowResult = await generateSummary(lowSubjectId, ['Housing', 'Education', 'Transportation', 'Public Safety', 'Environment']);
  assert.equal(lowResult.status, 'insufficient_coverage');
  assert.equal(lowResult.coveragePct, 0.2);

  const storedLow = await getSummary(lowSubjectId);
  assert.equal(storedLow, null, 'expected no summaries row for insufficient-coverage subject');

  const insufficientAuditRows = await countAuditLogRows('SUMMARY_GENERATION_INSUFFICIENT_COVERAGE', lowSubjectId);
  assert.equal(insufficientAuditRows, 1, 'expected exactly one SUMMARY_GENERATION_INSUFFICIENT_COVERAGE audit row');
  console.log('ok - below threshold: no summaries row written, insufficient-coverage audit log written');

  // Case 3: re-running generateSummary on the same subject upserts rather than duplicating.
  const rerun = await generateSummary(fullSubjectId, ['Housing', 'Education']);
  assert.equal(rerun.summaryId, fullResult.summaryId, 'expected upsert to reuse the same summaries row');
  const countResult = await pool.query('SELECT COUNT(*)::int AS n FROM summaries WHERE subject_id = $1', [fullSubjectId]);
  assert.equal(countResult.rows[0].n, 1, 'expected exactly one summaries row after re-run (upsert, not duplicate)');
  console.log('ok - re-run upserts the existing summaries row instead of duplicating');

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
