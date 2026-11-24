const assert = require('node:assert/strict');
const {
  computeAccuracyScore, computeBiasScore, ACCURACY_THRESHOLD, BIAS_THRESHOLD,
} = require('../trustGovernanceAgent');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test('thresholds match STORY-013 acceptance criteria', () => {
  assert.equal(ACCURACY_THRESHOLD, 0.85);
  assert.equal(BIAS_THRESHOLD, 0.10);
});

test('accuracy: summary built entirely from source text scores 1.0', () => {
  const source = 'Supports expanding the affordable housing tax credit program citywide';
  const summary = 'Supports expanding the affordable housing tax credit program citywide';
  const result = computeAccuracyScore(summary, source);
  assert.equal(result.accuracyScore, 1);
});

test('accuracy: summary with invented content words not in source scores lower', () => {
  const source = 'Supports expanding the affordable housing program';
  const summary = 'Supports banning all housing construction immediately forever';
  const result = computeAccuracyScore(summary, source);
  assert.ok(result.accuracyScore < 0.5, `expected low grounding, got ${result.accuracyScore}`);
});

test('accuracy: empty summary scores 0, not NaN or a crash', () => {
  const result = computeAccuracyScore('', 'some source text');
  assert.equal(result.accuracyScore, 0);
});

test('accuracy: stopwords do not inflate the grounding score', () => {
  const source = 'candidate positions housing';
  const summary = 'the a is on in of to for and this that';
  const result = computeAccuracyScore(summary, source);
  assert.equal(result.totalContentWords, 0, 'an all-stopword summary should have zero content words counted');
});

test('bias: neutral text scores 0', () => {
  const result = computeBiasScore('Supports expanding the affordable housing tax credit program.');
  assert.equal(result.biasScore, 0);
  assert.deepEqual(result.flaggedWords, []);
});

test('bias: loaded language is flagged and scored', () => {
  const result = computeBiasScore('This corrupt and dangerous candidate is obviously the worst choice ever.');
  assert.ok(result.biasScore > 0);
  assert.ok(result.flaggedWords.includes('corrupt'));
  assert.ok(result.flaggedWords.includes('dangerous'));
  assert.ok(result.flaggedWords.includes('obviously'));
  assert.ok(result.flaggedWords.includes('worst'));
});

test('accuracy: extraStopwords excludes structural labels (issue names, subject name) from grounding', () => {
  const source = 'Supports expanding the affordable housing program';
  const summary = 'Dummy Testcase has taken a position on Housing: Supports expanding the affordable housing program';
  const withoutExtra = computeAccuracyScore(summary, source);
  // Real caller (evaluateSummary) pre-splits multi-word names/issues on whitespace
  // before passing them in -- extraStopwords is a flat list of individual words.
  const withExtra = computeAccuracyScore(summary, source, ['Housing', 'Dummy', 'Testcase']);
  assert.ok(withExtra.accuracyScore > withoutExtra.accuracyScore, 'excluding structural labels should raise the grounding score, not lower it');
  assert.equal(withExtra.accuracyScore, 1, 'once structural labels are excluded, the remaining claim words should be fully grounded');
});

test('bias: empty text scores 0, not NaN or a crash', () => {
  const result = computeBiasScore('');
  assert.equal(result.biasScore, 0);
});

console.log(`\n${passed} passed`);
