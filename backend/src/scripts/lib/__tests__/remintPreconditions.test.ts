import { remintPreconditionError, type RegisteredHost } from '../remintPreconditions';

/**
 * THE FAILURE THESE PIN. The re-mint clears the room's link BEFORE Zoom is called.
 * If the reserved host is not one the pool will allocate, reserveRoomHost returns
 * null, the mint falls back to the default host, and the room lands back on the
 * identity it was meant to move off - while the script reports a new link and looks
 * like it worked. Every case below is a way to reach that silently.
 */
describe('remintPreconditionError', () => {
  const host = (over: Partial<RegisteredHost> = {}): RegisteredHost => ({
    host_email: 'program.101@colaberry.com',
    enabled: true,
    verified_at: new Date('2026-11-02T00:00:00Z'),
    ...over,
  });
  const target = { slug: 'ai-internship-standup', hostEmail: 'program.101@colaberry.com' };

  it('passes when the host is registered, enabled and verified', () => {
    expect(remintPreconditionError([target], [host()])).toBeNull();
  });

  it('refuses a host that was never registered', () => {
    expect(remintPreconditionError([target], [])).toContain('host not registered');
  });

  it('refuses a disabled host, because the pool will not allocate it', () => {
    expect(remintPreconditionError([target], [host({ enabled: false })])).toContain('host is disabled');
  });

  // THE COMMON ONE: registering and proving are two steps, and the second is skipped.
  it('refuses an unverified host', () => {
    expect(remintPreconditionError([target], [host({ verified_at: null })])).toContain('host is not verified');
  });

  it('says WHY an unverified host matters, not just that it is unverified', () => {
    const msg = remintPreconditionError([target], [host({ verified_at: null })]);
    expect(msg).toContain('falls back to the default host');
  });

  it('accepts a verified_at that arrives as a string from the driver', () => {
    expect(remintPreconditionError([target], [host({ verified_at: '2026-11-02T00:00:00Z' })])).toBeNull();
  });

  it('matches the host case-insensitively and ignores surrounding whitespace', () => {
    expect(remintPreconditionError(
      [{ ...target, hostEmail: '  PROGRAM.101@Colaberry.com ' }],
      [host({ host_email: ' program.101@colaberry.com ' })],
    )).toBeNull();
  });

  it('checks EVERY target, not just the first', () => {
    const targets = [target, { slug: 'colaberry-ai-sessions', hostEmail: 'program.102@colaberry.com' }];
    const hosts = [host(), host({ host_email: 'program.102@colaberry.com', verified_at: null })];
    expect(remintPreconditionError(targets, hosts)).toContain('program.102@colaberry.com');
  });

  it('reports the FIRST problem only, so the operator fixes one thing and re-runs', () => {
    const targets = [
      { slug: 'ai-internship-standup', hostEmail: 'missing@colaberry.com' },
      { slug: 'colaberry-ai-sessions', hostEmail: 'alsomissing@colaberry.com' },
    ];
    const msg = remintPreconditionError(targets, []);
    expect(msg).toContain('missing@colaberry.com');
    expect(msg).not.toContain('alsomissing@colaberry.com');
  });

  it('passes an empty target list, since parsing already refuses that', () => {
    expect(remintPreconditionError([], [])).toBeNull();
  });

  it('tolerates a registry row with a null email rather than throwing', () => {
    const malformed = [{ host_email: null as unknown as string, enabled: true, verified_at: new Date() }];
    expect(remintPreconditionError([target], malformed)).toContain('host not registered');
  });
});
