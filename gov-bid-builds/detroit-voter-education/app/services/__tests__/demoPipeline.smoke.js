// Live-DB smoke test for the full demo pipeline (STORY-010 compose ->
// STORY-011 review -> STORY-012 publish -> STORY-013 evaluate), run end to
// end via runFullDemoPipeline(), same as seeds/index.js does. NOT part of
// `npm test`. Run manually against a throwaway Postgres instance:
//   DATABASE_URL=postgres://postgres:password@localhost:5433/detroit_voter_education \
//     node app/services/__tests__/demoPipeline.smoke.js
//
// Subjects are entirely fictional demo data -- never real officeholders/candidates.
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://postgres:password@localhost:5433/detroit_voter_education';

const pool = require('../../db');
const { runFullDemoPipeline } = require('../demoPipeline');
const { getPublishedSummary } = require('../coordinatorAgent');
const { getGovernanceScore, ACCURACY_THRESHOLD, BIAS_THRESHOLD } = require('../trustGovernanceAgent');

async function insertDummySubject(name, issuePositions) {
  const result = await pool.query(
    `INSERT INTO officeholders_candidates (name, office, jurisdiction, issue_positions)
     VALUES ($1, 'Fictional Demo Office', 'Fictional Demo District', $2)
     RETURNING id`,
    [name, JSON.stringify(issuePositions)],
  );
  return result.rows[0].id;
}

async function run() {
  const subjectId = await insertDummySubject('Dummy Testcase — Full Pipeline', {
    Housing: { text: 'Supports expanding the affordable housing tax credit program citywide.' },
    Education: { text: 'Backs increased per pupil funding for neighborhood schools.' },
  });

  const result = await runFullDemoPipeline(subjectId, ['Housing', 'Education']);
  assert.equal(result.stage, 'published_and_evaluated');
  assert.equal(result.status, 'published');
  console.log('ok - runFullDemoPipeline: generate -> compose -> submit -> approve -> publish -> evaluate, one call');

  // Published content is visible on the resident-facing public API.
  const publicView = await getPublishedSummary(subjectId);
  assert.ok(publicView, 'expected published summary to be publicly readable');
  assert.match(publicView.summary_text, /Dummy Testcase — Full Pipeline/);
  assert.match(publicView.summary_text, /affordable housing tax credit/);
  console.log('ok - composed summary text is grounded in source data and publicly visible');

  // The evaluation used real computed scores, not hardcoded numbers -- assert
  // they land where the neutral, source-grounded composer text should land.
  assert.ok(result.evaluation.accuracyScore >= ACCURACY_THRESHOLD, `expected accuracy >= ${ACCURACY_THRESHOLD}, got ${result.evaluation.accuracyScore}`);
  assert.ok(result.evaluation.biasScore < BIAS_THRESHOLD, `expected bias < ${BIAS_THRESHOLD}, got ${result.evaluation.biasScore}`);
  assert.equal(result.evaluation.meetsThreshold, true);
  console.log(`ok - evaluation: accuracy=${result.evaluation.accuracyScore.toFixed(2)} bias=${result.evaluation.biasScore.toFixed(2)} meetsThreshold=${result.evaluation.meetsThreshold} (computed, not hardcoded)`);

  const evalRows = await pool.query('SELECT * FROM governance_evaluations WHERE summary_id = $1', [result.id]);
  assert.equal(evalRows.rows.length, 1, 'expected exactly one governance_evaluations row');
  assert.equal(evalRows.rows[0].method, 'heuristic_demo_v1');

  const auditRows = await pool.query(
    `SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'SUMMARY_EVALUATED' AND (metadata->>'summary_id')::int = $1`,
    [result.id],
  );
  assert.equal(auditRows.rows[0].n, 1, 'expected exactly one SUMMARY_EVALUATED audit row');
  console.log('ok - governance_evaluations row + SUMMARY_EVALUATED audit row written');

  // A second subject with an obviously biased/unsupported summary should fail evaluation
  // if evaluated directly (not composed by summaryComposer -- simulating hand-authored content).
  const { submitForReview, reviewSummary } = require('../coordinatorAgent');
  const { generateSummary } = require('../summaryGenerationAgent');
  const { evaluateSummary } = require('../trustGovernanceAgent');

  const biasedSubjectId = await insertDummySubject('Dummy Testcase — Biased Content', {
    Housing: { text: 'Supports expanding the affordable housing tax credit program.' },
  });
  await generateSummary(biasedSubjectId, ['Housing']);
  await submitForReview(
    biasedSubjectId,
    'This corrupt and dangerous candidate is obviously the worst choice ever, everyone knows it.',
    'human-reviewer-demo',
  );
  await reviewSummary(biasedSubjectId, 'approve', 'admin-1', 'Approved for smoke test.');
  const biasedEval = await evaluateSummary(biasedSubjectId);
  assert.ok(biasedEval.biasScore >= BIAS_THRESHOLD, `expected loaded language to score >= ${BIAS_THRESHOLD} bias, got ${biasedEval.biasScore}`);
  assert.equal(biasedEval.meetsThreshold, false);
  console.log(`ok - hand-authored biased text correctly scores above the bias threshold (biasScore=${biasedEval.biasScore.toFixed(2)}), meetsThreshold=false`);

  // getGovernanceScore aggregate reflects both evaluations.
  const score = await getGovernanceScore();
  assert.equal(score.evaluatedCount, 2);
  assert.equal(score.passingCount, 1, 'only the source-grounded, neutral summary should pass');
  console.log(`ok - getGovernanceScore: evaluated=${score.evaluatedCount} passing=${score.passingCount} coverage=${(score.evaluationCoveragePct * 100).toFixed(0)}%`);

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
