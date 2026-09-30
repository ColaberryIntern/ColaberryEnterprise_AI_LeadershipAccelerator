/**
 * safeNextPath — post-login redirect sanitizer.
 *
 * This value travels through an email WE send, so a miss here is an open
 * redirect carrying Colaberry branding. Tests are deliberately adversarial.
 *
 * NOTE: frontend/src/utils/safeNextPath.ts is a deliberate duplicate of this
 * module (separate tsconfigs) and has a mirrored suite. Change both together.
 */

import { safeNextPath, MAX_NEXT_PATH_LENGTH } from '../../utils/safeNextPath';

describe('accepts genuine portal destinations', () => {
  it('accepts the class check-in path the QR flow actually uses', () => {
    const p = '/portal/class-checkin/8e1868bf-675b-404d-ac4c-91696f004e7e';
    expect(safeNextPath(p)).toBe(p);
  });

  it('accepts other portal paths and trims surrounding whitespace', () => {
    expect(safeNextPath('/portal/today')).toBe('/portal/today');
    expect(safeNextPath('  /portal/sessions/abc  ')).toBe('/portal/sessions/abc');
  });

  it('is idempotent — sanitizing an already-sanitized value is a no-op', () => {
    const once = safeNextPath('  /portal/class-checkin/abc  ');
    expect(safeNextPath(once)).toBe(once);
  });
});

describe('rejects off-origin redirects', () => {
  it.each([
    ['absolute http', 'http://evil.com/portal/x'],
    ['absolute https', 'https://evil.com/portal/x'],
    ['protocol-relative', '//evil.com'],
    ['protocol-relative with portal decoy', '//evil.com/portal/today'],
    ['backslash protocol-relative', '/\\evil.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['embedded credentials', 'https://user:pw@evil.com/portal/'],
  ])('rejects %s', (_label, input) => {
    expect(safeNextPath(input)).toBeNull();
  });
});

describe('rejects anything outside the /portal/ allowlist', () => {
  it.each([
    ['admin surface', '/admin/accelerator'],
    ['api surface', '/api/portal/profile'],
    ['bare root', '/'],
    ['prefix lookalike without slash', '/portalx/today'],
    ['portal without trailing slash', '/portal'],
    ['relative path', 'portal/today'],
    ['traversal', '/portal/../admin'],
  ])('rejects %s', (_label, input) => {
    expect(safeNextPath(input)).toBeNull();
  });
});

describe('rejects injection and malformed shapes', () => {
  it.each([
    ['query string', '/portal/today?redirect=http://evil.com'],
    ['fragment', '/portal/today#/evil'],
    ['newline (header/URL injection)', '/portal/today\nLocation: http://evil.com'],
    ['carriage return', '/portal/today\r\n'],
    ['tab', '/portal/to\tday'],
    ['space inside path', '/portal/to day'],
    ['angle brackets', '/portal/<script>'],
  ])('rejects %s', (_label, input) => {
    expect(safeNextPath(input)).toBeNull();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['number', 42],
    ['object', { toString: () => '/portal/today' }],
    ['array', ['/portal/today']],
  ])('rejects %s', (_label, input) => {
    expect(safeNextPath(input)).toBeNull();
  });
});

describe('length boundary', () => {
  const pad = (len: number) => '/portal/' + 'a'.repeat(len - '/portal/'.length);

  it('accepts a path exactly at the limit', () => {
    const atLimit = pad(MAX_NEXT_PATH_LENGTH);
    expect(atLimit).toHaveLength(MAX_NEXT_PATH_LENGTH);
    expect(safeNextPath(atLimit)).toBe(atLimit);
  });

  it('rejects one character over the limit', () => {
    expect(safeNextPath(pad(MAX_NEXT_PATH_LENGTH + 1))).toBeNull();
  });
});
