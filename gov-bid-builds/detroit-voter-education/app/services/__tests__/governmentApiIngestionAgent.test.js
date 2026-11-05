const assert = require('node:assert/strict');
const {
  computeBackoffDelayMs, isCircuitOpen, recordFailure, recordSuccess, resetCircuit,
  validateFederalRegisterResponse, resolveAlertTier, CIRCUIT_FAILURE_THRESHOLD,
} = require('../governmentApiIngestionAgent');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test('backoff: doubles each attempt', () => {
  assert.equal(computeBackoffDelayMs(1, 500), 500);
  assert.equal(computeBackoffDelayMs(2, 500), 1000);
  assert.equal(computeBackoffDelayMs(3, 500), 2000);
});

test('backoff: caps at the max delay rather than growing unbounded', () => {
  const delay = computeBackoffDelayMs(20, 500);
  assert.ok(delay <= 10000, `expected capped delay, got ${delay}`);
});

test('circuit breaker: closed by default for an unseen source', () => {
  resetCircuit('test_source_a');
  assert.equal(isCircuitOpen('test_source_a'), false);
});

test('circuit breaker: opens after reaching the failure threshold', () => {
  resetCircuit('test_source_b');
  for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD - 1; i += 1) {
    recordFailure('test_source_b');
    assert.equal(isCircuitOpen('test_source_b'), false, `should still be closed after ${i + 1} failures`);
  }
  recordFailure('test_source_b');
  assert.equal(isCircuitOpen('test_source_b'), true, 'should open exactly at the threshold');
});

test('circuit breaker: a success resets the failure count', () => {
  resetCircuit('test_source_c');
  recordFailure('test_source_c');
  recordFailure('test_source_c');
  recordSuccess('test_source_c');
  recordFailure('test_source_c');
  assert.equal(isCircuitOpen('test_source_c'), false, 'one failure after a reset must not reopen the circuit');
});

test('validateFederalRegisterResponse: accepts a well-formed response', () => {
  validateFederalRegisterResponse({ results: [{ title: 'Test Document' }] });
});

test('validateFederalRegisterResponse: rejects a response missing results', () => {
  assert.throws(() => validateFederalRegisterResponse({ count: 5 }), (err) => err.code === 'VALIDATION_FAILED');
});

test('validateFederalRegisterResponse: rejects null/undefined', () => {
  assert.throws(() => validateFederalRegisterResponse(null), (err) => err.code === 'VALIDATION_FAILED');
  assert.throws(() => validateFederalRegisterResponse(undefined), (err) => err.code === 'VALIDATION_FAILED');
});

test('resolveAlertTier: a single failure stays at the routine admin tier', () => {
  assert.equal(resolveAlertTier(false), 'admin');
});

test('resolveAlertTier: a repeated/circuit-open failure escalates to senior_admin', () => {
  assert.equal(resolveAlertTier(true), 'senior_admin');
});

console.log(`\n${passed} passed`);
