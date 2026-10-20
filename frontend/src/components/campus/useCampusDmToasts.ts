import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchConversationsQuiet } from './campusPeopleApi';
import { myEnrollmentId } from '../../services/dmApi';

/**
 * "X sent you a message" on the campus (Colaberry Campus C5). Polling, never push (the portal uses a Bearer JWT).
 *
 *  - Runs only while the campus is active and the tab is visible; nothing is requested otherwise.
 *  - The FIRST successful read is the baseline: unread messages that were already there raise no toast.
 *  - A later read raises one toast for a conversation whose lastAt moved past the last value seen, that is unread, and
 *    whose peer is not me. Keyed by roomId + lastAt, so the same message can never toast twice.
 *  - One toast at a time (the newest wins); it hides itself after TOAST_MS.
 *  - A failed read is silent and retried next tick (the Messages button still shows unread on Today).
 */
// 45 s, the notification bell's cadence (contract D7, amended in revision 3 from 30 s). Polled from CampusProvider (persistent across pages), so navigating never
// re-baselines it or refetches per page.
export const DM_TOAST_POLL_MS = 45_000;
// C11: 12 s (was 8 s), and paused while the toast has focus or the pointer (WCAG 2.2.1).
export const TOAST_MS = 12_000;

export interface DmToast { key: string; peerId: string; peerName: string }

/** Why the toast is being held open: the pointer is over it, or focus is inside it. Tracked separately (C11). */
export type ToastHold = 'hover' | 'focus';
export interface DmToastControls { toast: DmToast | null; dismiss: () => void; hold: (why: ToastHold) => void; release: (why: ToastHold) => void }

export function useCampusDmToasts(active: boolean): DmToastControls {
  const [toast, setToast] = useState<DmToast | null>(null);
  const seen = useRef<Map<string, string> | null>(null); // roomId -> lastAt; null until the baseline
  const toasted = useRef(new Set<string>());
  const hideTimer = useRef<number | null>(null);
  // Two flags, not one: a pointer leaving must not restart the timer while focus is still inside (and vice versa).
  const held = useRef<Record<ToastHold, boolean>>({ hover: false, focus: false });
  const isHeld = () => held.current.hover || held.current.focus;

  const clearHide = () => { if (hideTimer.current !== null) { window.clearTimeout(hideTimer.current); hideTimer.current = null; } };
  const scheduleHide = () => {
    clearHide();
    if (!isHeld()) hideTimer.current = window.setTimeout(() => { hideTimer.current = null; setToast(null); }, TOAST_MS);
  };
  const dismiss = useCallback(() => { clearHide(); held.current = { hover: false, focus: false }; setToast(null); }, []);
  // C11 (WCAG 2.2.1): a toast with an action must not vanish under a learner reading it or tabbing to Open. While it has focus
  // or the pointer, the timer stops; when both leave, the full TOAST_MS starts again.
  const hold = useCallback((why: ToastHold) => { held.current = { ...held.current, [why]: true }; clearHide(); }, []);
  const release = useCallback((why: ToastHold) => { held.current = { ...held.current, [why]: false }; scheduleHide(); }, []); // the timer helpers only touch refs and the stable setToast

  useEffect(() => {
    if (!active) { seen.current = null; return undefined; }
    let alive = true;
    let inflight = false;
    const me = myEnrollmentId();

    const tick = async (): Promise<void> => {
      if (inflight || document.visibilityState === 'hidden') return;
      inflight = true;
      try {
        const convos = await fetchConversationsQuiet();
        if (!alive) return;
        const prev = seen.current;
        const next = new Map(convos.map((c) => [c.roomId, c.lastAt]));
        seen.current = next;
        if (!prev) return; // baseline
        const fresh = convos
          .filter((c) => c.unread && c.peerId !== me && c.lastAt && c.lastAt !== prev.get(c.roomId))
          .filter((c) => !toasted.current.has(c.roomId + '|' + c.lastAt))
          .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
        const top = fresh[0];
        if (!top) return;
        const key = top.roomId + '|' + top.lastAt;
        toasted.current.add(key);
        setToast({ key, peerId: top.peerId, peerName: top.peerName });
        scheduleHide();
      } catch {
        // Silent by design: retried next tick; the inbox elsewhere still shows unread.
      } finally {
        inflight = false;
      }
    };

    void tick();
    const id = window.setInterval(() => { void tick(); }, DM_TOAST_POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [active]);

  useEffect(() => () => { if (hideTimer.current !== null) window.clearTimeout(hideTimer.current); }, []);
  return { toast, dismiss, hold, release };
}
