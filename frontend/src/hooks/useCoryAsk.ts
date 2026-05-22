/**
 * useCoryAsk — global deeplink into the Cory assistant.
 *
 * Returns a single function: `askCory(query, source?)`. Calling it fires
 * a `cory:ask` window event that GlobalCoryWidget listens for. The widget
 * expands itself (if collapsed) and prefills + auto-sends the query.
 *
 * Why a window event rather than React context:
 *   - Zero plumbing through layouts. Any surface in the SPA can deeplink
 *     by calling the hook; no Provider has to be threaded.
 *   - Cory remains the single owner of the open/closed state.
 *   - Future callers (Critique, Blueprint, System rows) wire up with
 *     one line.
 *
 * The event payload is typed via the CoryAskEventDetail interface below.
 * Add the matching `declare global { interface WindowEventMap { ... } }`
 * once if stricter typing on `window.addEventListener` is ever needed —
 * not required today since GlobalCoryWidget casts the event detail.
 */
import { useCallback } from 'react';

export const CORY_ASK_EVENT = 'cory:ask';

export interface CoryAskEventDetail {
  query: string;
  /** Where the deeplink came from — for analytics + debugging. */
  source?: string;
}

export function useCoryAsk(): (query: string, source?: string) => void {
  return useCallback((query: string, source?: string) => {
    const trimmed = (query || '').trim();
    if (!trimmed) return;
    const detail: CoryAskEventDetail = { query: trimmed, source };
    window.dispatchEvent(new CustomEvent(CORY_ASK_EVENT, { detail }));
  }, []);
}
