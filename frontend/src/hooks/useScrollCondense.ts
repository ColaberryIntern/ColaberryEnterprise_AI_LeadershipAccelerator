import { useEffect, useRef, useState } from 'react';

/**
 * Pure hysteresis predicate — exported separately from the stateful hook so it's
 * unit-testable without simulating window.scrollY in jsdom. Holds the previous
 * state while scrollY sits between exitAt and enterAt, so a scroll wobble at the
 * boundary can't flicker the condensed transition back and forth.
 */
export function nextCondensed(prev: boolean, scrollY: number, enterAt: number, exitAt: number): boolean {
  if (scrollY >= enterAt) return true;
  if (scrollY <= exitAt) return false;
  return prev;
}

/**
 * Shared scroll-condense signal for PortalShell's header. rAF-gated so it fires
 * at most once per frame regardless of scroll-event volume.
 */
export function useScrollCondense(enterAt = 220, exitAt = 140): boolean {
  const [condensed, setCondensed] = useState(false);
  const tickingRef = useRef(false);
  const condensedRef = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        const next = nextCondensed(condensedRef.current, window.scrollY, enterAt, exitAt);
        if (next !== condensedRef.current) {
          condensedRef.current = next;
          setCondensed(next);
        }
        tickingRef.current = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [enterAt, exitAt]);

  return condensed;
}
