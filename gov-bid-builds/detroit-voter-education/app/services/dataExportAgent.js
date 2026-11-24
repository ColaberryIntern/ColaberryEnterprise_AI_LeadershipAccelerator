const pool = require('../db');
const { listPublishedSummaries } = require('./coordinatorAgent');
const { formatExport, validateExport } = require('./dataExportFormatters');

const VALID_FORMATS = ['json', 'csv', 'xml', 'odbc'];

function validateFormat(format) {
  if (!VALID_FORMATS.includes(format)) {
    throw Object.assign(new Error(`format must be one of: ${VALID_FORMATS.join(', ')}`), { code: 'INVALID_FORMAT' });
  }
}

// Creates a pending export request. Nothing is exported yet -- the approval
// gate in reviewExportRequest() is the only place that generates the actual
// payload, same "decide first, act second" pattern as STORY-011.
async function requestExport(format, requestedBy) {
  validateFormat(format);
  if (typeof requestedBy !== 'string' || requestedBy.trim().length === 0) {
    throw Object.assign(new Error('requestedBy must be a non-empty string'), { code: 'INVALID_REQUESTED_BY' });
  }

  const inserted = await pool.query(
    `INSERT INTO export_requests (format, requested_by) VALUES ($1, $2) RETURNING id, requested_at`,
    [format, requestedBy],
  );
  const requestId = inserted.rows[0].id;

  await pool.query(
    `INSERT INTO audit_log (session_id, action, metadata)
     VALUES (NULL, 'EXPORT_REQUESTED', $1)`,
    [JSON.stringify({ export_request_id: requestId, format, requested_by: requestedBy })],
  );

  return { requestId, format, status: 'pending', requestedAt: inserted.rows[0].requested_at };
}

// ODBC has no file payload -- see the published_summaries_report view
// comment in schema.sql. This documents the real deliverable (view name +
// how to connect) rather than fabricating a fake "ODBC file".
async function buildOdbcExportDescription() {
  const countResult = await pool.query('SELECT COUNT(*)::int AS n FROM published_summaries_report');
  return JSON.stringify({
    type: 'odbc_reporting_view',
    view_name: 'published_summaries_report',
    connection_note: 'Any standard PostgreSQL ODBC driver can connect using the platform DATABASE_URL and query this read-only view directly. No file is generated for ODBC -- this is a live, read-only reporting surface, per RFP STD-004/STD-001.',
    row_count: countResult.rows[0].n,
  }, null, 2);
}

async function reviewExportRequest(requestId, decision, adminId, notes) {
  if (decision !== 'approve' && decision !== 'reject') {
    throw Object.assign(new Error("decision must be 'approve' or 'reject'"), { code: 'INVALID_DECISION' });
  }
  if (typeof adminId !== 'string' || adminId.trim().length === 0) {
    throw Object.assign(new Error('adminId must be a non-empty string'), { code: 'INVALID_ADMIN_ID' });
  }
  if (decision === 'reject' && (typeof notes !== 'string' || notes.trim().length === 0)) {
    throw Object.assign(new Error('notes are required when rejecting an export request'), { code: 'REJECTION_REQUIRES_NOTES' });
  }

  const existing = await pool.query(`SELECT id, format, status FROM export_requests WHERE id = $1`, [requestId]);
  if (existing.rows.length === 0) {
    throw Object.assign(new Error('No export request found for this id'), { code: 'EXPORT_REQUEST_NOT_FOUND' });
  }
  const { format, status } = existing.rows[0];
  if (status !== 'pending') {
    throw Object.assign(new Error(`Cannot review an export request in status '${status}' -- must be pending`), { code: 'INVALID_STATE_TRANSITION', currentStatus: status });
  }

  if (decision === 'reject') {
    await pool.query(
      `UPDATE export_requests SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2 WHERE id = $3`,
      [adminId, notes, requestId],
    );
    await pool.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES (NULL, 'EXPORT_REJECTED', $1)`,
      [JSON.stringify({ export_request_id: requestId, admin_id: adminId, notes })],
    );
    return { requestId, status: 'rejected' };
  }

  // Approved: generate the payload now, validate it, then store.
  let payload;
  let rowCount;

  if (format === 'odbc') {
    payload = await buildOdbcExportDescription();
    rowCount = JSON.parse(payload).row_count;
  } else {
    const rows = await listPublishedSummaries();
    payload = formatExport(format, rows);
    validateExport(format, payload, rows.length); // throws SCHEMA_VALIDATION_FAILED if malformed -- approval does not proceed on a bad export
    rowCount = rows.length;
  }

  await pool.query(
    `UPDATE export_requests
       SET status = 'exported', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2,
           export_payload = $3, row_count = $4
     WHERE id = $5`,
    [adminId, notes || null, payload, rowCount, requestId],
  );

  await pool.query(
    `INSERT INTO audit_log (session_id, action, metadata)
     VALUES (NULL, 'EXPORT_APPROVED', $1)`,
    [JSON.stringify({ export_request_id: requestId, admin_id: adminId, notes: notes || null })],
  );
  await pool.query(
    `INSERT INTO audit_log (session_id, action, metadata)
     VALUES (NULL, 'DATA_EXPORTED', $1)`,
    [JSON.stringify({ export_request_id: requestId, format, row_count: rowCount })],
  );

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'detroit-voter-education',
    event: 'data_exported',
    export_request_id: requestId,
    format,
    row_count: rowCount,
    outcome: 'success',
  }));

  return { requestId, status: 'exported', format, rowCount };
}

async function getExportRequest(requestId) {
  const result = await pool.query(`SELECT * FROM export_requests WHERE id = $1`, [requestId]);
  return result.rows[0] || null;
}

async function listExportRequests() {
  const result = await pool.query(
    `SELECT id, format, status, requested_by, reviewed_by, row_count, requested_at, reviewed_at
     FROM export_requests ORDER BY requested_at DESC LIMIT 50`,
  );
  return result.rows;
}

module.exports = { requestExport, reviewExportRequest, getExportRequest, listExportRequests, VALID_FORMATS };
