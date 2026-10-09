import fs from 'fs';
import path from 'path';

/**
 * The route that lists a student's own recordings so they can hand one in.
 *
 * Checked as SOURCE TEXT, per route and not per file. The repo's route-auth lint
 * is per FILE: one guarded route in a file makes an unguarded sibling pass. These
 * assertions are pinned to this route's own registration line.
 *
 * What must stay true:
 *   - it is behind `requireParticipant` AND the Studio flag;
 *   - it is a READ. Listing your takes is not handing one in, and the POST that
 *     does hand one in proves the attempt again rather than trusting this list;
 *   - it hands back no playback URL. A URL here would outlive the access checks
 *     that the Studio's own surfaces apply.
 */

const ROUTES = path.join(__dirname, '..', 'presentationPortalRoutes.ts');
const SRC = fs.readFileSync(ROUTES, 'utf8');
const PATHNAME = 'recording-evidence';

/** The whole `router.<verb>(...)` registration line for a path. */
function registrations(pathname: string): string[] {
  return SRC.split('\n').filter((l) => l.includes('router.') && l.includes(pathname));
}

/**
 * The whole handler body for a route: from its own `router.<verb>(` to the start of
 * the next one. Slicing to the first `});` does NOT work — `res.json({ ... });` ends
 * with exactly that, so the body gets cut off at the first response line.
 */
function handlerFor(pathname: string): string {
  const at = SRC.indexOf(`/${pathname}'`);
  if (at < 0) return '';
  const start = SRC.lastIndexOf('router.', at);
  const next = SRC.indexOf('\nrouter.', at);
  return SRC.slice(start, next < 0 ? SRC.length : next);
}
describe('the recording list is a guarded read, and nothing more', () => {
  // POSITIVE CONTROL. Without it a broken path or an empty read would make every
  // assertion below pass vacuously.
  it('is reading the real route file', () => {
    expect(SRC.length).toBeGreaterThan(2000);
    expect(SRC).toContain('presentation-practice');
    expect(registrations('presentation-session').length).toBeGreaterThan(0);
    // handlerFor must return a real body, or every `not.toContain` below would
    // pass against an empty string.
    expect(handlerFor('recording-recovery').length).toBeGreaterThan(400);
    expect(handlerFor('recording-recovery')).toContain('recoverMissingRecordingForOwner');
    expect(handlerFor('a-route-that-does-not-exist')).toBe('');
    // And the control proves the matcher can actually fail.
    expect(registrations('a-route-that-does-not-exist')).toHaveLength(0);
  });

  it('exists exactly once, as a GET', () => {
    const regs = registrations(PATHNAME);
    expect(regs).toHaveLength(1);
    expect(regs[0]).toContain('router.get(');
  });

  // Per route. A sibling's guard does not cover this one.
  it('carries requireParticipant on its OWN registration', () => {
    expect(registrations(PATHNAME)[0]).toContain('requireParticipant');
  });

  it('is behind the Studio flag like every other route on this surface', () => {
    const handler = handlerFor(PATHNAME);
    expect(handler).toContain('env.presentationStudioEnabled');
    expect(handler).toContain('gate(res)');
  });

  it('never hands back a URL to the video', () => {
    const handler = handlerFor(PATHNAME);
    for (const forbidden of ['join_url', 'start_url', 'play_url', 'download_url', 'share_url']) {
      expect(handler).not.toContain(forbidden);
    }
  });

  // Listing is not completing. The one writer that may set `complete` is
  // markTaskVerifiedComplete, and it is not reachable from this file.
  it('completes nothing', () => {
    expect(SRC).not.toContain('markTaskVerifiedComplete');
  });
});

/**
 * The two recovery routes. Same per-route discipline: the lint that runs in CI is
 * per FILE, so a guarded sibling would let an unguarded one through.
 */
describe.each([
  ['recording-recovery', 'the student says where their own copy is'],
  ['final-take', 'which of several takes is the one being handed in'],
])('POST %s — %s', (pathname) => {
  it('exists exactly once, as a POST', () => {
    const regs = registrations(pathname);
    expect(regs).toHaveLength(1);
    expect(regs[0]).toContain('router.post(');
  });

  it('carries requireParticipant on its OWN registration', () => {
    expect(registrations(pathname)[0]).toContain('requireParticipant');
  });

  it('is behind the Studio flag and the projects gate', () => {
    const handler = handlerFor(pathname);
    expect(handler).toContain('env.presentationStudioEnabled');
    expect(handler).toContain('gate(res)');
  });

  // Every body on this surface is parsed by a strict schema, so an unexpected
  // field is a 400 rather than something silently carried into a query.
  it('validates its body with a strict schema', () => {
    const schemaName = pathname === 'final-take' ? 'finalTakeSchema' : 'recoverySchema';
    expect(SRC).toContain(`const ${schemaName} = z.object(`);
    const schema = SRC.slice(SRC.indexOf(`const ${schemaName}`));
    expect(schema.slice(0, schema.indexOf(';'))).toContain('.strict()');
    expect(schema.slice(0, schema.indexOf(';'))).toContain('uuid()');
  });
});

describe('recovery is not completion', () => {
  // Neither route may pay anything or verify a task. Handing a take in is still
  // the evidence POST, which proves the attempt again.
  it('neither route awards points nor completes a task', () => {
    for (const forbidden of ['markTaskVerifiedComplete', 'payPrepTask', 'award(']) {
      expect(SRC).not.toContain(forbidden);
    }
  });

  // A student could otherwise paste a link over the recording of what they
  // actually did. The refusal is a 409 because the request was well formed.
  it('answers "already recorded" with a conflict, not an invalid-input error', () => {
    const body = handlerFor('recording-recovery');
    expect(body).toMatch(/already_recorded[\s\S]{0,200}status\(409\)/);
  });
});
