import { useEffect, useState } from 'react';
import { MotionChoice, effectiveReduceMotion, prefersReducedMotion, subscribeReducedMotion } from './campusSettings';

/** Class on <html> while the campus should not animate; CSS keys ambient motion (the on-air pulse) off it. */
export const REDUCED_CLASS = 'cm-reduced';

/**
 * The reduce-motion value the campus acts on (C11): the learner's choice when made, otherwise the
 * device preference, followed LIVE so turning it on in the OS takes effect without a reload.
 * While `active`, mirrors the value onto <html> as `cm-reduced` so CSS-only animation obeys the
 * campus setting too, not just the OS media query. Removes the class on unmount or when inactive.
 */
export function useEffectiveReduceMotion(motion: MotionChoice, active: boolean): boolean {
  const [device, setDevice] = useState<boolean>(() => prefersReducedMotion());
  useEffect(() => subscribeReducedMotion(setDevice), []);
  const reduce = effectiveReduceMotion(motion, device);

  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    root.classList.toggle(REDUCED_CLASS, reduce);
    return () => root.classList.remove(REDUCED_CLASS);
  }, [active, reduce]);

  return reduce;
}
