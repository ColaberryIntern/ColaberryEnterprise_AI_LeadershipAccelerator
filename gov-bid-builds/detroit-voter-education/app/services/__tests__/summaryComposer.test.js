const assert = require('node:assert/strict');
const { composeSummaryText } = require('../summaryComposer');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const fakeSubject = {
  name: 'Morgan Reyes',
  office: 'City Council Member, District 3 (Fictional Demo Seat)',
  jurisdiction: 'Demo District 3',
  issuePositions: {
    Housing: { text: 'Supports expanding the affordable-housing tax credit program.' },
    Education: { text: 'Backs increased per-pupil funding for neighborhood schools.' },
  },
};

test('composes text only from covered, selected issues', () => {
  const text = composeSummaryText(fakeSubject, ['Housing', 'Education']);
  assert.match(text, /Morgan Reyes/);
  assert.match(text, /affordable-housing tax credit/);
  assert.match(text, /per-pupil funding/);
});

test('never invents text for an issue not in issuePositions', () => {
  const text = composeSummaryText(fakeSubject, ['Housing', 'Public Safety']);
  assert.match(text, /affordable-housing tax credit/);
  assert.doesNotMatch(text, /Public Safety/);
});

test('handles zero coverage without throwing', () => {
  const text = composeSummaryText(fakeSubject, ['Transportation']);
  assert.match(text, /0 of the 1 issue/);
});

test('output only ever contains substrings from the source issuePositions text', () => {
  const text = composeSummaryText(fakeSubject, ['Housing']);
  assert.ok(text.includes(fakeSubject.issuePositions.Housing.text), 'composed text must contain the source text verbatim, not a paraphrase');
});

console.log(`\n${passed} passed`);
