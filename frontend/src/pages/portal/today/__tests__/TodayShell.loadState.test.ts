/**
 * TodayShell / PortalShell — no confident wrong numbers during load.
 *
 * Reported by Ali 2026-09-01: "When I refresh the Today page, for about 3-4
 * seconds it shows incorrect data and then it fixes itself. It looks tacky."
 *
 * Root cause: every figure in the command band derives from state initialised to
 * `null`, and the render coerced null to ZERO rather than treating it as
 * UNKNOWN — `points?.total ?? 0`, `capeProfile ? ... : 0`, and so on. So a cold
 * load of a learner with 678 points and a live streak rendered, confidently:
 *
 *     Welcome back 👋            (no name)
 *     0 points — you're all caught up in Classroom!
 *     0 PTS / Apprentice · 1/3 SETUP · 0 /100 Readiness
 *     Next tier Builder · 150 pts to go · 0-day streak
 *     NEXT EVENT —
 *
 * ...for ~3-4s before flipping to the truth. Not a slow load: a wrong one.
 *
 * The fix is a `hydrated` flag set once the first `loadAll()` settles, plus
 * `scheduleKnown` for the topbar chips, gating those spots onto skeletons.
 *
 * Driving the real hydration race through jest would need the whole portal API
 * surface mocked; this asserts the source-level contract that broke, following
 * the TodayShell.feedCss / TodayShell.rsvpUrl precedent in this folder.
 */
import fs from 'fs';
import path from 'path';

const today = fs.readFileSync(path.join(__dirname, '..', 'TodayShell.tsx'), 'utf8');
const shell = fs.readFileSync(path.join(__dirname, '..', 'PortalShell.tsx'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'TodayShell.css'), 'utf8');

/** The command band's JSX — where the wrong numbers were rendered. */
const band = today.slice(today.indexOf('te-band'), today.indexOf('te-page-h'));

describe('TodayShell load state', () => {
  it('tracks hydration and only flips it once everything has settled', () => {
    expect(today).toMatch(/const \[hydrated, setHydrated\] = useState\(false\)/);
    // Must sit after the Promise.allSettled destructure, not inside a per-promise
    // branch — otherwise the band twitches as each request lands.
    const load = today.slice(today.indexOf('const loadAll'), today.indexOf('useEffect(() => { loadAll(); }'));
    expect(load.indexOf('setHydrated(true)')).toBeGreaterThan(load.indexOf('await Promise.allSettled'));
  });

  it('gates the points ring, tier and readiness behind hydration', () => {
    // Each of these rendered a confident 0 / "Apprentice" before the fix.
    expect(band).toMatch(/hydrated \?/);
    expect(band).toMatch(/te-ring-skel/);
    const ring = band.slice(band.indexOf('te-cluster'), band.indexOf('te-metacol'));
    expect(ring.indexOf('hydrated ?')).toBeGreaterThan(-1);
    expect(ring.indexOf('hydrated ?')).toBeLessThan(ring.indexOf('{total}'));
  });

  it('gates the next-step line, which read "0 points — you are all caught up"', () => {
    const idx = band.indexOf('TodayNextStepBanner');
    expect(idx).toBeGreaterThan(-1);
    expect(band.slice(Math.max(0, idx - 260), idx)).toMatch(/hydrated \?/);
  });

  it('gates the greeting so the name does not pop in late', () => {
    const idx = band.indexOf('Welcome back');
    expect(band.slice(Math.max(0, idx - 200), idx)).toMatch(/hydrated/);
  });

  it('gates the setup nudge and the Today nav badge on real step counts', () => {
    expect(today).toMatch(/\{hydrated && setupRemaining > 0 && \(/);
    expect(today).toMatch(/todayBadge=\{hydrated \? setupRemaining : 0\}/);
  });

  it('never renders a bare zero-coalesced total in the band', () => {
    // `points?.total ?? 0` interpolated directly is the original defect shape.
    expect(band).not.toMatch(/\{points\?\.total \?\? 0\}/);
  });
});

describe('PortalShell countdown chips', () => {
  it('distinguishes "still loading" from "nothing scheduled"', () => {
    // `schedule` is null in BOTH cases; only the second should render an em dash.
    expect(shell).toMatch(/const scheduleKnown = schedule !== null/);
  });

  it('skeletons BOTH chips rather than showing an em dash while loading', () => {
    // Scoped to the topbar rail, and counted rather than merely present: fixing
    // only the Next event chip and leaving Next class showing "—" was the easy
    // half-fix here.
    // Anchor forward from te-rail — `MessagesButton` also appears in the import
    // block near the top, so an unanchored indexOf slices backwards to nothing.
    const railStart = shell.indexOf('te-rail');
    const rail = shell.slice(railStart, shell.indexOf('<MessagesButton', railStart));
    expect(rail.length).toBeGreaterThan(0);
    expect((rail.match(/scheduleKnown \?/g) || []).length).toBe(2);
    expect((rail.match(/te-hud-skel cd/g) || []).length).toBe(2);
    // The em dash must survive — it is still correct once we know there is
    // genuinely nothing scheduled.
    expect((rail.match(/: '—'/g) || []).length).toBe(2);
  });
});

describe('skeleton styling', () => {
  it('defines the placeholder classes the band renders', () => {
    ['.te-skel', '.te-skel-name', '.te-skel-line', '.te-skel-num', '.te-skel-tier', '.te-ring-skel', '.te-hud-skel.cd']
      .forEach((cls) => expect(css).toContain(cls));
  });

  it('stops the breathing animation under prefers-reduced-motion', () => {
    const rm = css.slice(css.indexOf('prefers-reduced-motion'));
    expect(rm).toMatch(/\.te-skel\{animation:none/);
  });
});
