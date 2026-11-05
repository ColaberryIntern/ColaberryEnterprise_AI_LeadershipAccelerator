// Live-DB smoke test for STORY-021. NOT part of `npm test`. Run manually:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     node app/services/__tests__/accessibilityAuditAgent.smoke.js
//
// Runs the REAL STORY-020 axe-core suite as a real child process (not
// mocked) -- genuine confidence the whole chain works, not just this
// module's DB plumbing. Requires app/client's devDependencies to be
// installed (npm install in app/client) since the spawned suite needs
// axe-core/jsdom/esbuild/react.
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';

const pool = require('../../db');
const {
  runQuarterlyAudit, getAudit, listAudits, generateReport,
} = require('../accessibilityAuditAgent');

async function insertAccessibilityFeedback(message) {
  const result = await pool.query(
    `INSERT INTO feedback (type, message) VALUES ('accessibility', $1) RETURNING id, created_at`,
    [message],
  );
  return result.rows[0];
}

async function run() {
  // --- First audit: no prior audit exists, so "since" is epoch -- picks up
  // all-time accessibility feedback. ---
  await insertAccessibilityFeedback('Screen reader users report the ZIP field label reads oddly.');
  await insertAccessibilityFeedback('Focus ring hard to see on the submit button.');

  const first = await runQuarterlyAudit('smoke-test-admin');
  assert.equal(first.status, 'pass', `expected the real STORY-020 suite to pass cleanly; got status=${first.status}`);
  assert.ok(first.componentsPassed >= 6, `expected at least 6 components to pass, got ${first.componentsPassed}`);
  assert.equal(first.accessibilityFeedbackCount, 2, 'first audit should count all-time accessibility feedback (no prior audit to bound "since")');
  console.log(`ok - first audit: status=${first.status}, componentsPassed=${first.componentsPassed}, accessibilityFeedbackCount=${first.accessibilityFeedbackCount}`);

  const persisted = await getAudit(first.auditId);
  assert.equal(persisted.status, 'pass');
  assert.ok(persisted.raw_output && persisted.raw_output.length > 0, 'raw_output must capture the real suite output for triage');
  console.log('ok - audit row persisted with real captured suite output');

  const auditLogRow = await pool.query(
    `SELECT * FROM audit_log WHERE action = 'ACCESSIBILITY_AUDIT_RUN' AND (metadata->>'audit_id')::int = $1`,
    [first.auditId],
  );
  assert.equal(auditLogRow.rows.length, 1);
  console.log('ok - ACCESSIBILITY_AUDIT_RUN audit_log entry written');

  const report = generateReport(persisted);
  assert.match(report, /PASS -- automated scan found zero axe-core violations/);
  assert.match(report, /Resident-reported accessibility issues since previous audit:\*\* 2/);
  console.log('ok - generateReport produces a report reflecting the real persisted audit');

  // --- Second audit: new feedback arrives after the first audit; "since"
  // should now be bounded by the first audit's run_at, not all-time. ---
  await insertAccessibilityFeedback('Table headers not announced correctly by screen reader.');

  const second = await runQuarterlyAudit('smoke-test-admin');
  assert.equal(second.accessibilityFeedbackCount, 1, 'second audit should only count feedback submitted since the first audit, not all-time');
  console.log(`ok - second audit correctly bounds the feedback count to "since previous audit" (got ${second.accessibilityFeedbackCount})`);

  const history = await listAudits();
  const historyIds = history.map((a) => a.id);
  assert.ok(historyIds.includes(first.auditId) && historyIds.includes(second.auditId));
  assert.ok(history[0].run_at >= history[1].run_at, 'listAudits should be ordered most-recent-first');
  console.log('ok - listAudits returns both audits, most-recent-first');

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
