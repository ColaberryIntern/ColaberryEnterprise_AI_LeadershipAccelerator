import { loginHrefPreserving } from '../portalLoginHref';

// Regression cover for the QR check-in sign-in loop (2026-08-24).
// A 401 on any /portal page used to send the student to a bare /portal/login,
// dropping where they were. On the class check-in page that silently cost them
// their attendance: sign-in landed on /portal/today, never back at the
// check-in, so the auto-join never ran and re-scanning just repeated the loop.
describe('loginHrefPreserving', () => {
  const CHECKIN = '/portal/class-checkin/2d79fd98-479b-43c5-8b20-ea7600ec6191';

  it('carries the class check-in destination through sign-in (the regression)', () => {
    expect(loginHrefPreserving(CHECKIN)).toBe(
      `/portal/login?next=${encodeURIComponent(CHECKIN)}`
    );
  });

  it('round-trips: the emitted next decodes back to the original path', () => {
    const next = new URL(loginHrefPreserving(CHECKIN), 'https://x.test').searchParams.get('next');
    expect(next).toBe(CHECKIN);
  });

  it.each(['/portal/today', '/portal/projects', '/portal/rooms/abc-123'])(
    'preserves other portal pages too (%s)',
    (path) => {
      expect(loginHrefPreserving(path)).toBe(`/portal/login?next=${encodeURIComponent(path)}`);
    }
  );

  it('does not point next at the login page itself (redirect loop)', () => {
    expect(loginHrefPreserving('/portal/login')).toBe('/portal/login');
  });

  it('does not point next at the verify page (its token is already spent)', () => {
    expect(loginHrefPreserving('/portal/verify')).toBe('/portal/login');
  });

  it.each([
    ['off-portal path', '/admin/dashboard'],
    ['protocol-relative', '//evil.example.com'],
    ['backslash escape', '/\evil.example.com'],
    ['traversal', '/portal/../admin'],
    ['query smuggling', '/portal/x?next=//evil.example.com'],
    ['fragment', '/portal/x#/evil'],
    ['absolute url', 'https://evil.example.com/portal/x'],
    ['empty', ''],
  ])('falls back to bare login for an unsafe destination: %s', (_label, path) => {
    expect(loginHrefPreserving(path)).toBe('/portal/login');
  });

  it('falls back to bare login for an over-long path', () => {
    expect(loginHrefPreserving('/portal/' + 'a'.repeat(300))).toBe('/portal/login');
  });
});
