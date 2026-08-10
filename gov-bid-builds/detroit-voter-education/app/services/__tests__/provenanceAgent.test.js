const assert = require('node:assert/strict');
const { formatProvenanceTrail } = require('../provenanceAgent');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const sourceDataRef = {
  issuePositions: {
    Housing: { text: 'Supports X.', sourceUrl: 'https://demo.example/housing.pdf', recordType: 'Council minutes', retrievedAt: '2026-03-14' },
    Education: { text: 'Backs Y.', sourceUrl: 'https://demo.example/education.pdf', recordType: 'Budget testimony', retrievedAt: '2026-04-02' },
  },
};

test('returns one trail entry per covered issue with text', () => {
  const trail = formatProvenanceTrail(sourceDataRef, ['Housing', 'Education']);
  assert.equal(trail.length, 2);
  assert.equal(trail[0].issue, 'Housing');
  assert.equal(trail[0].sourceUrl, 'https://demo.example/housing.pdf');
  assert.equal(trail[0].recordType, 'Council minutes');
  assert.equal(trail[0].retrievedAt, '2026-03-14');
});

test('filters to only issuesCovered, even if source has more', () => {
  const trail = formatProvenanceTrail(sourceDataRef, ['Housing']);
  assert.equal(trail.length, 1);
  assert.equal(trail[0].issue, 'Housing');
});

test('skips an issue with no text, even if listed in issuesCovered', () => {
  const trail = formatProvenanceTrail(sourceDataRef, ['Housing', 'Transportation']);
  assert.equal(trail.length, 1);
});

test('missing sourceUrl/recordType/retrievedAt degrade gracefully, not crash', () => {
  const legacyRef = { issuePositions: { Housing: { text: 'Supports X.' } } };
  const trail = formatProvenanceTrail(legacyRef, ['Housing']);
  assert.equal(trail.length, 1);
  assert.equal(trail[0].sourceUrl, null);
  assert.equal(trail[0].recordType, 'Unspecified record type');
  assert.equal(trail[0].retrievedAt, null);
});

test('missing sourceDataRef entirely returns an empty trail, not a crash', () => {
  const trail = formatProvenanceTrail(null, ['Housing']);
  assert.deepEqual(trail, []);
});

test('missing issuesCovered falls back to all issues in source data', () => {
  const trail = formatProvenanceTrail(sourceDataRef, undefined);
  assert.equal(trail.length, 2);
});

console.log(`\n${passed} passed`);
