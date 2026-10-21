import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCampus } from './CampusContext';

/**
 * The landing rule (C11b, decision D1), run by PortalProtectedRoute on every signed-in page: the FIRST time a tab opens the portal on Today with the campus on for this learner, it
 * goes to the campus home instead, as the prototype opens on the campus. Only once per tab (sessionStorage), so Today stays
 * reachable for the rest of the visit; never before the campus flags have loaded (`ready`), never with the campus off or the
 * classic menu chosen (`active` false), and never when the link says `?stay=1` (the campus home's own Today link does).
 * It writes nothing to the server, so a view-as session follows the same rule safely.
 */
export const CAMPUS_LANDED_KEY = 'colaberry.campus.landed';
export const CAMPUS_HOME = '/portal/campus';

export const TODAY = '/portal/today';

/** The FIRST campus-on portal page of a tab decides: Today goes to the campus home; any other page (a deep link) is left alone. */
export function shouldLandOnCampus(s: { ready: boolean; active: boolean; pathname: string; search: string; landed: boolean }): boolean {
  if (!s.ready || !s.active || s.landed || s.pathname !== TODAY) return false;
  return new URLSearchParams(s.search).get('stay') !== '1';
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
    if (shouldLandOnCampus({ ready, active, pathname, search, landed: readLanded() })) { markLanded(); navigate(CAMPUS_HOME, { replace: true }); return; }
    markLanded(); // any first campus-on page (a deep link, or Today with ?stay=1) counts as this tab's entry
  }, [ready, active, pathname, search, navigate]);
}
