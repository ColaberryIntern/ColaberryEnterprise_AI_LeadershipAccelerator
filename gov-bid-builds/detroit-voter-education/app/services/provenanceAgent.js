const pool = require('../db');

// Reuses summaries.source_data_ref (captured by SummaryGenerationAgent at
// generation time, STORY-010) instead of a separate provenance table -- it
// already stores exactly the {issuePositions: {...}} linkage a provenance
// trail needs, and a second table would just re-derive the same data from a
// second source of truth. sourceUrl/recordType/retrievedAt are demo-data
// fields (see seeds/index.js) -- fictional subjects, fictional but
// structurally-real-shaped source citations.
function formatProvenanceTrail(sourceDataRef, issuesCovered) {
  const issuePositions = sourceDataRef?.issuePositions || {};
  const covered = Array.isArray(issuesCovered) ? issuesCovered : Object.keys(issuePositions);

  return covered
    .filter((issue) => issuePositions[issue]?.text)
    .map((issue) => ({
      issue,
      text: issuePositions[issue].text,
      sourceUrl: issuePositions[issue].sourceUrl || null,
      recordType: issuePositions[issue].recordType || 'Unspecified record type',
      retrievedAt: issuePositions[issue].retrievedAt || null,
    }));
}

// Only ever reads a status='published' summary -- same public-read safety
// guarantee as coordinatorAgent's getPublishedSummary/listPublishedSummaries
// (STORY-012). A pending_review or rejected summary's provenance is never
// exposed through this function.
async function getProvenanceTrail(subjectId, sessionId = null) {
  const result = await pool.query(
    `SELECT s.id, s.source_data_ref, s.issues_covered
     FROM summaries s
     WHERE s.subject_id = $1 AND s.status = 'published'`,
    [subjectId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const { id: summaryId, source_data_ref: sourceDataRef, issues_covered: issuesCovered } = result.rows[0];
  const trail = formatProvenanceTrail(sourceDataRef, issuesCovered);

  await pool.query(
    `INSERT INTO audit_log (session_id, action, metadata)
     VALUES ($1, 'SUMMARY_PROVENANCE_VIEWED', $2)`,
    [sessionId, JSON.stringify({ summary_id: summaryId, subject_id: subjectId, entry_count: trail.length })],
  );

  return { subjectId, summaryId, trail };
}

module.exports = { formatProvenanceTrail, getProvenanceTrail };
