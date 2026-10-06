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

describe('the recording list is a guarded read, and nothing more', () => {
  // POSITIVE CONTROL. Without it a broken path or an empty read would make every
  // assertion below pass vacuously.
  it('is reading the real route file', () => {
    expect(SRC.length).toBeGreaterThan(2000);
    expect(SRC).toContain('presentation-practice');
    expect(registrations('presentation-session').length).toBeGreaterThan(0);
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
    const body = SRC.slice(SRC.indexOf(PATHNAME));
    const handler = body.slice(0, body.indexOf('});'));
    expect(handler).toContain('env.presentationStudioEnabled');
    expect(handler).toContain('gate(res)');
  });

  it('never hands back a URL to the video', () => {
    const body = SRC.slice(SRC.indexOf(PATHNAME));
    const handler = body.slice(0, body.indexOf('});'));
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
