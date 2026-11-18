// Run: node --test scripts/case-study-screens/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EMAIL, PHONE, nameRegexSource } = require('./captureAppScreens');

const hits = (re, s) => (s.match(new RegExp(re.source, re.flags)) || []).length;

test('phone numbers are caught with or without separators (a bare 10-digit number leaked on 2026-11-18)', () => {
  for (const p of ['4254452358', '(425) 445-2358', '425-445-2358', '425.445.2358', '+1 425 445 2358', '14254452358']) {
    assert.equal(hits(PHONE, `Phone ${p} here`), 1, p);
  }
});

test('ids, dates and counts on admin screens are not phone numbers', () => {
  for (const s of ['fcb83a02-025e-43d5-b799-776cc56df3de', '11/16/2026', '2026-11-18', '21/21', '342 events', 'day 58', '12345678901234']) {
    assert.equal(hits(PHONE, s), 0, s);
  }
});

test('email addresses are caught', () => {
  assert.equal(hits(EMAIL, 'write to a.person+tag@example.co.uk today'), 1);
});

test('names are hidden in any case and word order ("OBI, ANAMELECHI. K" leaked on 2026-11-18)', () => {
  const re = new RegExp(nameRegexSource(['Anamelechi Obi', 'Anamelechi', 'Obi']), 'giu');
  assert.equal('OBI, ANAMELECHI. K'.replace(re, '[redacted]'), '[redacted], [redacted]. K');
  assert.equal('Anamelechi Obi joined'.replace(re, '[redacted]'), '[redacted] joined');
});

test('a name part inside another word is left alone', () => {
  const re = new RegExp(nameRegexSource(['Ali']), 'giu');
  assert.equal('Alignment with Ali'.replace(re, '[redacted]'), 'Alignment with [redacted]');
  assert.equal(nameRegexSource([]), null);
});

test('a name stored as "LAST, FIRST. M" is still a name, and its parts are split on commas and periods', () => {
  const { namePartsOf } = require('./captureAppScreens');
  assert.deepEqual(namePartsOf('OBI, ANAMELECHI. K'), ['OBI, ANAMELECHI. K', 'OBI', 'ANAMELECHI']);
});

test('a bare `name` key holding "LAST, FIRST. M" counts as a person; project names do not', () => {
  const { isPersonLike } = require('./captureAppScreens');
  assert.equal(isPersonLike('OBI, ANAMELECHI. K'), true);
  assert.equal(isPersonLike('Jordan Lee'), true);
  assert.equal(isPersonLike('2026 Saratoga Springs Municipal Asset Management'), false);
  assert.equal(isPersonLike('Marketing Intelligence & Brand'), false);
});
