import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

/**
 * A card that opens where you pressed (WP-5; the prototype's cardPos + openCard, D:2572-2618), shared by the person, staff and
 * partner cards (the peek has its own copy of the same rules):
 *  - 300 px wide, centred on the press, kept 10 px inside the window and at least 76 px down (clear of the top bar);
 *  - a press outside closes it (the opening press is not one: the listener starts on the next tick);
 *  - focus moves to it on open. On phones CSS makes it a bottom sheet.
 */
export const POP_W = 300;
export type At = { x: number; y: number };

export function popPosition(at: At | undefined, h: number): { left: number; top: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const x = at?.x ?? vw / 2, y = at?.y ?? 120;
  return { left: Math.max(10, Math.min(vw - POP_W - 10, x - POP_W / 2)), top: Math.max(76, Math.min(vh - h - 10, y + 12)) };
}

export function usePopover(onClose: () => void): MutableRefObject<HTMLDivElement | null> {
  const box = useRef<HTMLDivElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) close.current(); };
    const t = window.setTimeout(() => document.addEventListener('mousedown', out), 0);
    return () => { window.clearTimeout(t); document.removeEventListener('mousedown', out); };
  }, []);
  return box;
}
