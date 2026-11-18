// Run: node --test scripts/case-study-screens/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EMAIL, PHONE } = require('./captureAppScreens');

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
