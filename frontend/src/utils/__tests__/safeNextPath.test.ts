/**
 * Client-side mirror of backend/src/__tests__/utils/safeNextPath.test.ts.
 * The two implementations are deliberate duplicates (separate tsconfigs) and
 * must be changed — and re-verified — together.
 */

import { safeNextPath, MAX_NEXT_PATH_LENGTH } from '../safeNextPath';

it('accepts the class check-in path the QR flow uses', () => {
  const p = '/portal/class-checkin/8e1868bf-675b-404d-ac4c-91696f004e7e';
  expect(safeNextPath(p)).toBe(p);
});

it('accepts other portal paths and trims whitespace', () => {
  expect(safeNextPath('/portal/today')).toBe('/portal/today');
  expect(safeNextPath('  /portal/sessions/abc  ')).toBe('/portal/sessions/abc');
});

it.each([
  ['absolute URL', 'https://evil.com/portal/x'],
  ['protocol-relative', '//evil.com'],
  ['backslash protocol-relative', '/\\evil.com'],
  ['javascript scheme', 'javascript:alert(1)'],
  ['non-portal path', '/admin/accelerator'],
  ['prefix lookalike', '/portalx/today'],
  ['traversal', '/portal/../admin'],
  ['query string', '/portal/today?redirect=http://evil.com'],
  ['fragment', '/portal/today#/evil'],
  ['newline', '/portal/today\nLocation: http://evil.com'],
  ['empty', ''],
  ['null', null],
  ['undefined', undefined],
  ['number', 42],
])('rejects %s', (_label, input) => {
  expect(safeNextPath(input)).toBeNull();
});

it('honours the length boundary', () => {
  const pad = (len: number) => '/portal/' + 'a'.repeat(len - '/portal/'.length);
  expect(safeNextPath(pad(MAX_NEXT_PATH_LENGTH))).toHaveLength(MAX_NEXT_PATH_LENGTH);
  expect(safeNextPath(pad(MAX_NEXT_PATH_LENGTH + 1))).toBeNull();
});
