// T04: the attach tool acts only as Ali, decided by Basecamp person id (never by an email address).
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertActingAsAli, ALI_PERSON_ID } = require('../attachArtifactToTicket');

test('Ali\'s profile (person 17454835) is accepted', () => {
  assert.equal(ALI_PERSON_ID, 17454835);
  assert.doesNotThrow(() => assertActingAsAli({ id: 17454835, name: 'Ali Muwwakkil' }));
});

test('any other person is refused (e.g. the CB System bot 37708014)', () => {
  assert.throws(() => assertActingAsAli({ id: 37708014, name: 'CB System' }), /not acting as Ali/);
});

test('the id as a string, a missing id, or no profile is refused', () => {
  assert.throws(() => assertActingAsAli({ id: '17454835' }), /not acting as Ali/);
  assert.throws(() => assertActingAsAli({}), /not acting as Ali/);
  assert.throws(() => assertActingAsAli(null), /not acting as Ali/);
});
