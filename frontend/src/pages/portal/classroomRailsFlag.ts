/**
 * The classroom rails switch.
 *
 * ON BY DEFAULT since 2026-09-07. It shipped dark, was reviewed against real
 * production data over several passes, and the defects that pass found — a
 * workstation link that opened a list, room icons that disagreed with the Rooms
 * page, certification appearing in Week 1, a project story showing twice on one
 * screen — were all fixed before this line changed. That sequence is the reason
 * the flag existed; it has now done its job.
 *
 * WHAT REMAINS IS AN OFF SWITCH, NOT A DARK LAUNCH, and the difference matters.
 * A dark-launch flag hides unfinished work and becomes a fork of the product
 * that nobody tests, which is why the previous version of this file promised to
 * delete itself rather than invert. An off switch is a different thing: rails
 * put six other live surfaces into the page every student opens every day, and
 * if one of them misbehaves for a cohort, somebody needs to be able to turn it
 * off from a browser rather than wait for a deploy.
 *
 *   ?rails=0             one page load without rails, for support and debugging
 *   te_class_rails=0     localStorage, to keep them off while investigating
 *   ?rails=1             force on, if storage says off
 *
 * Both reads are wrapped. `localStorage` throws outright in a private window or
 * when site data is blocked, and the switch that decides whether a page renders
 * must never be the thing that stops it rendering.
 */

export const RAILS_STORAGE_KEY = 'te_class_rails';

export function classroomRailsEnabled(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('rails');
    if (param === '0' || param === 'false') return false;
    if (param === '1' || param === 'true') return true;
  } catch { /* no window, or an unparseable query — fall through to storage */ }

  try {
    // Only an explicit '0' turns them off. Anything else, including a missing
    // key and a storage read that fails, means on.
    return localStorage.getItem(RAILS_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}
