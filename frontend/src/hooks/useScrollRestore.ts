import { useEffect, useRef } from 'react';

/**
 * useScrollRestore — the sessionStorage scroll-restore pattern proven in
 * ClassroomPage.tsx, extracted so other feed-shaped pages (starting with
 * TodayShell) can reuse it instead of resetting to the top after a student
 * leaves for the runtime workspace and comes back (via its Back button OR the
 * browser's own back button). Session-scoped (per browser tab); cleared
 * naturally when the tab closes.
 */

export interface ViewSnapshot<T> {
  extra: T;
  scrollY: number;
}

export function readViewSnapshot<T>(key: string): ViewSnapshot<T> | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ViewSnapshot<T>) : null;
  } catch { return null; }
}

export function writeViewSnapshot<T>(key: string, snap: ViewSnapshot<T>): void {
  try { window.sessionStorage.setItem(key, JSON.stringify(snap)); } catch { /* private mode / quota — non-fatal */ }
}

/**
 * Restore window scroll to targetY, but only once the feed is tall enough to
 * actually reach it. The feed's card thumbnails (video/podcast posters) load
 * AFTER the cards render, so right after a remount the document is short and a
 * naive window.scrollTo(0, targetY) clamps near the top — which is the "back
 * sends me to the top" bug. So we poll per animation frame until the document
 * can reach targetY (images have grown it back to the height it had when we
 * saved), then scroll once. We bail the moment the student scrolls themselves,
 * so we never fight them, and give up after a cap so a genuinely-shorter feed
 * (e.g. a card was completed/removed) doesn't spin.
 */
export function restoreScroll(targetY: number): void {
  if (!targetY || targetY <= 0) return;
  let done = false;
  const cleanup = () => {
    window.removeEventListener('wheel', onUser);
    window.removeEventListener('touchstart', onUser);
  };
  function onUser() { done = true; cleanup(); }
  window.addEventListener('wheel', onUser, { passive: true });
  window.addEventListener('touchstart', onUser, { passive: true });
  const start = performance.now();
  const tick = () => {
    if (done) return;
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    if (maxY >= targetY - 4 || performance.now() - start > 3000) {
      // behavior:'instant' is required, not cosmetic: this app sets
      // scroll-behavior:smooth on <html> globally, which makes the 2-argument
      // scrollTo(x, y) form silently launch a multi-second ANIMATED scroll
      // instead of jumping — so a restore to a deep position would sit at 0 for
      // seconds before visibly arriving. The object form with 'instant'
      // bypasses the CSS setting and jumps immediately, every time.
      window.scrollTo({ top: targetY, left: 0, behavior: 'instant' });
      done = true;
      cleanup();
    } else {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

/**
 * Continuously persists {scrollY, ...extra} to sessionStorage on every scroll
 * frame, while `ready` is true. This MUST be live, on scroll — NOT an unmount
 * cleanup: a useEffect cleanup runs AFTER React has already swapped the page's
 * DOM out for wherever navigation is heading and App-level ScrollToTop has
 * zeroed the window, so window.scrollY reads ~0 there. (That was the "back
 * always lands at the top" bug — every save recorded scrollY: 0.) `getExtra`
 * is read fresh on every save via a ref so callers don't need to worry about
 * stale closures.
 */
export function usePersistScrollOnScroll<T>(key: string, ready: boolean, getExtra: () => T): void {
  const getExtraRef = useRef(getExtra);
  getExtraRef.current = getExtra;
  useEffect(() => {
    if (!ready) return undefined;
    let raf = 0;
    const persist = () => { raf = 0; writeViewSnapshot(key, { extra: getExtraRef.current(), scrollY: window.scrollY }); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(persist); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [key, ready]);
}
