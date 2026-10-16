const assert = require('node:assert/strict');
const { computeCoverage, COVERAGE_THRESHOLD } = require('../summaryGenerationAgent');

function withText(text) {
  return { text };
}

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test('full coverage — all selected issues present in source data', () => {
  const result = computeCoverage(
    ['Healthcare', 'Education'],
    { issuePositions: { Healthcare: withText('...'), Education: withText('...') } },
  );
  assert.equal(result.coveragePct, 1);
  assert.deepEqual(result.coveredIssues, ['Healthcare', 'Education']);
  assert.deepEqual(result.missingIssues, []);
  assert.equal(result.meetsThreshold, true);
});

test('exact threshold boundary — 80% covered meets threshold', () => {
  const result = computeCoverage(
    ['Healthcare', 'Education', 'Transportation', 'Housing', 'Environment'],
    {
      issuePositions: {
        Healthcare: withText('...'),
        Education: withText('...'),
        Transportation: withText('...'),
        Housing: withText('...'),
      },
    },
  );
  assert.equal(result.coveragePct, 0.8);
  assert.equal(result.meetsThreshold, true);
  assert.equal(COVERAGE_THRESHOLD, 0.8);
});

test('below threshold — 60% covered does not meet threshold', () => {
  const result = computeCoverage(
    ['Healthcare', 'Education', 'Transportation', 'Housing', 'Environment'],
    { issuePositions: { Healthcare: withText('...'), Education: withText('...'), Transportation: withText('...') } },
  );
  assert.equal(result.coveragePct, 0.6);
  assert.equal(result.meetsThreshold, false);
  assert.deepEqual(result.missingIssues, ['Housing', 'Environment']);
});

test('zero coverage — no issue positions at all', () => {
  const result = computeCoverage(['Healthcare'], { issuePositions: {} });
  assert.equal(result.coveragePct, 0);
  assert.equal(result.meetsThreshold, false);
});

test('missing sourceData entirely does not throw', () => {
  const result = computeCoverage(['Healthcare'], undefined);
  assert.equal(result.coveragePct, 0);
});

test('empty selectedIssues throws INVALID_ISSUES', () => {
  assert.throws(
    () => computeCoverage([], { issuePositions: {} }),
    (err) => err.code === 'INVALID_ISSUES',
  );
});

test('issue position with empty text does not count as covered', () => {
  const result = computeCoverage(['Healthcare'], { issuePositions: { Healthcare: { text: '' } } });
  assert.equal(result.coveragePct, 0);
});

console.log(`\n${passed} passed`);
