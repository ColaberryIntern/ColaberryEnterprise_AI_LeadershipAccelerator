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

// --- 2026-07-01 defect: "only tags Ali and Karun, not Sohail/Sai" ------------
// The roster carries FULL names but people are referenced by FIRST name. The old
// exact-full-name-only match silently missed, so the tag fell back to Ali.
const SOHAIL = { id: 47335940, name: 'Sohail Syed', email_address: 'sohail@colaberry.com', attachable_sgid: 'BAh-SOHAIL-SGID' };
const SAI_TEJESH = { id: 50567410, name: 'Sai Tejesh', email_address: 'saitejesh@colaberry.com', attachable_sgid: 'BAh-SAITEJESH-SGID' };
const SAI_KRISHNA = { id: 32992444, name: 'Sai Krishna', email_address: 'saikrishna@x.com', attachable_sgid: 'BAh-SAIKRISHNA-SGID' };

test('THE REOPENED BUG: a bare FIRST name resolves to the right person', () => {
  cbPeople.__setPeopleCacheForTests(cbPeople.indexPeople([ALI, SOHAIL, SAI_TEJESH]));
  assert.equal(cbPeople.resolveSgidSync('Sohail'), SOHAIL.attachable_sgid);
  assert.equal(cbPeople.resolveSgidSync('sohail'), SOHAIL.attachable_sgid); // case-insensitive
  assert.equal(cbPeople.resolveSgidSync('Sai'), SAI_TEJESH.attachable_sgid); // unique here
});

test('a last-name (any token) resolves too', () => {
  cbPeople.__setPeopleCacheForTests(cbPeople.indexPeople([ALI, SOHAIL, SAI_TEJESH]));
  assert.equal(cbPeople.resolveSgidSync('Syed'), SOHAIL.attachable_sgid);
  assert.equal(cbPeople.resolveSgidSync('Tejesh'), SAI_TEJESH.attachable_sgid);
});

test('AMBIGUOUS first name returns null (never guesses the wrong human)', () => {
  cbPeople.__setPeopleCacheForTests(cbPeople.indexPeople([SAI_TEJESH, SAI_KRISHNA]));
  assert.equal(cbPeople.resolveSgidSync('Sai'), null); // two Sais -> refuse to guess
  // full name still disambiguates
  assert.equal(cbPeople.resolveSgidSync('Sai Krishna'), SAI_KRISHNA.attachable_sgid);
});

test('project-scoped cache: resolution honors bucketId and does not leak across projects', async () => {
  await cbPeople.ensurePeopleLoaded({ bcGet: async (p) => {
    assert.ok(p.includes('/projects/12724483/people.json'));
    return [ALI, SOHAIL, SAI_TEJESH];
  }, bucketId: 12724483 });
  assert.equal(cbPeople.resolveSgidSync('Sohail', { bucketId: 12724483 }), SOHAIL.attachable_sgid);
  // "Sai" is unique inside THIS project even though it is ambiguous account-wide
  assert.equal(cbPeople.resolveSgidSync('Sai', { bucketId: 12724483 }), SAI_TEJESH.attachable_sgid);
  // A bucket with no loaded roster resolves nothing (no global bleed-through)
  assert.equal(cbPeople.resolveSgidSync('Sohail', { bucketId: 999 }), null);
});

test('injectMentions rewrites a plain-text @First into a real mention attachment', () => {
  const resolve = (name) => (cbPeople.normKey(name) === 'sohail' ? SOHAIL.attachable_sgid : null);
  const out = cbPeople.injectMentions('<div>@Sohail please review this.</div>', resolve);
  assert.ok(out.includes(cbPeople.buildMentionTag(SOHAIL.attachable_sgid)), 'Sohail is a real mention');
  assert.ok(out.includes('please review this.'), 'the rest of the sentence is preserved');
  assert.ok(!out.includes('@Sohail'), 'the raw @Sohail text is gone');
});

test('injectMentions leaves unknown / ambiguous @Name as plain text (no false tag, no Ali default)', () => {
  const resolve = () => null; // everyone misses
  const html = '<div>@Nobody and @Someone Else here.</div>';
  assert.equal(cbPeople.injectMentions(html, resolve), html);
});

test('injectMentions never mangles an email address', () => {
  const resolve = () => SOHAIL.attachable_sgid; // would fire if it matched
  const html = '<div>Email ali@colaberry.com for access.</div>';
  assert.equal(cbPeople.injectMentions(html, resolve), html);
});

test('injectMentions backs off to the longest span that resolves', () => {
  // "@Sohail Please" - only "Sohail" resolves, "Please" is kept as text.
  const resolve = (name) => (cbPeople.normKey(name) === 'sohail' ? SOHAIL.attachable_sgid : null);
  const out = cbPeople.injectMentions('<div>@Sohail Please confirm.</div>', resolve);
  assert.ok(out.includes(cbPeople.buildMentionTag(SOHAIL.attachable_sgid)));
  assert.ok(out.includes('Please confirm.'));
});
