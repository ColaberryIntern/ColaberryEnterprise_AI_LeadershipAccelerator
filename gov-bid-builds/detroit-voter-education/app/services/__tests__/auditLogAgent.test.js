const assert = require('node:assert/strict');

// computeSignature/verifyAuditLogEntry both call getSigningKey() internally,
// which reads AUDIT_LOG_SIGNING_KEY -- set a throwaway hermetic key before
// requiring the module so these pure-logic tests never depend on the real
// deployment's actual secret.
process.env.AUDIT_LOG_SIGNING_KEY = '0'.repeat(64);

const { computeSignature, verifyAuditLogEntry } = require('../auditLogAgent');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const NOW = '2026-08-11T12:00:00.000Z';

test('computeSignature: deterministic for identical inputs', () => {
  const a = computeSignature('session-1', 'FEEDBACK_SUBMITTED', { feedback_id: 1 }, NOW);
  const b = computeSignature('session-1', 'FEEDBACK_SUBMITTED', { feedback_id: 1 }, NOW);
  assert.equal(a, b);
});

test('computeSignature: changes if the action changes', () => {
  const a = computeSignature('session-1', 'FEEDBACK_SUBMITTED', { feedback_id: 1 }, NOW);
  const b = computeSignature('session-1', 'FEEDBACK_REVIEWED', { feedback_id: 1 }, NOW);
  assert.notEqual(a, b);
});

test('computeSignature: changes if metadata changes', () => {
  const a = computeSignature('session-1', 'FEEDBACK_SUBMITTED', { feedback_id: 1 }, NOW);
  const b = computeSignature('session-1', 'FEEDBACK_SUBMITTED', { feedback_id: 2 }, NOW);
  assert.notEqual(a, b);
});

test('computeSignature: changes if the timestamp changes', () => {
  const a = computeSignature('session-1', 'FEEDBACK_SUBMITTED', { feedback_id: 1 }, NOW);
  const b = computeSignature('session-1', 'FEEDBACK_SUBMITTED', { feedback_id: 1 }, '2026-08-11T12:00:01.000Z');
  assert.notEqual(a, b);
});

test('verifyAuditLogEntry: returns "valid" for an untampered row', () => {
  const createdAt = new Date(NOW);
  const signature = computeSignature('session-1', 'FEEDBACK_SUBMITTED', { feedback_id: 1 }, NOW);
  const row = { session_id: 'session-1', action: 'FEEDBACK_SUBMITTED', metadata: { feedback_id: 1 }, created_at: createdAt, signature };
  assert.equal(verifyAuditLogEntry(row), 'valid');
});

test('verifyAuditLogEntry: returns "invalid" if the action was tampered with after signing', () => {
  const createdAt = new Date(NOW);
  const signature = computeSignature('session-1', 'FEEDBACK_SUBMITTED', { feedback_id: 1 }, NOW);
  const tamperedRow = { session_id: 'session-1', action: 'FEEDBACK_REVIEWED', metadata: { feedback_id: 1 }, created_at: createdAt, signature };
  assert.equal(verifyAuditLogEntry(tamperedRow), 'invalid');
});

test('verifyAuditLogEntry: returns "invalid" if metadata was tampered with after signing', () => {
  const createdAt = new Date(NOW);
  const signature = computeSignature('session-1', 'FEEDBACK_SUBMITTED', { feedback_id: 1 }, NOW);
  const tamperedRow = { session_id: 'session-1', action: 'FEEDBACK_SUBMITTED', metadata: { feedback_id: 999 }, created_at: createdAt, signature };
  assert.equal(verifyAuditLogEntry(tamperedRow), 'invalid');
});

test('verifyAuditLogEntry: returns "unsigned" for a legacy row with no signature', () => {
  const row = { session_id: 'session-1', action: 'DATA_INGESTED', metadata: null, created_at: new Date(NOW), signature: null };
  assert.equal(verifyAuditLogEntry(row), 'unsigned');
});

console.log(`\n${passed} passed`);
