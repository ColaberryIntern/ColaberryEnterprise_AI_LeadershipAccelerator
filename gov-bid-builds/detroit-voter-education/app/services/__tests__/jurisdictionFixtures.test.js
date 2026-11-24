const assert = require('node:assert/strict');
const { lookupFixture, lookupGenericFallback } = require('../jurisdictionFixtures');
const { resolveZip } = require('../jurisdictionResolver');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

async function asyncTest(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test('lookupFixture: known Detroit ZIP returns exact fixture data', () => {
  const result = lookupFixture('48201');
  assert.ok(result);
  assert.equal(result.city, 'Detroit');
  assert.equal(result.county, 'Wayne County');
  assert.equal(result.source, 'fixture');
});

test('lookupFixture: unknown ZIP returns null', () => {
  const result = lookupFixture('90210');
  assert.equal(result, null);
});

test('lookupGenericFallback: any 482xx ZIP not in the exact list still resolves', () => {
  const result = lookupGenericFallback('48299');
  assert.ok(result);
  assert.equal(result.city, 'Detroit');
  assert.equal(result.source, 'fixture-generic');
});

test('lookupGenericFallback: non-Detroit ZIP returns null (no false positives)', () => {
  const result = lookupGenericFallback('90210');
  assert.equal(result, null);
});

async function run() {
  await asyncTest('resolveZip: fixture ZIP resolves without any network call', async () => {
    const result = await resolveZip('48201');
    assert.equal(result.city, 'Detroit');
    assert.equal(result.source, 'fixture');
    assert.equal(result.raw.source, 'fixture');
  });

  console.log(`\n${passed} passed`);
}

run().catch((err) => { console.error(err); process.exitCode = 1; });
