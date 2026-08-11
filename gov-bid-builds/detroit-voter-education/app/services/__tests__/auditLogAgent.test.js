const assert = require('node:assert/strict');

// computeSignature/verifyAuditLogEntry both call getSigningKey() internally,
// which reads AUDIT_LOG_SIGNING_KEY -- set a throwaway hermetic key before
// requiring the module so these pure-logic tests never depend on the real
// deployment's actual secret.
process.env.AUDIT_LOG_SIGNING_KEY = '0'.repeat(64);

const { computeSignature, verifyAuditLogEntry, boundLimit } = require('../auditLogAgent');

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

// STORY-027 regression test for a real bug found while building the
// recent-actions dashboard: PostgreSQL's JSONB column does not preserve
// object key insertion order on round-trip (verified directly against a
// live DB), so a signature computed over JSON.stringify(metadata) at write
// time would never match one recomputed from a SELECT-ed row, even with
// zero tampering, unless key order is canonicalized on both paths.
test('computeSignature: identical for the same metadata regardless of key order (JSONB round-trip does not preserve insertion order)', () => {
  const a = computeSignature('session-1', 'AUDIT_LOG_ACCESS_GRANTED', { permission: 'audit_log:read', role: 'data_steward', ip: '::1', path: '/api/audit-log/recent' }, NOW);
  const b = computeSignature('session-1', 'AUDIT_LOG_ACCESS_GRANTED', { path: '/api/audit-log/recent', ip: '::1', role: 'data_steward', permission: 'audit_log:read' }, NOW);
  assert.equal(a, b);
});

test('verifyAuditLogEntry: still valid when the row\'s metadata key order differs from the order it was originally signed in', () => {
  const createdAt = new Date(NOW);
  const signature = computeSignature('session-1', 'AUDIT_LOG_ACCESS_GRANTED', { permission: 'audit_log:read', role: 'data_steward' }, NOW);
  // Simulates what a JSONB round-trip actually produces: same keys/values, different order.
  const rowAsReadBackFromDb = { session_id: 'session-1', action: 'AUDIT_LOG_ACCESS_GRANTED', metadata: { role: 'data_steward', permission: 'audit_log:read' }, created_at: createdAt, signature };
  assert.equal(verifyAuditLogEntry(rowAsReadBackFromDb), 'valid');
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

test('boundLimit: passes a normal in-range value through unchanged', () => {
  assert.equal(boundLimit(25), 25);
});

test('boundLimit: falls back to the default for missing/undefined input', () => {
  assert.equal(boundLimit(undefined), 50);
});

test('boundLimit: falls back to the default for non-numeric input', () => {
  assert.equal(boundLimit('not-a-number'), 50);
});

test('boundLimit: falls back to the default for a zero or negative value (not clamped to 1 -- a typo like ?limit=0 should not return an almost-empty list)', () => {
  assert.equal(boundLimit(0), 50);
  assert.equal(boundLimit(-10), 50);
});

test('boundLimit: clamps a value above the max down to the max', () => {
  assert.equal(boundLimit(10000), 200);
});

test('boundLimit: accepts a numeric string (query params arrive as strings)', () => {
  assert.equal(boundLimit('30'), 30);
});

console.log(`\n${passed} passed`);
