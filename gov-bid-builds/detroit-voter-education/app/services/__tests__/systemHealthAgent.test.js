const assert = require('node:assert/strict');
const { deriveOverallStatus } = require('../systemHealthAgent');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test('deriveOverallStatus: healthy when DB is up, fast, and error count is low', () => {
  assert.equal(deriveOverallStatus({ status: 'up', latencyMs: 10 }, 0), 'healthy');
});

test('deriveOverallStatus: down when the database is down, regardless of error count', () => {
  assert.equal(deriveOverallStatus({ status: 'down', latencyMs: 9999 }, 0), 'down');
});

test('deriveOverallStatus: degraded when DB latency exceeds the threshold', () => {
  assert.equal(deriveOverallStatus({ status: 'up', latencyMs: 501 }, 0), 'degraded');
});

test('deriveOverallStatus: degraded when recent error count exceeds the threshold', () => {
  assert.equal(deriveOverallStatus({ status: 'up', latencyMs: 10 }, 11), 'degraded');
});

test('deriveOverallStatus: healthy exactly at the latency threshold boundary (not over it)', () => {
  assert.equal(deriveOverallStatus({ status: 'up', latencyMs: 500 }, 0), 'healthy');
});

test('deriveOverallStatus: healthy exactly at the error-count threshold boundary (not over it)', () => {
  assert.equal(deriveOverallStatus({ status: 'up', latencyMs: 10 }, 10), 'healthy');
});

console.log(`\n${passed} passed`);
