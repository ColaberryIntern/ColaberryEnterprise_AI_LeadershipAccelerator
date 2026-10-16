// Live-DB smoke test for STORY-018 (export data in multiple formats with an
// approval gate + audit trail). NOT part of `npm test`. Run manually:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     node app/services/__tests__/dataExportAgent.smoke.js
//
// Uses obviously-fake dummy subjects -- never real officeholders/candidates.
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';

const pool = require('../../db');
const { generateSummary } = require('../summaryGenerationAgent');
const { submitForReview, reviewSummary } = require('../coordinatorAgent');
const {
  requestExport, reviewExportRequest, getExportRequest, listExportRequests,
} = require('../dataExportAgent');

async function insertDummySubject(name) {
  const result = await pool.query(
    `INSERT INTO officeholders_candidates (name, office, jurisdiction, issue_positions)
     VALUES ($1, 'Dummy Office', 'Dummy Jurisdiction', $2)
     RETURNING id`,
    [name, JSON.stringify({
      Housing: { text: 'Fictional housing position for export smoke test.', sourceUrl: 'https://demo.example/export.pdf', recordType: 'Draft', retrievedAt: '2026-01-01' },
    })],
  );
  return result.rows[0].id;
}

async function run() {
  const subjectId = await insertDummySubject('Dummy Testcase — Export');
  await generateSummary(subjectId, ['Housing']);
  await submitForReview(subjectId, 'Draft summary for export smoke test.', 'human-reviewer-demo');
  await reviewSummary(subjectId, 'approve', 'admin-1', 'Approved for export smoke test.');

  // 1. Request an export -> pending, no payload yet.
  const requested = await requestExport('json', 'admin-1');
  assert.equal(requested.status, 'pending');
  const pendingRow = await getExportRequest(requested.requestId);
  assert.equal(pendingRow.export_payload, null, 'no payload should exist before approval');
  console.log('ok - requestExport creates a pending request with no payload yet');

  // 2. Reject without notes must fail (notes required on rejection).
  await assert.rejects(
    () => reviewExportRequest(requested.requestId, 'reject', 'admin-1', ''),
    (err) => err.code === 'REJECTION_REQUIRES_NOTES',
  );
  console.log('ok - reject without notes throws REJECTION_REQUIRES_NOTES');

  // 3. Reject with notes succeeds; request is terminal (cannot be reviewed again).
  const rejected = await reviewExportRequest(requested.requestId, 'reject', 'admin-1', 'Not needed right now.');
  assert.equal(rejected.status, 'rejected');
  await assert.rejects(
    () => reviewExportRequest(requested.requestId, 'approve', 'admin-1', 'too late'),
    (err) => err.code === 'INVALID_STATE_TRANSITION',
  );
  console.log('ok - reject with notes succeeds; re-reviewing a rejected request throws INVALID_STATE_TRANSITION');

  // 4. Resubmit (new request) and approve for JSON, CSV, XML, and ODBC.
  const results = {};
  for (const format of ['json', 'csv', 'xml', 'odbc']) {
    const req = await requestExport(format, 'admin-1');
    const approved = await reviewExportRequest(req.requestId, 'approve', 'admin-1', 'Approved for smoke test.');
    assert.equal(approved.status, 'exported');
    results[format] = { requestId: req.requestId, ...approved };
  }
  console.log('ok - approve succeeds for json, csv, xml, and odbc formats');

  // 5. Exported payloads are stored, non-null, and validated as expected shape.
  for (const format of ['json', 'csv', 'xml']) {
    const row = await getExportRequest(results[format].requestId);
    assert.ok(row.export_payload && row.export_payload.length > 0, `${format} export must have a non-empty payload`);
    assert.ok(row.row_count >= 1, `${format} export must have a positive row_count`);
    // Admin-only fields must never leak into an export payload.
    assert.doesNotMatch(row.export_payload, /reviewed_by|review_notes/, `${format} export must not leak admin-only fields`);
  }
  console.log('ok - json/csv/xml payloads stored, non-empty, correct row_count, no admin-only fields leaked');

  // 6. ODBC "export" is the reporting-view description, not a fabricated file.
  const odbcRow = await getExportRequest(results.odbc.requestId);
  const odbcPayload = JSON.parse(odbcRow.export_payload);
  assert.equal(odbcPayload.type, 'odbc_reporting_view');
  assert.equal(odbcPayload.view_name, 'published_summaries_report');
  assert.ok(odbcPayload.row_count >= 1);
  console.log('ok - odbc export describes the real reporting view, not a fake file');

  // 7. published_summaries_report view is directly queryable and excludes admin-only columns.
  const viewCols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'published_summaries_report'`,
  );
  const colNames = viewCols.rows.map((r) => r.column_name);
  assert.ok(!colNames.includes('reviewed_by'), 'view must not expose reviewed_by');
  assert.ok(!colNames.includes('review_notes'), 'view must not expose review_notes');
  console.log('ok - published_summaries_report view excludes admin-only columns');

  // 8. Audit trail: EXPORT_REQUESTED, EXPORT_REJECTED, EXPORT_APPROVED, DATA_EXPORTED all present.
  const auditActions = await pool.query(
    `SELECT action FROM audit_log WHERE metadata->>'export_request_id' IN ($1, $2, $3, $4, $5)`,
    [requested.requestId, results.json.requestId, results.csv.requestId, results.xml.requestId, results.odbc.requestId],
  );
  const actionSet = new Set(auditActions.rows.map((r) => r.action));
  for (const expected of ['EXPORT_REQUESTED', 'EXPORT_REJECTED', 'EXPORT_APPROVED', 'DATA_EXPORTED']) {
    assert.ok(actionSet.has(expected), `expected audit action ${expected} to be present`);
  }
  console.log('ok - audit_log contains EXPORT_REQUESTED, EXPORT_REJECTED, EXPORT_APPROVED, DATA_EXPORTED');

  // 9. listExportRequests reflects all requests made in this run.
  const list = await listExportRequests();
  const listedIds = list.map((r) => r.id);
  assert.ok(listedIds.includes(requested.requestId));
  assert.ok(listedIds.includes(results.json.requestId));
  console.log('ok - listExportRequests returns the requests made in this smoke run');

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
