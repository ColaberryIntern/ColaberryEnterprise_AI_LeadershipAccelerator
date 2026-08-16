import fs from 'fs';
import path from 'path';
import { SHOWROOM_SURFACES } from '../v2Platform';

const PUBLIC_DIR = path.resolve(__dirname, '../../../public');

/**
 * Guards the product screenshots on the public site.
 *
 * Two defects this exists for, both found by looking at the live pages rather
 * than by any automated check:
 *
 *   1. THE SAME IMAGE DOING TWO JOBS. The Services hero and the Platform
 *      showroom's first surface both pointed at shot-readiness.png, so a visitor
 *      moving between the two pages saw the identical picture presented as two
 *      different things.
 *
 *   2. AN IMAGE THAT DID NOT SHOW WHAT IT CLAIMED. "Free company workspace" was
 *      illustrated with a crop of the side navigation — a menu, telling you
 *      nothing about a workspace.
 *
 * A missing or duplicated image is invisible to tsc, to the production build and
 * to every render test, because a broken <img> still renders and a reused src is
 * still a valid string. So it is asserted here.
 */
describe('showroom screenshots', () => {
  it('gives every surface a shot that exists on disk', () => {
    const missing = SHOWROOM_SURFACES.filter((s) => s.shot)
      .filter((s) => !fs.existsSync(path.join(PUBLIC_DIR, s.shot!.src.replace(/^\//, ''))))
      .map((s) => `${s.key} -> ${s.shot!.src}`);
    expect(missing).toEqual([]);
  });

  it('never reuses one screenshot for two different surfaces', () => {
    const srcs = SHOWROOM_SURFACES.filter((s) => s.shot).map((s) => s.shot!.src);
    const dupes = srcs.filter((src, i) => srcs.indexOf(src) !== i);
    expect(dupes).toEqual([]);
  });

  it('describes every shot for people who cannot see it', () => {
    SHOWROOM_SURFACES.filter((s) => s.shot).forEach((s) => {
      // Long enough to be a real description, not "dashboard" or "screenshot".
      expect(s.shot!.alt.trim().length).toBeGreaterThan(60);
    });
  });

  it('covers the learner view and the individual drilldown, not only manager rollups', () => {
    // The showroom described the manager's perspective three times and never
    // showed the screen a team member actually opens, nor what happens when you
    // click a person in the roster.
    const keys = SHOWROOM_SURFACES.map((s) => s.key);
    expect(keys).toContain('today');
    expect(keys).toContain('individual');
  });

  it('keeps every shot within the safe width for an embedded page', () => {
    // captureHelpers.js caps at 1800px. PNG width is bytes 16-19 of the IHDR.
    SHOWROOM_SURFACES.filter((s) => s.shot).forEach((s) => {
      const buf = fs.readFileSync(path.join(PUBLIC_DIR, s.shot!.src.replace(/^\//, '')));
      expect(buf.readUInt32BE(16)).toBeLessThanOrEqual(1800);
    });
  });
});
