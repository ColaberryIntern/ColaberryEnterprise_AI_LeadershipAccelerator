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

// --- 2026-06-29 regression: CB's OWN AI task-runner output -------------------
// runCbAiTasks.js / runCbAiTasksGeneric.js post their "starting" + "deliverable"
// + "error" comments under the task reviewer's REAL identity, so isOwnOutput
// (keyed on posting identity / comment id) misses them, and each opens with a
// "CB System ..." header that trips the plain-text isCBMention. The dispatcher
// answered a 13-comment LandJet runner batch in one tick and the runaway guard
// tripped the kill switch (02:51 UTC). The guard must skip these announcements.
const RUNNER_STARTING = '<div><strong>CB System is starting this task now.</strong></div><div>Drafting a first-pass deliverable for Ali to review. Anything outbound (client email, social post, etc.) is marked "[DRAFT - Ali reviews + sends]" - CB never sends external communications, only drafts them.</div><div>Output will land here as a follow-up comment within ~2 minutes.</div>';
const RUNNER_DELIVERABLE = '<div><strong>CB System first-pass deliverable</strong> (Ali reviews + refines + marks complete)</div><div>...content...</div><div>Reply to revise or tag <code>@CB System</code> to ask for changes.</div>';
const RUNNER_ERROR = '<div><strong>CB System hit an error drafting this.</strong></div><div>some message</div><div>Will retry on next nightly run.</div>';

test('skips CB task-runner "starting this task" announcement', () => {
  assert.equal(isAutomatedAgentCard(RUNNER_STARTING), true);
});

test('skips CB task-runner "first-pass deliverable" comment', () => {
  assert.equal(isAutomatedAgentCard(RUNNER_DELIVERABLE), true);
});

test('skips CB task-runner "hit an error" comment', () => {
  assert.equal(isAutomatedAgentCard(RUNNER_ERROR), true);
});

test('runner output still trips isCBMention (so the guard, not the filter, stops it)', () => {
  assert.equal(isCBMention(RUNNER_STARTING), true);
});

test('does NOT suppress a human who references the runner phrase mid-sentence', () => {
  assert.equal(isAutomatedAgentCard('<div>@CB did the CB System first-pass deliverable land for the LandJet task yet?</div>'), false);
  assert.equal(isAutomatedAgentCard('<div>CB, is the system starting this task or not?</div>'), false);
});

// --- Launch PMO overdue nurture (2026-11-23 auto-trip) ---------------------
// launchPmoDailyUpdate.js posts these as Ali. The 3-day text said "CB will escalate", the dispatcher answered 13 of them in
// one tick, created 2 to-dos, and the runaway guard tripped. Verbatim HTML of the bodies that file writes.
const NURTURE_3D = `<div><strong style="color:#b45309">3 days overdue</strong> - due 2026-11-20. Owner: Taiwo Oludimimu.</div>
<div>Please post a status update here or reassign. CB will escalate to Ali at 5 days if no movement.</div>`;
const NURTURE_1D = `<div><strong style="color:#0284c7">Reminder</strong> - this was due 2026-11-22 (1 day overdue). Owner: Ali Muwwakkil.</div>
<div>Quick status check: where are we on this?</div>`;
const NURTURE_5D = `<div><strong style="color:#d97706">Escalation (5 days overdue)</strong> - due 2026-11-18. Owner: Sam.</div>
<div><bc-attachment sgid="x"></bc-attachment> please review.</div>`;
const NURTURE_7D = `<div><strong style="color:#dc2626">CRITICAL RISK</strong> - this task is 7 days overdue (due 2026-11-16). Owner: Sam. Marking on Launch Readiness Dashboard.</div>`;

test('the old 3-day nurture text trips isCBMention (why the guard is needed)', () => {
  assert.equal(isCBMention(NURTURE_3D), true);
});

test('skips every Launch PMO overdue nurture level', () => {
  for (const body of [NURTURE_1D, NURTURE_3D, NURTURE_5D, NURTURE_7D]) assert.equal(isAutomatedAgentCard(body), true);
});

test('does NOT suppress a human who mentions being overdue mid-sentence', () => {
  assert.equal(isAutomatedAgentCard('<div>@CB this is 3 days overdue - due Friday, can you extend it?</div>'), false);
  assert.equal(isAutomatedAgentCard('<div>CB, send a reminder - this was due last week</div>'), false);
});
