import { useEffect, useRef, useState } from 'react';
import { fetchPortalFlags } from '../../services/onboardingApi';
import { fetchTodayPlan } from '../../services/capeApi';
import { planStops, PlanStop } from './campusPlan';

/**
 * Today's plan for the campus (Colaberry Campus C8). Runs in CampusProvider, so it survives navigation.
 *
 *  - Nothing is requested unless the campus is active: then the portal flags are read once and, only if cape_today_plan is on,
 *    the plan is fetched. The flag read is done here rather than with usePortalFlags so a campus-off page makes no request.
 *  - ONE fetch per campus session, plus one refresh each time the learner opens the full map (they may have finished a step).
 *    No polling (ROLLOUT_RUNBOOK P3-09: poll only where needed; the plan changes when the learner acts).
 *  - Failure (404 = the plan is off on the server, or any error) yields null: no Next, no route, nothing broken.
 *  - fetchTodayPlan goes through portalApi, which redirects to login on a 401. Safe here: the campus is active only for a
 *    signed-in learner, and Today already makes the same call.
 */
export function useCampusPlan(active: boolean, mapOpen: boolean): PlanStop[] | null {
  const [stops, setStops] = useState<PlanStop[] | null>(null);
  const planOn = useRef<boolean | null>(null);
  const [refresh, setRefresh] = useState(0);
  const wasMapOpen = useRef(false);

  useEffect(() => {
    if (mapOpen && !wasMapOpen.current && planOn.current) setRefresh((n) => n + 1);
    wasMapOpen.current = mapOpen;
  }, [mapOpen]);

  useEffect(() => {
    if (!active) { setStops(null); planOn.current = null; return undefined; }
    let alive = true;
    (async () => {
      try {
        if (planOn.current === null) planOn.current = (await fetchPortalFlags()).cape_today_plan === true;
        if (!planOn.current) { if (alive) setStops(null); return; }
        const plan = await fetchTodayPlan();
        if (alive) setStops(plan ? planStops(plan.items) : null);
      } catch {
        if (alive) setStops(null);
      }
    })();
    return () => { alive = false; };
  }, [active, refresh]);

  return stops;
}
