// STORY-021: quarterly accessibility verification. Orchestration only --
// the actual scan is STORY-020's axe-core suite (app/client's
// accessibility.test.js), the actual feedback channel is STORY-005's
// FeedbackForm. This module runs the suite as a child process, snapshots
// how much accessibility-tagged feedback arrived since the last audit,
// persists both, and generates a human-readable report.
//
// No CI/CD scheduling is wired up here -- per the explicit decision on this
// story, the quarterly cadence stays a manually-triggered runbook step
// (see docs/ACCESSIBILITY_AUDIT_RUNBOOK.md), not a new recurring automated
// process, since this repo has no CI/CD pipeline anywhere else in it.
const { execFile } = require('node:child_process');
const path = require('node:path');
const pool = require('../db');

const CLIENT_DIR = path.join(__dirname, '..', 'client');
const AXE_SUITE_RELATIVE_PATH = path.join('src', '__tests__', 'accessibility.test.js');
const AXE_SUITE_TIMEOUT_MS = 60000;
const MAX_STORED_OUTPUT_CHARS = 10000;

// Runs the existing axe-core suite as a real subprocess (not re-implemented
// here) and reports back on its own terms: exit code is authoritative for
// pass/fail, componentsPassed is parsed from its own "ok - ..." lines.
function runAxeSuite() {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [AXE_SUITE_RELATIVE_PATH],
      { cwd: CLIENT_DIR, timeout: AXE_SUITE_TIMEOUT_MS },
      (err, stdout, stderr) => {
        const componentsPassed = (stdout.match(/^ok - /gm) || []).length;
        resolve({
          exitCode: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
          timedOut: Boolean(err && err.killed && err.signal),
          componentsPassed,
          stdout,
          stderr,
        });
      },
    );
  });
}

async function runQuarterlyAudit(triggeredBy) {
  if (typeof triggeredBy !== 'string' || triggeredBy.trim().length === 0) {
    throw Object.assign(new Error('triggeredBy must be a non-empty string'), { code: 'INVALID_TRIGGERED_BY' });
  }

  const axeResult = await runAxeSuite();
  const status = axeResult.exitCode === 0 ? 'pass' : 'fail';

  const lastAudit = await pool.query('SELECT run_at FROM accessibility_audits ORDER BY run_at DESC LIMIT 1');
  const since = lastAudit.rows[0]?.run_at || new Date(0);

  const feedbackResult = await pool.query(
    `SELECT COUNT(*)::int AS n FROM feedback WHERE type = 'accessibility' AND created_at > $1`,
    [since],
  );
  const accessibilityFeedbackCount = feedbackResult.rows[0].n;

  const rawOutput = `${axeResult.stdout}\n${axeResult.stderr}`.slice(0, MAX_STORED_OUTPUT_CHARS);
  const notes = axeResult.timedOut
    ? `Axe suite did not complete within ${AXE_SUITE_TIMEOUT_MS}ms and was killed.`
    : null;

  const inserted = await pool.query(
    `INSERT INTO accessibility_audits
       (triggered_by, status, components_passed, accessibility_feedback_count, raw_output, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, run_at`,
    [triggeredBy, status, axeResult.componentsPassed, accessibilityFeedbackCount, rawOutput, notes],
  );

  await pool.query(
    `INSERT INTO audit_log (session_id, action, metadata)
     VALUES (NULL, 'ACCESSIBILITY_AUDIT_RUN', $1)`,
    [JSON.stringify({
      audit_id: inserted.rows[0].id,
      triggered_by: triggeredBy,
      status,
      components_passed: axeResult.componentsPassed,
      accessibility_feedback_count: accessibilityFeedbackCount,
    })],
  );

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: status === 'pass' ? 'info' : 'error',
    service: 'detroit-voter-education',
    event: 'accessibility_audit_run',
    audit_id: inserted.rows[0].id,
    status,
    components_passed: axeResult.componentsPassed,
    accessibility_feedback_count: accessibilityFeedbackCount,
    outcome: status === 'pass' ? 'success' : 'failure',
  }));

  return {
    auditId: inserted.rows[0].id,
    runAt: inserted.rows[0].run_at,
    status,
    componentsPassed: axeResult.componentsPassed,
    accessibilityFeedbackCount,
  };
}

async function getAudit(auditId) {
  const result = await pool.query('SELECT * FROM accessibility_audits WHERE id = $1', [auditId]);
  return result.rows[0] || null;
}

async function listAudits() {
  const result = await pool.query(
    `SELECT id, run_at, triggered_by, status, components_passed, accessibility_feedback_count
     FROM accessibility_audits ORDER BY run_at DESC LIMIT 50`,
  );
  return result.rows;
}

// Pure -- takes a persisted audit row, produces the human-readable
// compliance report. Deliberately does not claim WCAG 2.1 AA certification;
// see STORY-020's decision record for why an automated agent can't honestly
// make that claim.
function generateReport(audit) {
  if (!audit) {
    throw Object.assign(new Error('audit is required'), { code: 'INVALID_AUDIT' });
  }

  const statusLine = audit.status === 'pass'
    ? 'PASS -- automated scan found zero axe-core violations across all scanned components.'
    : 'FAIL -- the automated scan did not complete cleanly. See raw output for the specific violation(s).';

  return `# Quarterly Accessibility Compliance Report

**Audit ID:** ${audit.id}
**Run date:** ${new Date(audit.run_at).toISOString()}
**Triggered by:** ${audit.triggered_by}
**Status:** ${statusLine}
**Components passed:** ${audit.components_passed}
**Resident-reported accessibility issues since previous audit:** ${audit.accessibility_feedback_count}
${audit.notes ? `**Notes:** ${audit.notes}\n` : ''}
## Scope and limits (read before treating this as a compliance certificate)

This report reflects an automated axe-core scan (STORY-020) of this app's
React components' initial rendered markup, plus a count of resident-submitted
accessibility feedback (STORY-005) since the last audit. It catches missing
or invalid ARIA, missing form labels, missing accessible names, and landmark
structure problems. It does **not** verify color contrast (not evaluable
under the test's jsdom environment -- verified separately, see
decision-record-STORY-020.md), screen-reader usability, or keyboard-only
task completion. **This report does not certify full WCAG 2.1 AA
compliance** -- that requires human testing with real assistive technology.

## Next steps if status is FAIL

1. Run \`npm test\` in \`app/client/\` locally and read the axe violation detail.
2. Fix the specific violation(s) reported.
3. Re-run the quarterly audit (\`POST /api/accessibility-audits/run\`) to confirm a clean pass.

## Next steps regardless of status

Review any resident-submitted accessibility feedback via
\`GET /api/feedback?type=accessibility\` and address each report individually
-- this report's automated-check count does not substitute for reading them.
`;
}

module.exports = {
  runQuarterlyAudit, getAudit, listAudits, generateReport,
};
