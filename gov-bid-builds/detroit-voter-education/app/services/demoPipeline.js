// Wires SummaryGenerationAgent -> summaryComposer -> CoordinatorAgent ->
// TrustGovernanceAgent end to end. Exists so seeds/demo setup can populate a
// fully published, evaluated summary in one call, giving the frontend
// something real to render without a human manually stepping through each
// stage. Demo/seed convenience only -- production would not auto-approve.
const { generateSummary } = require('./summaryGenerationAgent');
const { composeSummaryText } = require('./summaryComposer');
const { submitForReview, reviewSummary } = require('./coordinatorAgent');
const { evaluateSummary } = require('./trustGovernanceAgent');
const pool = require('../db');

async function runFullDemoPipeline(subjectId, selectedIssues, { authoredBy = 'SummaryGenerationAgent (demo auto-compose)', adminId = 'demo-admin', autoApprove = true } = {}) {
  const generated = await generateSummary(subjectId, selectedIssues);
  if (generated.status !== 'pending_content') {
    return { stage: 'generate', ...generated };
  }

  const subjectResult = await pool.query(
    `SELECT id, name, office, jurisdiction, issue_positions FROM officeholders_candidates WHERE id = $1`,
    [subjectId],
  );
  const row = subjectResult.rows[0];
  const subject = {
    name: row.name,
    office: row.office,
    jurisdiction: row.jurisdiction,
    issuePositions: row.issue_positions || {},
  };
  const summaryText = composeSummaryText(subject, selectedIssues);

  const submitted = await submitForReview(subjectId, summaryText, authoredBy);

  if (!autoApprove) {
    return { stage: 'submitted', ...submitted };
  }

  const approved = await reviewSummary(subjectId, 'approve', adminId, 'Auto-approved by demo pipeline.');
  const evaluation = await evaluateSummary(subjectId);

  return { stage: 'published_and_evaluated', ...approved, evaluation };
}

module.exports = { runFullDemoPipeline };
