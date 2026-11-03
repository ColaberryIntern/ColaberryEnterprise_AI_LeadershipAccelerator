import { useCallback, useEffect, useRef } from 'react';
import { todayFeedApi, MAX_EVENTS_PER_CALL } from './todayFeedApi';

/**
 * C107 (C98 recommendation 3): record a Today card as 'seen' the first time at least half of it is on screen.
 *
 * The server used to log an item when it was BUILT, so the C98 audit could not tell "never scrolled to" from "seen and
 * skipped". Each ref is sent once per visit, batched (at most MAX_EVENTS_PER_CALL per call, flushed after FLUSH_MS or
 * when the tab is hidden); the server keeps only the first sighting per person anyway, so a resend is harmless.
 * Best-effort: a failed send is dropped, never retried and never shown. No IntersectionObserver (old browser, jsdom):
 * nothing is recorded and the feed is unaffected.
 *
 * Returns a callback ref factory: `<div ref={track(item.ref)}>`.
 */
export const SEEN_THRESHOLD = 0.5;
export const FLUSH_MS = 2000;

export function useSeenTracker(enabled: boolean): (ref: string) => (el: HTMLElement | null) => void {
  const sent = useRef(new Set<string>());
  const queue = useRef<string[]>([]);
  const timer = useRef<number | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const elRef = useRef(new WeakMap<Element, string>());
  // Child refs attach during commit, BEFORE this hook's effect creates the observer: hold them until it exists.
  const pending = useRef(new Set<Element>());

  const flush = useCallback(() => {
    if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null; }
    while (queue.current.length) {
      const batch = queue.current.splice(0, MAX_EVENTS_PER_CALL);
      void todayFeedApi.events(batch.map((ref) => ({ ref, event: 'seen' as const, source: 'feed' as const }))).catch(() => { /* measurement only */ });
    }
  }, []);

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return undefined;
    observer.current = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || e.intersectionRatio < SEEN_THRESHOLD) continue;
        const ref = elRef.current.get(e.target);
        observer.current?.unobserve(e.target);
        if (!ref || sent.current.has(ref)) continue;
        sent.current.add(ref);
        queue.current.push(ref);
      }
      if (queue.current.length >= MAX_EVENTS_PER_CALL) flush();
      else if (queue.current.length && timer.current == null) timer.current = window.setTimeout(flush, FLUSH_MS);
    }, { threshold: SEEN_THRESHOLD });
    pending.current.forEach((el) => observer.current?.observe(el));
    pending.current.clear();
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      observer.current?.disconnect();
      observer.current = null;
      flush();
    };
  }, [enabled, flush]);

  return useCallback((ref: string) => (el: HTMLElement | null) => {
    if (!el || sent.current.has(ref)) return;
    elRef.current.set(el, ref);
    if (observer.current) observer.current.observe(el);
    else pending.current.add(el);
  }, []);
}
