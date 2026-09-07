/**
 * The switch for the classroom rails.
 *
 * OFF BY DEFAULT, deliberately, and for a sharper reason than the sections flag
 * next door. Rails put six other live surfaces into the page every student opens
 * every day: a room's occupancy, a cohort's posts, somebody's project tasks. The
 * blast radius of getting that wrong is the classroom itself, so it ships dark
 * and is turned on once someone has looked at a real week with real data in it.
 *
 * Two ways in, and both are read-only:
 *
 *   ?rails=1         one page load, for looking at it. Nothing is stored.
 *   te_class_rails   localStorage, for keeping it on while reviewing.
 *
 * Deliberately NOT a build-time env var: this has to be switchable on a running
 * production deployment without a rebuild, which is the point of shipping dark.
 * When it becomes the default it stops being a flag rather than becoming a
 * permanent one — a flag nobody removes is a fork of the product nobody tests.
 *
 * Both reads are wrapped. `localStorage` throws outright in a private window or
 * when site data is blocked, and a feature flag must never be the thing that
 * takes the page down.
 */

export const RAILS_STORAGE_KEY = 'te_class_rails';

export function classroomRailsEnabled(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('rails');
    if (param === '1' || param === 'true') return true;
    if (param === '0' || param === 'false') return false;
  } catch { /* no window, or an unparseable query — fall through to storage */ }

  try {
    return localStorage.getItem(RAILS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
