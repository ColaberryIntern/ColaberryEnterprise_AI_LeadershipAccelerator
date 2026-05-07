import { useEffect, useMemo, useState } from 'react';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface CausalTrustEvent {
  kind: 'trust.propagation.shifted';
  project_id: string;
  severity: string;
  payload: {
    node_id?: string;
    inherited_decay?: number;
    effective_trust?: number;
  };
  emitted_at: string;
}

/**
 * Phase 16 — passive feed of `trust.propagation.shifted` events. The
 * backend emits these whenever a parent mutation's trust drops and the
 * decay propagates to its descendants. The hook surfaces the latest
 * propagation event + a rolling history.
 */
export function useCausalTrust(opts?: { historyLimit?: number }) {
  const historyLimit = opts?.historyLimit ?? 30;
  const [events, setEvents] = useState<CausalTrustEvent[]>([]);
  const stream = useRealtimeAwareness({ kinds: ['trust.propagation.shifted'] });

  useEffect(() => {
    const ev = stream.latest as any;
    if (!ev || ev.kind !== 'trust.propagation.shifted') return;
    setEvents(h => [ev as CausalTrustEvent, ...h].slice(0, historyLimit));
  }, [stream.latest, historyLimit]);

  const summary = useMemo(() => {
    if (events.length === 0) return { count: 0, max_decay: 0 };
    const max = events.reduce((m, e) => Math.max(m, e.payload?.inherited_decay ?? 0), 0);
    return { count: events.length, max_decay: max };
  }, [events]);

  return { events, summary, streamConnected: stream.connected };
}
