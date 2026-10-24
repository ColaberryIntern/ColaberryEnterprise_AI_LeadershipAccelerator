import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPoints, fetchSchedule, PointsSummary, OnboardingSchedule } from '../../../services/onboardingApi';
import { onPointsEarned } from '../../../services/pointsFx';

/**
 * The header's points and schedule (moved out of PortalShell in Campus C16, which had passed the repo's 500-line ceiling).
 *
 * Two INDEPENDENT reads, settled independently.
 *
 * MEASURED 2026-08-15 on production: GET /api/portal/points answers in ~7ms
 * (median), GET /api/portal/onboarding/schedule in ~2,090ms — the schedule
 * handler opens a fresh MSSQL connection to CCPP per request. These used to
 * share one `await Promise.allSettled([...])`, which resolves only when BOTH
 * settle, so the fast read was held hostage by the slow one and the header sat
 * in its unresolved state for two seconds on every single page load.
 *
 * Awaiting them separately costs nothing — they were already in flight
 * concurrently — and lets the points HUD paint as soon as its own data lands.
 *
 * Points-earned FX: displayTotal counts UP to the real total; `fx` drives the "+N" burst + a brief scale-pulse on the HUD when
 * points land anywhere in the portal (and the authoritative total is refetched, so the bar and level are exact).
 */
export function useShellPoints() {
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const [schedule, setSchedule] = useState<OnboardingSchedule | null>(null);
  const [displayTotal, setDisplayTotal] = useState(0);
  const displayRef = useRef(0);
  const [fx, setFx] = useState<{ delta: number; key: number } | null>(null);
  const fxKeyRef = useRef(0);
  const load = useCallback(async () => {
    const pts = fetchPoints().then(setPoints, () => { /* stays unknown; never falls back to 0 */ });
    const sch = fetchSchedule().then(setSchedule, () => { /* non-fatal */ });
    await Promise.allSettled([pts, sch]);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Count the HUD total UP to its current value (on load, and after each earn).
  useEffect(() => {
    const end = points?.total ?? 0;
    const start = displayRef.current;
    if (start === end) return;
    const reduce = !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { displayRef.current = end; setDisplayTotal(end); return; }
    let raf = 0;
    const t0 = performance.now();
    const dur = 700;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(start + (end - start) * eased);
      displayRef.current = v;
      setDisplayTotal(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [points]);

  useEffect(() => {
    return onPointsEarned((d) => {
      void load();
      fxKeyRef.current += 1;
      setFx({ delta: d.delta, key: fxKeyRef.current });
    });
  }, [load]);
  useEffect(() => {
    if (!fx) return;
    const id = window.setTimeout(() => setFx(null), 1100);
    return () => window.clearTimeout(id);
  }, [fx]);

  return { points, schedule, displayTotal, fx };
}
