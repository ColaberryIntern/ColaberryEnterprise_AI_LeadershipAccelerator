// node --test scripts/case-study-story-in-brief/beats.test.js
// Holds every reviewed beat set to the rules the server and the audit apply, before it reaches production:
// the shape (storyInBriefProblem's limits), the claim scan's closed vocabulary, and the audit's
// "a story, not a ticket" lint (completenessCore.storyInBriefLint).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { storyInBriefLint } = require('../../.claude/skills/build-case-study/scripts/completenessCore');

const FILE = path.join(__dirname, 'beats-2026-11-19.json');
const { records } = require(FILE);
const LIMITS = { minBeats: 3, maxBeats: 5, maxLabelChars: 32, maxTextChars: 240 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FORBIDDEN = [
  [/\d+(?:\.\d+)?\s?%/, 'a percentage'],
  [/[$£€]\s?\d/, 'a currency figure'],
  [/["“”«»]/, 'a quotation mark'],
  [/\b(?:roi|return on investment|cost savings?|payback|revenue (?:lift|increase|growth|impact))\b/i, 'a return claim'],
  [/\b(?:in production|went live|go[- ]live)\b/i, 'a production claim'],
  [/\bfree\b/i, 'the word free'],
  [/\b(?:claude|cursor|copilot|pull request|commit|repo(?:sitory)?|source code)\b/i, 'the builder tool or code'],
  // The beats are ONE text for every surface, but the builder is not: Hire names a consenting learner
  // (Ali, 19 Nov 2026: "this was built by harpreet but you mention kes"), other surfaces say Kes.
  [/\bKes\b/, 'a builder name (it differs per surface; the byline names the builder)'],
];

test('every record is an id and a slug with 3 to 5 beats inside the server limits', () => {
  const ids = Object.keys(records);
  assert.ok(ids.length >= 20, `expected the whole live catalog, got ${ids.length}`);
  for (const [id, r] of Object.entries(records)) {
    assert.match(id, UUID, `${id} is not a record id`);
    assert.ok(r.slug, `${id} has no slug`);
    assert.ok(r.beats.length >= LIMITS.minBeats && r.beats.length <= LIMITS.maxBeats, `${r.slug}: ${r.beats.length} beats`);
    for (const b of r.beats) {
      assert.ok(b.label && b.label.length <= LIMITS.maxLabelChars, `${r.slug}: label "${b.label}"`);
      assert.ok(b.text && b.text.length <= LIMITS.maxTextChars, `${r.slug} ${b.label}: ${b.text.length} characters`);
    }
  }
});

test('no beat states what the publish gate would block, the word free, or the builder tool', () => {
  for (const r of Object.values(records)) {
    for (const b of r.beats) {
      for (const [re, what] of FORBIDDEN) assert.ok(!re.test(b.text), `${r.slug} ${b.label} states ${what}: ${b.text}`);
    }
  }
});

// A record with no metric at all cannot put a figure in its third beat without inventing one. It says so
// in words instead, and stays listed here until the record gains a verified metric.
const NO_METRIC_ON_RECORD = new Set(['your-repositories-already-wrote-your-resume']);

test('every set passes the audit lint: a figure in What happened, no ticket text, no repeats', () => {
  const failures = Object.values(records)
    .map((r) => [r.slug, storyInBriefLint(r.beats, r.standfirst || '')
      .filter((p) => !(NO_METRIC_ON_RECORD.has(r.slug) && /carries no figure/.test(p)))])
    .filter(([, problems]) => problems.length);
  assert.deepStrictEqual(failures, []);
});
