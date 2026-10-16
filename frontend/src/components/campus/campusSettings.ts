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
 */

export type CampusNavMode = 'campus' | 'classic';

export interface CampusSettings {
  nav: CampusNavMode;
  workplaceNames: boolean;
  reduceMotion: boolean;
}

export const CAMPUS_SETTINGS_KEY = 'colaberry.campus.settings.v1';

export const DEFAULT_CAMPUS_SETTINGS: CampusSettings = { nav: 'campus', workplaceNames: false, reduceMotion: false };

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Read settings; any missing, malformed or unreadable value becomes its default. */
export function readCampusSettings(): CampusSettings {
  const base: CampusSettings = { ...DEFAULT_CAMPUS_SETTINGS, reduceMotion: prefersReducedMotion() };
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(CAMPUS_SETTINGS_KEY); } catch { return base; }
  if (!raw) return base;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return base; }
  if (!parsed || typeof parsed !== 'object') return base;
  const p = parsed as Record<string, unknown>;
  return {
    nav: p.nav === 'classic' || p.nav === 'campus' ? p.nav : base.nav,
    workplaceNames: typeof p.workplaceNames === 'boolean' ? p.workplaceNames : base.workplaceNames,
    reduceMotion: typeof p.reduceMotion === 'boolean' ? p.reduceMotion : base.reduceMotion,
  };
}

/** Persist settings. Returns false when storage refused the write (the in-memory value still applies). */
export function writeCampusSettings(s: CampusSettings): boolean {
  try {
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
