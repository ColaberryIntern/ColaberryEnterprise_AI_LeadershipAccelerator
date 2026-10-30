const assert = require('node:assert/strict');
const { validatePosition } = require('../dataIngestionAgent');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test('valid position with text does not throw', () => {
  validatePosition({ text: 'Supports X.', sourceUrl: 'https://example.test', recordType: 'Fixture', retrievedAt: '2026-01-01' });
});

test('null position throws INVALID_POSITION', () => {
  assert.throws(() => validatePosition(null), (err) => err.code === 'INVALID_POSITION');
});

test('non-object position throws INVALID_POSITION', () => {
  assert.throws(() => validatePosition('just a string'), (err) => err.code === 'INVALID_POSITION');
});

test('missing text throws INVALID_POSITION', () => {
  assert.throws(() => validatePosition({ sourceUrl: 'https://example.test' }), (err) => err.code === 'INVALID_POSITION');
});

test('empty/whitespace-only text throws INVALID_POSITION', () => {
  assert.throws(() => validatePosition({ text: '   ' }), (err) => err.code === 'INVALID_POSITION');
});

console.log(`\n${passed} passed`);
