'use strict';
// Unit tests for the inbound-dispatcher self-reply loop guard.
// Run: node --test scripts/ops-engine/__tests__/self-reply-guard.test.js
//
// Regression cover for the 2026-06-22 runaway loop. The Basecamp token degraded
// from CB System (37708014) to Ali (17454835, the #1 ALLOWED_REQUESTER). CB then
// posted its replies + queue_followup cards AS Ali, an allowed requester, and on
// the next tick re-read its OWN output as a fresh @CB request and answered it
// again, ~60x/hr (1,245 comments). Every author-based guard collapsed because
// CB's posting identity had become an allowed requester. The per-comment circuit
// breaker could not stop it: each cycle created a NEW comment id, so reply counts
// stayed at 1 and never tripped.
//
// Two independent guards prevent recurrence:
//   1. isOwnOutput(): skip any comment we posted (tracked by id) OR anything
//      authored by the identity we post as. id-tracking is sanitizer-proof; the
//      identity check is the belt for state loss.
//   2. (tick-level, not unit-tested here) the dispatcher HALTS entirely when its
//      resolved identity is not CB System, so a degraded token posts nothing.

process.env.BASECAMP_ACCESS_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || 'test-token';

const { test } = require('node:test');
const assert = require('node:assert');
const { isOwnOutput, CB_SYSTEM_ID } = require('../inbound-dispatcher');

const CB_SYSTEM = 37708014; // dedicated CB identity (the intended posting identity)
const ALI = 17454835;       // #1 allowed requester; the degraded posting identity on 2026-06-22

test('CB_SYSTEM_ID is the dedicated CB identity, distinct from any allowed requester', () => {
  assert.equal(CB_SYSTEM_ID, CB_SYSTEM);
  assert.notEqual(CB_SYSTEM_ID, ALI);
});

test('skips a comment THIS process posted (tracked by id) regardless of author', () => {
  const own = new Set([10020205919]);
  // The exact loop shape: a comment WE posted, authored by Ali (degraded token).
  const ourReply = { id: 10020205919, creator: { id: ALI } };
  assert.equal(isOwnOutput(ourReply, own, CB_SYSTEM), true);
});

test('skips anything authored by the identity we post as (belt for state loss)', () => {
  const own = new Set(); // registry wiped / empty
  const ourReply = { id: 999, creator: { id: ALI } };
  // Degraded run: we are posting as Ali, so a comment authored by Ali is ours.
  assert.equal(isOwnOutput(ourReply, own, ALI), true);
});

test('does NOT skip a genuine human request when identity is healthy (CB System)', () => {
  const own = new Set([1, 2, 3]); // our prior replies
  const realAsk = { id: 500, creator: { id: ALI } }; // Ali typing a real @CB request
  // Healthy run: we post as CB System (37708014), Ali's id != ours and the
  // comment id isn't in our registry -> it is a real request, must be answered.
  assert.equal(isOwnOutput(realAsk, own, CB_SYSTEM), false);
});

test('the 2026-06-22 loop is broken: our own freshly-posted reply is not re-answered', () => {
  // Simulate two ticks. Tick 1: CB posts a reply (id 700). Tick 2: the feed
  // surfaces comment 700 (authored by Ali, an allowed requester, contains a CB
  // mention). Without the guard this re-entered the reply path forever.
  const own = new Set();
  own.add(700); // bcPost recorded our reply's id on tick 1
  const surfacedNextTick = { id: 700, creator: { id: ALI } };
  assert.equal(isOwnOutput(surfacedNextTick, own, CB_SYSTEM), true, 'must recognize our own reply and skip it');
});

test('null / malformed records are safe', () => {
  assert.equal(isOwnOutput(null, new Set(), CB_SYSTEM), false);
  assert.equal(isOwnOutput({ id: 1 }, new Set(), CB_SYSTEM), false);   // no creator
  assert.equal(isOwnOutput({ id: 1, creator: {} }, new Set([2]), CB_SYSTEM), false);
  assert.equal(isOwnOutput({ id: 1, creator: { id: ALI } }, null, null), false); // no registry, no postingId
});
