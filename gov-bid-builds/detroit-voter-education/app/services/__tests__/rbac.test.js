const assert = require('node:assert/strict');

process.env.DATA_STEWARD_API_KEY = 'test-data-steward-key';

const { resolveRole } = require('../../middleware/rbac');
const { ROLES } = require('../../config/roles');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test('resolveRole: returns data_steward for the correct credential', () => {
  assert.equal(resolveRole('test-data-steward-key'), 'data_steward');
});

test('resolveRole: returns null for a wrong credential', () => {
  assert.equal(resolveRole('wrong-key'), null);
});

test('resolveRole: returns null for a missing/empty credential', () => {
  assert.equal(resolveRole(undefined), null);
  assert.equal(resolveRole(''), null);
});

test('resolveRole: the general ADMIN_API_KEY does not resolve to any role', () => {
  process.env.ADMIN_API_KEY = 'some-admin-key';
  assert.equal(resolveRole('some-admin-key'), null);
});

test('ROLES config: data_steward is granted audit_log:read', () => {
  assert.ok(ROLES.data_steward.includes('audit_log:read'));
});

test('ROLES config: data_steward is not granted an unrelated permission', () => {
  assert.equal(ROLES.data_steward.includes('export:approve'), false);
});

console.log(`\n${passed} passed`);
