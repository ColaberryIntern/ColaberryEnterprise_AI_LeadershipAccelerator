const pool = require('../db');

const COVERAGE_THRESHOLD = 0.8;

function computeCoverage(selectedIssues, sourceData) {
  if (!Array.isArray(selectedIssues) || selectedIssues.length === 0) {
    throw Object.assign(new Error('selectedIssues must be a non-empty array'), { code: 'INVALID_ISSUES' });
  }

  const positions = sourceData?.issuePositions || {};
  const coveredIssues = selectedIssues.filter((issue) => Boolean(positions[issue]?.text));
  const missingIssues = selectedIssues.filter((issue) => !coveredIssues.includes(issue));
  const coveragePct = coveredIssues.length / selectedIssues.length;

  return {
    coveragePct,
    coveredIssues,
    missingIssues,
    meetsThreshold: coveragePct >= COVERAGE_THRESHOLD,
  };
}

async function retrieveSourceData(subjectId) {
  const result = await pool.query(
    `SELECT id, name, office, jurisdiction, issue_positions
     FROM officeholders_candidates WHERE id = $1`,
    [subjectId],
  );
  if (result.rows.length === 0) {
    throw Object.assign(new Error('Officeholder/candidate not found'), { code: 'SUBJECT_NOT_FOUND' });
  }

  const row = result.rows[0];
  return {
    subjectId: row.id,
    name: row.name,
    office: row.office,
    jurisdiction: row.jurisdiction,
    issuePositions: row.issue_positions || {},
  };
}

// Deliberately NOT implemented: turning covered source data into summary prose.
// STORY-010 is flagged human_required — generating claims about real officeholders
// and candidates without a verified, citable data source risks fabricating content
// about real people. This function only proves coverage against real source data
// that a human/steward has entered into officeholders_candidates.issue_positions;
// actual summary authoring is a separate, explicitly human-reviewed step.
async function generateSummary(subjectId, selectedIssues) {
  const sourceData = await retrieveSourceData(subjectId);
  const coverage = computeCoverage(selectedIssues, sourceData);

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    if (!coverage.meetsThreshold) {
      await client.query(
        `INSERT INTO audit_log (session_id, action, metadata)
         VALUES (NULL, 'SUMMARY_GENERATION_INSUFFICIENT_COVERAGE', $1)`,
        [JSON.stringify({
          subject_id: subjectId,
          coverage_pct: coverage.coveragePct,
          missing_issues: coverage.missingIssues,
          generated_by: 'SummaryGenerationAgent',
        })],
      );
      await client.query('COMMIT');
      return {
        status: 'insufficient_coverage',
        coveragePct: coverage.coveragePct,
        missingIssues: coverage.missingIssues,
      };
    }

    await client.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES (NULL, 'SUMMARY_GENERATION_DEFERRED', $1)`,
      [JSON.stringify({
        subject_id: subjectId,
        coverage_pct: coverage.coveragePct,
        covered_issues: coverage.coveredIssues,
        generated_by: 'SummaryGenerationAgent',
        reason: 'content_generation_requires_human_review',
      })],
    );

    const result = await client.query(
      `INSERT INTO summaries (subject_id, issues_covered, coverage_pct, summary_text, status, generated_by, source_data_ref)
       VALUES ($1, $2, $3, NULL, 'pending_content', 'SummaryGenerationAgent', $4)
       ON CONFLICT (subject_id) DO UPDATE
         SET issues_covered = $2, coverage_pct = $3, status = 'pending_content',
             source_data_ref = $4, updated_at = NOW()
       RETURNING id`,
      [
        subjectId,
        JSON.stringify(coverage.coveredIssues),
        coverage.coveragePct,
        JSON.stringify({ issuePositions: sourceData.issuePositions }),
      ],
    );

    await client.query('COMMIT');

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'detroit-voter-education',
      event: 'summary_generation_deferred',
      subject_id: subjectId,
      coverage_pct: coverage.coveragePct,
      outcome: 'success',
    }));

    return {
      status: 'pending_content',
      summaryId: result.rows[0].id,
      coveragePct: coverage.coveragePct,
      coveredIssues: coverage.coveredIssues,
    };
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    throw err;
  } finally {
    client?.release();
  }
}

async function getSummary(subjectId) {
  const result = await pool.query(
    `SELECT s.id, s.subject_id, s.issues_covered, s.coverage_pct, s.summary_text, s.status,
            s.generated_by, s.source_data_ref, s.created_at, s.updated_at,
            o.name, o.office, o.jurisdiction
     FROM summaries s
     JOIN officeholders_candidates o ON o.id = s.subject_id
     WHERE s.subject_id = $1`,
    [subjectId],
  );
  return result.rows[0] || null;
}

module.exports = { computeCoverage, retrieveSourceData, generateSummary, getSummary, COVERAGE_THRESHOLD };
