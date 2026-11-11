import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Full screen for the Colaberry TV player (Basecamp C137; Ali, 11 Nov 2026: "we should be able to click a full screen on the videos so
 * we can show them at the beginning of our events easily"). It fullscreens OUR player box, not YouTube's frame, so the TV keeps
 * control: the shorts still advance by themselves and loop, sound and Tap for sound still work. `supported` is false where the
 * browser has no element full screen (iPhone Safari): the button is then not shown, rather than shown and broken.
 * A refused request (no user gesture, a policy) is logged with its class and changes nothing.
 */
export function fullscreenSupported(doc: Document = document): boolean {
  return !!doc.fullscreenEnabled && typeof doc.documentElement.requestFullscreen === 'function';
}

export function useFullscreen<T extends HTMLElement>(): { ref: React.RefObject<T>; supported: boolean; active: boolean; toggle: () => void } {
  const ref = useRef<T>(null);
  const [active, setActive] = useState(false);
  const supported = fullscreenSupported();

  useEffect(() => {
    const onChange = () => setActive(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const p = document.fullscreenElement === el ? document.exitFullscreen() : el.requestFullscreen();
    Promise.resolve(p).catch((err: unknown) => {
      console.warn(JSON.stringify({ level: 'warn', service: 'campus', event: 'colaberry_tv_fullscreen_failed', outcome: 'failure',
        error_class: (err as { name?: string })?.name || 'Error' }));
    });
  }, []);

  return { ref, supported, active, toggle };
}
