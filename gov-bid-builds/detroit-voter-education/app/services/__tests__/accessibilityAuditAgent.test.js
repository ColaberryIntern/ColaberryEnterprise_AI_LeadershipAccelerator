const assert = require('node:assert/strict');
const { generateReport } = require('../accessibilityAuditAgent');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const PASS_AUDIT = {
  id: 1,
  run_at: '2026-08-10T12:00:00.000Z',
  triggered_by: 'admin-1',
  status: 'pass',
  components_passed: 6,
  accessibility_feedback_count: 0,
  notes: null,
};

const FAIL_AUDIT = {
  id: 2,
  run_at: '2026-08-10T13:00:00.000Z',
  triggered_by: 'admin-1',
  status: 'fail',
  components_passed: 3,
  accessibility_feedback_count: 2,
  notes: null,
};

test('generateReport: pass status renders a clean-scan summary', () => {
  const report = generateReport(PASS_AUDIT);
  assert.match(report, /PASS -- automated scan found zero axe-core violations/);
  assert.match(report, /Components passed:\*\* 6/);
});

test('generateReport: fail status renders remediation next steps', () => {
  const report = generateReport(FAIL_AUDIT);
  assert.match(report, /FAIL -- the automated scan did not complete cleanly/);
  assert.match(report, /Next steps if status is FAIL/);
});

test('generateReport: never claims full WCAG 2.1 AA certification', () => {
  const report = generateReport(PASS_AUDIT);
  assert.match(report, /does not certify full WCAG 2\.1 AA\s+compliance/);
});

test('generateReport: surfaces the accessibility-feedback count regardless of status', () => {
  const report = generateReport(FAIL_AUDIT);
  assert.match(report, /Resident-reported accessibility issues since previous audit:\*\* 2/);
});

test('generateReport: includes notes when present', () => {
  const report = generateReport({ ...PASS_AUDIT, notes: 'Ran late due to a slow CI agent.' });
  assert.match(report, /Notes:\*\* Ran late due to a slow CI agent\./);
});

test('generateReport: throws INVALID_AUDIT on a missing audit', () => {
  assert.throws(() => generateReport(null), (err) => err.code === 'INVALID_AUDIT');
});

console.log(`\n${passed} passed`);
