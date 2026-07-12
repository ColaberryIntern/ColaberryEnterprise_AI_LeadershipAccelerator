'use strict';
// Unit tests for the inbound-dispatcher duplicate-reply circuit breaker.
// Run: node --test scripts/ops-engine/__tests__/circuit-breaker.test.js
//
// Set a dummy token so requiring the dispatcher (which lazily resolves the
// Basecamp token) doesn't throw; the guarded main IIFE does not run on require.
process.env.BASECAMP_ACCESS_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || 'test-token';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  shouldCircuitBreak, replyCountFor, recordReply, MAX_REPLIES_PER_COMMENT,
} = require('../inbound-dispatcher');

test('fresh key: no prior replies, does not break', () => {
  const state = { replyCounts: {} };
  assert.equal(replyCountFor(state, 'b-1'), 0);
  assert.equal(shouldCircuitBreak(state, 'b-1'), false);
});

test('handles missing replyCounts object', () => {
  assert.equal(replyCountFor({}, 'b-1'), 0);
  assert.equal(shouldCircuitBreak({}, 'b-1'), false);
});

test('recordReply increments per key independently', () => {
  const state = { replyCounts: {} };
  recordReply(state, 'b-1');
  recordReply(state, 'b-1');
  recordReply(state, 'b-2');
  assert.equal(replyCountFor(state, 'b-1'), 2);
  assert.equal(replyCountFor(state, 'b-2'), 1);
});

test('does not break below the cap, breaks at the cap', () => {
  const state = { replyCounts: {} };
  // first reply (count 0 -> allowed)
  assert.equal(shouldCircuitBreak(state, 'b-1'), false);
  recordReply(state, 'b-1');
  // second reply (count 1 -> still allowed, cap is 2)
  assert.equal(shouldCircuitBreak(state, 'b-1'), false);
  recordReply(state, 'b-1');
  // third attempt (count 2 -> at cap -> break)
  assert.equal(replyCountFor(state, 'b-1'), MAX_REPLIES_PER_COMMENT);
  assert.equal(shouldCircuitBreak(state, 'b-1'), true);
});

test('honors a custom max', () => {
  const state = { replyCounts: { 'b-1': 5 } };
  assert.equal(shouldCircuitBreak(state, 'b-1', 10), false);
  assert.equal(shouldCircuitBreak(state, 'b-1', 5), true);
  assert.equal(shouldCircuitBreak(state, 'b-1', 3), true);
});

test('simulated runaway loop is capped at MAX replies', () => {
  // Model the failure mode: the same mention re-reaches the reply path every
  // tick. With the breaker, only MAX_REPLIES_PER_COMMENT replies ever post.
  const state = { replyCounts: {} };
  let postsAttempted = 0;
  for (let tick = 0; tick < 25; tick++) {
    if (shouldCircuitBreak(state, 'b-1')) continue; // suppressed
    postsAttempted++;
    recordReply(state, 'b-1');
  }
  assert.equal(postsAttempted, MAX_REPLIES_PER_COMMENT);
  assert.equal(replyCountFor(state, 'b-1'), MAX_REPLIES_PER_COMMENT);
});
