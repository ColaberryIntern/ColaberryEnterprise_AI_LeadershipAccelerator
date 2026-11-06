import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCampus } from './CampusContext';
import type { OnboardingSchedule } from '../../services/onboardingApi';
import { loadSchedule } from '../../pages/portal/scheduleCache';
import { needsFirstLesson, FIRST_LESSON_HREF } from '../../pages/portal/today/explorerFirstWin';

/**
 * The landing rule (C11b, decision D1), run by PortalProtectedRoute on every signed-in page: the FIRST time a tab opens the portal on Today with the campus on for this learner, it
 * goes to the campus home instead, as the prototype opens on the campus. Only once per tab (sessionStorage), so Today stays
 * reachable for the rest of the visit; never before the campus flags have loaded (`ready`), never with the campus off or the
 * classic menu chosen (`active` false), and never when the link says `?stay=1` (the campus home's own Today link does).
 * It writes nothing to the server, so a view-as session follows the same rule safely.
 * C114: an Explorer who has not finished a first lesson lands on that lesson instead of the campus home (campusLandingTarget).
 */
export const CAMPUS_LANDED_KEY = 'colaberry.campus.landed';
export const CAMPUS_HOME = '/portal/campus';

export const TODAY = '/portal/today';

/** The FIRST campus-on portal page of a tab decides: Today goes to the campus home; any other page (a deep link) is left alone. */
export function shouldLandOnCampus(s: { ready: boolean; active: boolean; pathname: string; search: string; landed: boolean }): boolean {
  if (!s.ready || !s.active || s.landed || s.pathname !== TODAY) return false;
  return new URLSearchParams(s.search).get('stay') !== '1';
}

/**
 * C114 (Ali, 2026-11-05: "When I login as a free account now it goes to the campus instead of the 1st assignment video"): where
 * that first landing goes. An Explorer who has not finished a first lesson opens it; everyone else, and an unknown schedule
 * (null: the read failed), gets the campus home as before. C115: any learner with no lesson done, not only an Explorer (needsFirstLesson).
 */
export function campusLandingTarget(schedule: Pick<OnboardingSchedule, 'is_explorer' | 'is_staff' | 'first_win' | 'any_card_completed'> | null): string {
  return needsFirstLesson(schedule) ? FIRST_LESSON_HREF : CAMPUS_HOME;
}

function readLanded(): boolean {
  try { return window.sessionStorage.getItem(CAMPUS_LANDED_KEY) === '1'; } catch { return true; } // no storage: never redirect
}
function markLanded(): void {
  try { window.sessionStorage.setItem(CAMPUS_LANDED_KEY, '1'); } catch { /* no storage: readLanded already refuses */ }
}

export function useCampusLanding(): void {
  const { ready, active } = useCampus();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!ready || !active) return;
    if (shouldLandOnCampus({ ready, active, pathname, search, landed: readLanded() })) {
      markLanded(); // before the read, so a re-render while it is in flight cannot land twice
      // Not cancelled on cleanup: landed is already marked, so a cancelled read would never land at all. The schedule is
      // cached and already requested by the portal shell, so this normally resolves at once.
      loadSchedule()
        .then((s) => navigate(campusLandingTarget(s), { replace: true }))
        .catch(() => navigate(campusLandingTarget(null), { replace: true }));
      return;
    }
    markLanded(); // any first campus-on page (a deep link, or Today with ?stay=1) counts as this tab's entry
  }, [ready, active, pathname, search, navigate]);
}
