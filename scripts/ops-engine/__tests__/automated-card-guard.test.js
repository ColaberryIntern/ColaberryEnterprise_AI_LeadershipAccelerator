'use strict';
// Unit tests for the inbound-dispatcher automated-agent card guard.
// Run: node --test scripts/ops-engine/__tests__/automated-card-guard.test.js
//
// Regression cover for the 2026-06-17 runaway loop on the launch "daily
// snapshots" thread (bucket 47502609, message 9997008325): per-user
// Basecamp-connected agents posted "CB System: automated response" cards as
// their own users, the dispatcher answered each one, and every CB reply
// re-triggered the per-user agents (19 comments 6/15 -> 53 on 6/17). The
// dispatcher must skip another agent's card; it must NOT skip a real human ask.

process.env.BASECAMP_ACCESS_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || 'test-token';

const { test } = require('node:test');
const assert = require('node:assert');
const { isAutomatedAgentCard, isCBMention } = require('../inbound-dispatcher');

// Verbatim sample of a card pulled from the live thread (comment #2).
const REAL_CARD = `<p dir="auto"><strong>CB System: automated response</strong></p><p dir="auto"><strong>Anticipated goal:</strong> Prepare a daily snapshot of the Launch Readiness Dashboard for June 15, 2026.</p><p dir="auto">The task is to prepare a daily snapshot ... tagged with @CB System for assistance.</p><p dir="auto"><strong>Proposed plan:</strong></p><ol dir="auto">
<li>Capture the live state of the Launch Readiness Dashboard : ~10m</li>
<li>Format the snapshot into a clear and concise PDF : ~15m</li>
<li>Tag @CB System on any tasks needing AI execution or scheduling help : ~5m</li>
</ol><p dir="auto"><strong>Missing info (drops confidence):</strong></p><ul dir="auto">
<li>Access to the Launch Readiness Dashboard</li>
</ul><details><summary><strong>Claude Code prompt</strong> (click to expand and copy)</summary><pre>Prepare a daily snapshot...</pre></details>`;

test('detects the real per-user "automated response" card', () => {
  assert.equal(isAutomatedAgentCard(REAL_CARD), true);
});

test('header alone is enough (case / spacing insensitive)', () => {
  assert.equal(isAutomatedAgentCard('<p>cb system :  Automated Response</p><p>anything</p>'), true);
  assert.equal(isAutomatedAgentCard('CB System: automated response'), true);
});

test('structural triple (goal+plan+prompt) is detected even without the header', () => {
  const card = '<div>Anticipated goal: ship it. Proposed plan: do the thing. Claude Code prompt: run this.</div>';
  assert.equal(isAutomatedAgentCard(card), true);
});

test('the card is still recognized as a CB mention (so the guard, not the filter, must stop it)', () => {
  // Confirms WHY the guard is needed: the card trips isCBMention via "@CB System".
  assert.equal(isCBMention(REAL_CARD), true);
});

test('does NOT suppress a genuine human @CB request', () => {
  assert.equal(isAutomatedAgentCard('<div>@CB System grep: handleOpenEnded</div>'), false);
  assert.equal(isAutomatedAgentCard('<div>CB, can you draft a reply to this and email me the summary?</div>'), false);
  assert.equal(isAutomatedAgentCard('<div>@CB System please add bid 5</div>'), false);
});

test('does NOT suppress prose that merely mentions one label', () => {
  // A human discussing the plan in passing must still be answered.
  assert.equal(isAutomatedAgentCard('<div>@CB what is the proposed plan for the Detroit bid?</div>'), false);
  assert.equal(isAutomatedAgentCard('<div>@CB the anticipated goal here is launch readiness, thoughts?</div>'), false);
});

test('empty / null content is safe', () => {
  assert.equal(isAutomatedAgentCard(''), false);
  assert.equal(isAutomatedAgentCard(null), false);
  assert.equal(isAutomatedAgentCard(undefined), false);
});
