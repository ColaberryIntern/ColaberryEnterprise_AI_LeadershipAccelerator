'use strict';
// Unit tests for the inbound-dispatcher retired-project exclusion.
// Run: node --test scripts/ops-engine/__tests__/retired-buckets.test.js
//
// LandJet (Basecamp bucket 46699826) was retired 2026-11-19. Archiving its
// Basecamp project is a manual step, so until then /projects.json still lists
// it as active. The dispatcher must never answer @CB mentions there.

process.env.BASECAMP_ACCESS_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || 'test-token';

const { test } = require('node:test');
const assert = require('node:assert');
const { excludeRetiredBuckets, RETIRED_BUCKETS, WATCHED_BUCKETS_FALLBACK } = require('../inbound-dispatcher');

const LANDJET = 46699826;

test('LandJet is registered as retired', () => {
  assert.ok(RETIRED_BUCKETS.has(LANDJET));
});

test('drops a retired bucket from an active project list, keeps the rest in order', () => {
  assert.deepStrictEqual(excludeRetiredBuckets([46697389, LANDJET, 47126345]), [46697389, 47126345]);
});

test('matches a retired bucket given as a string id', () => {
  assert.deepStrictEqual(excludeRetiredBuckets([String(LANDJET), '47346103']), ['47346103']);
});

test('empty and missing input are safe', () => {
  assert.deepStrictEqual(excludeRetiredBuckets([]), []);
  assert.deepStrictEqual(excludeRetiredBuckets(undefined), []);
});

test('the hardcoded fallback list no longer contains LandJet', () => {
  assert.ok(!WATCHED_BUCKETS_FALLBACK.includes(LANDJET));
  assert.ok(WATCHED_BUCKETS_FALLBACK.length > 0);
});
