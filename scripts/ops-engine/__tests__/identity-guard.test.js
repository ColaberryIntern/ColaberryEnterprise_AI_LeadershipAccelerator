'use strict';
// Unit tests for the inbound-dispatcher posting-identity guard.
// Run: node --test scripts/ops-engine/__tests__/identity-guard.test.js
//
// Two failure shapes must get two different responses (2026-09-21): a token
// that resolves to a real person is the self-reply flood condition and trips
// the persistent kill switch; a token that resolves to nobody (401, network)
// cannot post at all, so it only halts the tick and must NOT trip the switch.
process.env.BASECAMP_ACCESS_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || 'test-token';

const { test } = require('node:test');
const assert = require('node:assert');
const { classifyIdentity, CB_SYSTEM_ID } = require('../inbound-dispatcher');

test('CB System itself is ok', () => {
  assert.equal(classifyIdentity(CB_SYSTEM_ID), 'ok');
  assert.equal(classifyIdentity(37708014), 'ok');
});

test('no identity (dead token, unreachable API) is unknown, never wrong', () => {
  assert.equal(classifyIdentity(null), 'unknown');
  assert.equal(classifyIdentity(undefined), 'unknown');
});

test('a real person is wrong (the 2026-06-22 flood condition)', () => {
  assert.equal(classifyIdentity(17454835), 'wrong'); // Ali, the #1 allowed requester
  assert.equal(classifyIdentity(1), 'wrong');
});

test('identity is compared strictly: a string id is not silently accepted', () => {
  // Basecamp returns a numeric id; anything else is treated as a real
  // mismatch so a shape change fails loud (halt + trip) rather than posting.
  assert.equal(classifyIdentity(String(CB_SYSTEM_ID)), 'wrong');
});
