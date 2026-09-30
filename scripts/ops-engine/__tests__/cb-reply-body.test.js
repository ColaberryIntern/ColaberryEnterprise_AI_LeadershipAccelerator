'use strict';

// Tests for composeReplyBody - the reply-composition seam that connects the
// well-tested cb-people library to the live handler. This is where the reopened
// 2026-07-01 "only tags Ali/Karun" defect lived AND where the "Aleem Aleem"
// doubling defect lives (BC todo 10048624254), so it gets direct coverage.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const cbPeople = require('../cb-people');
const { composeReplyBody } = require('../cb-reply-body');

const BUCKET = '12724483';
// Tags whose sgid does NOT contain the display name, so a plain-text count of
// the name proves whether the name was rendered twice.
const REQ_TAG = '<bc-attachment sgid="SGID_REQ" content-type="application/vnd.basecamp.mention"></bc-attachment>';
const requesterRef = { name: 'Aleem', attachable_sgid: 'SGID_REQ' };
const mention = () => REQ_TAG;
const resolveMention = (name) => cbPeople.resolveSgidSync(name, { bucketId: BUCKET });

// Count plain-text (outside any tag) occurrences of a name.
function plainNameCount(html, name) {
  const textOnly = html.replace(/<[^>]*>/g, ' ');
  return (textOnly.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
}
function mentionCount(html) {
  return (html.match(/content-type="application\/vnd\.basecamp\.mention"/g) || []).length;
}

beforeEach(() => {
  cbPeople.__resetForTests();
  cbPeople.__setScopeCacheForTests(BUCKET, new Map([
    ['name:aleem', 'SGID_REQ'],
    ['name:sohail syed', 'SGID_SOHAIL'],
    ['name:sai tejesh', 'SGID_SAI'],
  ]));
});

test('does NOT double the requester name when addressed by plain first name (the "Aleem Aleem" defect)', () => {
  const { body } = composeReplyBody('Aleem, I created a task to fix the resolver.', { resolveMention: () => null, mention, requesterRef });
  assert.strictEqual(mentionCount(body), 1, 'exactly one mention tag');
  assert.strictEqual(plainNameCount(body, 'Aleem'), 0, 'the prose name was promoted to the tag, not left beside it');
  assert.ok(body.includes(REQ_TAG), 'requester is tagged');
  assert.ok(/created a task/.test(body), 'message content preserved');
});

test('promotes a leading name inside a wrapping <div> and preserves the block tag', () => {
  const { body } = composeReplyBody('<div>Aleem, here is the update.</div>', { resolveMention: () => null, mention, requesterRef });
  assert.strictEqual(mentionCount(body), 1);
  assert.strictEqual(plainNameCount(body, 'Aleem'), 0);
  assert.ok(body.startsWith('<div>'), 'existing block wrapper kept');
});

test('prepends the requester tag when the body has no name at all', () => {
  const { body } = composeReplyBody('I created a task to fix the resolver.', { resolveMention: () => null, mention, requesterRef });
  assert.strictEqual(mentionCount(body), 1);
  assert.ok(body.startsWith(`<div>${REQ_TAG} `), 'tag prepended so requester is still notified');
});

test('resolves an @Name teammate in the body and does NOT also prepend the requester (Sohail/Sai fix)', () => {
  const { body } = composeReplyBody('@Sohail can you review the resolver fix?', { resolveMention, mention, requesterRef });
  assert.ok(body.includes('SGID_SOHAIL'), 'teammate @Sohail became a real mention');
  assert.ok(!body.includes('SGID_REQ'), 'requester tag not prepended when a mention already exists');
  assert.strictEqual(mentionCount(body), 1);
});

test('leaves an unresolved @Name as plain text and still tags the requester', () => {
  const { body } = composeReplyBody('@Ghost please advise.', { resolveMention, mention, requesterRef });
  assert.ok(/@Ghost/.test(body), 'unknown @Name stays plain text, never mis-tagged');
  assert.ok(body.includes(REQ_TAG), 'requester still tagged since no mention resolved');
  assert.strictEqual(mentionCount(body), 1);
});

test('does not tag anyone when there is nothing to tag with (empty mention)', () => {
  const { body } = composeReplyBody('Done.', { resolveMention: () => null, mention: () => '', requesterRef: null });
  assert.strictEqual(mentionCount(body), 0);
  assert.ok(/Done\./.test(body));
});

test('flags a leaked tool-call via wasLeak', () => {
  const leak = 'functions.basecamp_reply({content_html: "hi"})';
  const { wasLeak } = composeReplyBody(leak, { resolveMention: () => null, mention, requesterRef });
  assert.strictEqual(wasLeak, true);
});

test('a mid-sentence requester name is not promoted (only a leading address is)', () => {
  // Known scope: only the OPENING address is de-duplicated. A name later in the
  // sentence gets the tag prepended (still single visible tag + the prose name).
  const { body } = composeReplyBody('The task for Aleem is filed.', { resolveMention: () => null, mention, requesterRef });
  assert.strictEqual(mentionCount(body), 1);
  assert.ok(body.startsWith(`<div>${REQ_TAG} `));
});
