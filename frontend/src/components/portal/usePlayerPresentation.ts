import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Presentation state for the broadcast player: mini / theater / fullscreen.
 *
 * Extracted from `LiveMiniPlayer` so the component stays mostly markup, and so the two
 * behaviours that are easy to get wrong can be tested without rendering anything:
 *
 *  - FOCUS MUST COME BACK. Leaving fullscreen is how a keyboard user loses their place:
 *    the element that had focus is gone from the layout, browsers vary in where they put
 *    focus next, and a screen-reader user ends up at the top of the document. The trigger
 *    is remembered on the way in and focused on the way out.
 *
 *  - FULLSCREEN MAY NOT EXIST. iOS Safari on iPhone exposes no element fullscreen at all,
 *    and an embedded webview may refuse. `supportsFullscreen` is reported rather than
 *    assumed, so the UI can offer theater mode as a LABELLED alternative instead of
 *    rendering a button that silently does nothing.
 */

export type PlayerMode = 'mini' | 'theater';

export interface PlayerPresentation {
  mode: PlayerMode;
  isFullscreen: boolean;
  supportsFullscreen: boolean;
  prefersReducedMotion: boolean;
  setMode: (mode: PlayerMode) => void;
  toggleFullscreen: () => void;
}

/** Element-level fullscreen, which is a different capability from "has a Fullscreen API". */
function detectFullscreenSupport(): boolean {
  if (typeof document === 'undefined') return false;
  // `fullscreenEnabled` is false inside an iframe without allowfullscreen, and absent
  // entirely on iPhone Safari — both cases must read as unsupported.
  if (typeof document.fullscreenEnabled === 'boolean') return document.fullscreenEnabled;
  return typeof document.documentElement.requestFullscreen === 'function';
}

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function usePlayerPresentation(
  target: React.RefObject<HTMLElement | null>,
): PlayerPresentation {
  const [mode, setMode] = useState<PlayerMode>('mini');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supportsFullscreen] = useState(detectFullscreenSupport);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(detectReducedMotion);
  /** Where focus was when fullscreen was requested, so it can be put back. */
  const returnFocusTo = useRef<HTMLElement | null>(null);

  // The preference can change mid-session (a system setting, or devtools emulation), and a
  // player that keeps animating after the user asked it not to is the whole complaint.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = (): void => setPrefersReducedMotion(query.matches);
    // Safari below 14 has only the deprecated addListener; both are optional here.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', read);
      return () => query.removeEventListener('change', read);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onChange = (): void => {
      const active = document.fullscreenElement !== null && document.fullscreenElement !== undefined;
      setIsFullscreen(active);
      if (!active && returnFocusTo.current) {
        // The browser has already moved focus somewhere of its own choosing by now, so this
        // is a correction rather than a precaution.
        returnFocusTo.current.focus();
        returnFocusTo.current = null;
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = target.current;
    if (!el) return;

    if (document.fullscreenElement) {
      // exitFullscreen rejects if nothing is fullscreen; it is also absent in jsdom.
      void document.exitFullscreen?.();
      return;
    }

    if (!supportsFullscreen || typeof el.requestFullscreen !== 'function') return;
    returnFocusTo.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    // A rejected request (a webview policy, or no user gesture) must not leave the UI
    // claiming to be fullscreen, and must not strand the remembered focus target.
    Promise.resolve(el.requestFullscreen()).catch(() => {
      returnFocusTo.current = null;
      setIsFullscreen(false);
    });
  }, [supportsFullscreen, target]);

  return { mode, isFullscreen, supportsFullscreen, prefersReducedMotion, setMode, toggleFullscreen };
}
