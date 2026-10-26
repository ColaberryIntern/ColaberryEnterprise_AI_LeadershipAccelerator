import { useEffect, useState } from 'react';
import { getBoard } from './boardData';

/**
 * The board badge count (Campus v14 B5, Basecamp C70): notes new since your last look plus new replies on your posts, from the light
 * GET /community/board?counts_only=1, polled at the campus presence cadence (30 s). One shared poll for every badge on the page (the map
 * sign and the side panel's "Ask the community" chip). A failure keeps the last number (no badge flicker), never an invented one.
 */
export const BADGE_POLL_MS = 30_000;
type Listener = (n: number) => void;
const listeners = new Set<Listener>();
let last = 0;
let timer: number | null = null;

function poll(): void {
  getBoard({ countsOnly: true })
    .then((d) => { last = d.new_since.count + d.my_new_replies; listeners.forEach((l) => l(last)); })
    .catch(() => { /* keep the last number */ });
}

export function badgeLabel(n: number): string { return n > 9 ? '9+' : String(n); }

export function useBoardBadge(): number {
  const [n, setN] = useState(last);
  useEffect(() => {
    listeners.add(setN);
    if (listeners.size === 1) { poll(); timer = window.setInterval(poll, BADGE_POLL_MS); }
    return () => {
      listeners.delete(setN);
      if (!listeners.size && timer !== null) { window.clearInterval(timer); timer = null; }
    };
  }, []);
  return n;
}

/** Tests only. */
export function __resetBoardBadgeForTests(): void { listeners.clear(); last = 0; if (timer !== null) { window.clearInterval(timer); timer = null; } }
