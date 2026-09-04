/**
 * The switch for the sectioned classroom week.
 *
 * OFF BY DEFAULT, deliberately. A week that regroups itself under a student
 * mid-cohort is a worse surprise than the flat feed they already know, so this
 * ships dark and is turned on per cohort once someone has looked at a real
 * week through it.
 *
 * Two ways in, and both are read-only:
 *
 *   ?sections=1        one page load, for looking at it. Nothing is stored.
 *   te_class_sections  localStorage, for keeping it on while reviewing.
 *
 * Deliberately NOT a build-time env var: this needs to be switchable on a
 * running production deployment without a rebuild, which is the whole point of
 * shipping it dark. When it becomes the default it stops being a flag rather
 * than becoming a permanent one — a flag nobody ever removes is a fork of the
 * product that nobody tests.
 *
 * Pure apart from the two reads, and both are wrapped: `localStorage` throws
 * outright in a private window or when site data is blocked, and a feature flag
 * must never be the thing that takes the page down.
 */

export const SECTIONS_STORAGE_KEY = 'te_class_sections';

export function classroomSectionsEnabled(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('sections');
    if (param === '1' || param === 'true') return true;
    if (param === '0' || param === 'false') return false;
  } catch { /* no window, or an unparseable query — fall through to storage */ }

  try {
    return localStorage.getItem(SECTIONS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
