'use strict';
// Unit tests for cb-people: @-mention SGID resolution.
// Run: node --test scripts/ops-engine/__tests__/cb-people.test.js
//
// Regression cover for the "every CB @-tag is Ali" defect. The dispatcher
// hardcoded ONE sgid (Ali's) behind a zero-arg mention(), so a reply addressed
// to Aleem rendered "@Ali Aleem" - Ali tagged via the attachment, Aleem left as
// plain text, so Aleem was never notified. cb-people resolves the tag to the
// REAL person (off the creator object's attachable_sgid, or via the people
// cache) and only falls back to Ali when nothing resolves.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const cbPeople = require('../cb-people');

// Real-ish fixtures (ids/emails are the production values; sgids are stand-ins
// shaped like Basecamp sgids, which always start with "BAh").
const ALI = { id: 17454835, name: 'Ali Muwwakkil', email_address: 'ali@colaberry.com', attachable_sgid: 'BAh-ALI-SGID-119f405284666f646ff92128b896da907f10c3ab' };
const ALEEM = { id: 47335967, name: 'Aleem', email_address: 'aleem@colaberry.com', attachable_sgid: 'BAh-ALEEM-SGID-7c2a' };
const KES = { id: 52330127, name: 'Kes Delele', email_address: 'kes@colaberry.com', attachable_sgid: 'BAh-KES-SGID-9d31' };

beforeEach(() => cbPeople.__resetForTests());

test('buildMentionTag emits the Basecamp mention attachment HTML', () => {
  const html = cbPeople.buildMentionTag('BAh-X');
  assert.equal(html, '<bc-attachment sgid="BAh-X" content-type="application/vnd.basecamp.mention"></bc-attachment>');
});

test('requester case: reads attachable_sgid straight off the creator object (zero network)', () => {
  // No people cache loaded - resolution must still work from the object itself.
  assert.equal(cbPeople.resolveSgidSync(ALEEM), ALEEM.attachable_sgid);
  const tag = cbPeople.mentionFor(ALEEM, { fallbackSgid: ALI.attachable_sgid });
  assert.ok(tag.includes(ALEEM.attachable_sgid), 'tags Aleem');
  assert.ok(!tag.includes(ALI.attachable_sgid), 'does NOT tag Ali');
});

test('THE BUG IS FIXED: replying to a non-Ali requester tags that person, not Ali', () => {
  const tag = cbPeople.mentionFor(KES, { fallbackSgid: ALI.attachable_sgid });
  assert.ok(tag.includes(KES.attachable_sgid), 'Kes is tagged');
  assert.ok(!tag.includes(ALI.attachable_sgid), 'Ali is NOT tagged');
});

test('no ref (legacy mention() call) falls back to Ali - original behavior preserved', () => {
  assert.equal(cbPeople.mentionFor(undefined, { fallbackSgid: ALI.attachable_sgid }),
    cbPeople.buildMentionTag(ALI.attachable_sgid));
});

test('unresolved name falls back to Ali instead of dropping the tag', () => {
  const tag = cbPeople.mentionFor('Nobody Here', { fallbackSgid: ALI.attachable_sgid });
  assert.equal(tag, cbPeople.buildMentionTag(ALI.attachable_sgid));
});

test('cache lookup: resolves a bare name / email / numeric id to that person sgid', () => {
  cbPeople.__setPeopleCacheForTests(cbPeople.indexPeople([ALI, ALEEM, KES]));
  assert.equal(cbPeople.resolveSgidSync('Aleem'), ALEEM.attachable_sgid);
  assert.equal(cbPeople.resolveSgidSync('aleem@colaberry.com'), ALEEM.attachable_sgid);
  assert.equal(cbPeople.resolveSgidSync('52330127'), KES.attachable_sgid);
  assert.equal(cbPeople.resolveSgidSync(52330127), KES.attachable_sgid);
});

test('cache lookup is case/space-insensitive on names', () => {
  cbPeople.__setPeopleCacheForTests(cbPeople.indexPeople([KES]));
  assert.equal(cbPeople.resolveSgidSync('  kes   delele '), KES.attachable_sgid);
});

test('a raw sgid string is used as-is', () => {
  assert.equal(cbPeople.resolveSgidSync('BAh-SOME-SGID'), 'BAh-SOME-SGID');
});

test('indexPeople skips people with no attachable_sgid', () => {
  const map = cbPeople.indexPeople([ALI, { id: 999, name: 'No Sgid', email_address: 'x@y.com' }]);
  assert.equal(map.has('id:999'), false);
  assert.equal(map.get('id:17454835'), ALI.attachable_sgid);
});

test('object ref resolves via cache by id when it carries no sgid of its own', () => {
  cbPeople.__setPeopleCacheForTests(cbPeople.indexPeople([ALEEM]));
  // A creator object that did NOT include attachable_sgid (feed sometimes omits
  // it) still resolves through the cache by id.
  assert.equal(cbPeople.resolveSgidSync({ id: 47335967, name: 'Aleem' }), ALEEM.attachable_sgid);
});

test('ensurePeopleLoaded never throws and caches empty on fetch failure', async () => {
  const map = await cbPeople.ensurePeopleLoaded({ bcGet: async () => { throw new Error('boom'); } });
  assert.ok(map instanceof Map);
  assert.equal(map.size, 0);
  // Cached: a second call with a working getter must NOT overwrite the cache
  // within the same process (one fetch per process).
  const again = await cbPeople.ensurePeopleLoaded({ bcGet: async () => [ALI] });
  assert.equal(again.size, 0);
});

test('ensurePeopleLoaded indexes people from the getter', async () => {
  const map = await cbPeople.ensurePeopleLoaded({ bcGet: async () => [ALI, ALEEM] });
  assert.equal(map.get('name:aleem'), ALEEM.attachable_sgid);
  assert.equal(map.get('email:ali@colaberry.com'), ALI.attachable_sgid);
});
