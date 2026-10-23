/**
 * campusSettings - the learner's own campus preferences, kept in this browser.
 *
 * These are per-viewer conveniences (which nav, which names, how much motion),
 * so localStorage is the right home. Whether the campus is AVAILABLE at all is
 * the server's call (GET /api/portal/campus/flags); a setting can only choose
 * classic nav when the campus is on, never turn the campus on.
 *
 * Storage can throw (private mode, blocked site data) or hold junk from an older
 * build. Every read falls back to the defaults and every write is best-effort,
 * so a storage failure never breaks the portal.
 *
 * MOTION (C11). What is stored is the learner's own CHOICE: follow my device, on, or off. The value
 * the campus acts on is derived: the choice when one was made, otherwise the device's live
 * prefers-reduced-motion. Before C11 a boolean was stored, seeded once from the device and then
 * frozen, so a learner who turned reduce motion on in their OS later never got it. An old stored
 * `true` reads as "on" (never silently turn motion back on for someone who may need it off); an old
 * `false` reads as "follow my device".
 *
 * SHARE (WP-7, decision Q14): "Show which building I'm in". On by default (the campus has always shown where you are); off, the
 * presence poll tells the server to forget your building, and classmates see you only as online.
 */

export type CampusNavMode = 'campus' | 'classic';
export type MotionChoice = 'device' | 'on' | 'off';

/** What is stored. */
export interface CampusSettings {
  nav: CampusNavMode;
  workplaceNames: boolean;
  motion: MotionChoice;
  shareBuilding: boolean;
}

/** What the campus reads: the stored choices plus the effective reduce-motion value. */
export interface CampusSettingsView extends CampusSettings {
  reduceMotion: boolean;
}

export const CAMPUS_SETTINGS_KEY = 'colaberry.campus.settings.v1';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export const DEFAULT_CAMPUS_SETTINGS: CampusSettings = { nav: 'campus', workplaceNames: false, motion: 'device', shareBuilding: true };

function motionQuery(): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
  } catch {
    return null;
  }
}

/** The device's current reduce-motion preference (false when it cannot be read). */
export function prefersReducedMotion(): boolean {
  return Boolean(motionQuery()?.matches);
}

/** Call `onChange` whenever the device preference changes. Returns the unsubscribe. */
export function subscribeReducedMotion(onChange: (reduce: boolean) => void): () => void {
  const mq = motionQuery();
  if (!mq) return () => undefined;
  const handler = (e: MediaQueryListEvent) => onChange(e.matches);
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }
  // Safari before 14 only has the deprecated listener API.
  mq.addListener?.(handler);
  return () => mq.removeListener?.(handler);
}

/** The value the campus acts on: the learner's choice if made, otherwise the device. */
export function effectiveReduceMotion(motion: MotionChoice, deviceReduces: boolean): boolean {
  if (motion === 'on') return true;
  if (motion === 'off') return false;
  return deviceReduces;
}

function readMotion(p: Record<string, unknown>): MotionChoice {
  if (p.motion === 'device' || p.motion === 'on' || p.motion === 'off') return p.motion;
  if (p.reduceMotion === true) return 'on'; // pre-C11 boolean, see the header
  return 'device';
}

/** Read settings; any missing, malformed or unreadable value becomes its default. */
export function readCampusSettings(): CampusSettings {
  const base = DEFAULT_CAMPUS_SETTINGS;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(CAMPUS_SETTINGS_KEY); } catch { return { ...base }; }
  if (!raw) return { ...base };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { ...base }; }
  if (!parsed || typeof parsed !== 'object') return { ...base };
  const p = parsed as Record<string, unknown>;
  return {
    nav: p.nav === 'classic' || p.nav === 'campus' ? p.nav : base.nav,
    workplaceNames: typeof p.workplaceNames === 'boolean' ? p.workplaceNames : base.workplaceNames,
    motion: readMotion(p),
    shareBuilding: typeof p.shareBuilding === 'boolean' ? p.shareBuilding : base.shareBuilding,
  };
}

/** Persist settings. Returns false when storage refused the write (the in-memory value still applies). */
export function writeCampusSettings(s: CampusSettings): boolean {
  try {
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: s.nav, workplaceNames: s.workplaceNames, motion: s.motion, shareBuilding: s.shareBuilding }));
    return true;
  } catch {
    return false;
  }
}
