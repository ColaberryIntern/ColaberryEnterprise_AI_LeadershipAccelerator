import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The concierge's entrance (WP-3; the prototype's enter(): the panel slides in 1.9 s after the doors start to open). While the gate
 * is up the panel waits, laid out but invisible (so the camera's fly-out can measure the space it leaves); with no gate today it is
 * there from the start. `show` makes it appear at once (entering with reduce motion, or the gate's own end).
 */
export const CONCIERGE_IN_MS = 1900;

export function useConciergeReveal(gateShown: boolean, onGateOpening?: () => void): { shown: boolean; onOpening: () => void; show: () => void } {
  const [shown, setShown] = useState(!gateShown);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  const show = useCallback(() => setShown(true), []);
  const opening = useRef(onGateOpening);
  opening.current = onGateOpening;
  const onOpening = useCallback(() => {
    opening.current?.();
    timer.current = window.setTimeout(() => { timer.current = null; setShown(true); }, CONCIERGE_IN_MS);
  }, []);
  return { shown, onOpening, show };
}
