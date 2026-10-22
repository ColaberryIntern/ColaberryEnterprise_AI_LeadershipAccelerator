import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPortalFlags } from '../../services/onboardingApi';
import { fetchTodayPlan } from '../../services/capeApi';
import { planStops, withDone, PlanStop } from './campusPlan';
import { completeStop, CompleteResult } from './campusPlanApi';

/**
 * Today's plan for the campus (Colaberry Campus C8; WP-2). Runs in CampusProvider, so it survives navigation.
 *
 *  - Nothing is requested unless the campus is active: then the portal flags are read once and, only if cape_today_plan is on,
 *    the plan is fetched. The flag read is done here rather than with usePortalFlags so a campus-off page makes no request.
 *  - ONE fetch per campus session, plus one refresh each time the learner opens the full map (they may have finished a step).
 *    No polling (ROLLOUT_RUNBOOK P3-09: poll only where needed; the plan changes when the learner acts).
 *  - Failure (404 = the plan is off on the server, or any error) yields null: no Next, no route, nothing broken.
 *  - fetchTodayPlan goes through portalApi, which redirects to login on a 401. Safe here: the campus is active only for a
 *    signed-in learner, and Today already makes the same call.
 *  - WP-2: `complete` marks a step done through Today's collect path (campusPlanApi). A step done this session keeps its place on
 *    the plan, ticked, across refreshes (withDone), because the server drops completed steps from the plan. `onEarned` hears the
 *    points awarded (the campus re-reads its look, so the level and points stay true).
 */
export interface CampusPlan {
  stops: PlanStop[] | null;
  /** The plan's own total, "~96 min" (null when it does not say). */
  minutes: number | null;
  complete: (stop: PlanStop) => Promise<CompleteResult>;
}

export function useCampusPlan(active: boolean, mapOpen: boolean, onEarned?: (points: number) => void): CampusPlan {
  const [stops, setStops] = useState<PlanStop[] | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const planOn = useRef<boolean | null>(null);
  const [refresh, setRefresh] = useState(0);
  const wasMapOpen = useRef(false);
  const doneKeys = useRef(new Set<string>());
  const earned = useRef(onEarned);
  earned.current = onEarned;

  useEffect(() => {
    if (mapOpen && !wasMapOpen.current && planOn.current) setRefresh((n) => n + 1);
    wasMapOpen.current = mapOpen;
  }, [mapOpen]);

  useEffect(() => {
    if (!active) { setStops(null); setMinutes(null); planOn.current = null; doneKeys.current = new Set(); return undefined; }
    let alive = true;
    (async () => {
      try {
        if (planOn.current === null) planOn.current = (await fetchPortalFlags()).cape_today_plan === true;
        if (!planOn.current) { if (alive) setStops(null); return; }
        const plan = await fetchTodayPlan();
        if (!alive) return;
        setStops((prev) => (plan ? withDone(prev, planStops(plan.items), doneKeys.current) : null));
        setMinutes(plan && plan.estimated_total_minutes > 0 ? plan.estimated_total_minutes : null);
      } catch {
        if (alive) { setStops(null); setMinutes(null); }
      }
    })();
    return () => { alive = false; };
  }, [active, refresh]);

  const complete = useCallback(async (stop: PlanStop): Promise<CompleteResult> => {
    const r = await completeStop(stop);
    if (r.ok) {
      doneKeys.current.add(stop.key);
      setStops((prev) => (prev ? prev.map((s) => (s.key === stop.key ? { ...s, done: true } : s)) : prev));
      earned.current?.(r.points);
    }
    return r;
  }, []);

  return { stops, minutes, complete };
}
