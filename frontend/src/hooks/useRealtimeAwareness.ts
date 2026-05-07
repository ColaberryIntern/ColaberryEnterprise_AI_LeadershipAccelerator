/**
 * useRealtimeAwareness — base SSE hook subscribing to the awareness stream.
 *
 * Higher-level hooks (useLivePressure, useQueueStream, useCognitiveIncidents,
 * useLiveContradictions) wrap this with kind filters.
 *
 * Uses the browser's native EventSource. The backend's `/awareness/stream`
 * endpoint requires participant auth — the cookie travels automatically.
 *
 * Phase 8 §19.
 */
import { useEffect, useRef, useState } from 'react';

export interface CognitiveStreamEvent {
  id: string;
  kind: string;
  project_id: string;
  emitted_at: string;
  severity?: 'info' | 'warning' | 'error';
  payload: any;
}

export interface UseAwarenessOptions {
  /** Filter to specific event kinds (server-side filter). */
  kinds?: ReadonlyArray<string>;
  /** When false, the stream isn't opened (useful while route param is null). */
  enabled?: boolean;
  /** Cap the in-memory event buffer. Default 100. */
  buffer_size?: number;
  /** Specific endpoint variant (default `/awareness/stream`). */
  endpoint?: string;
}

export interface UseAwarenessResult {
  events: CognitiveStreamEvent[];
  latest: CognitiveStreamEvent | null;
  connected: boolean;
  error: string | null;
  clear: () => void;
}

export function useRealtimeAwareness(opts: UseAwarenessOptions = {}): UseAwarenessResult {
  const { kinds, enabled = true, buffer_size = 100, endpoint = '/api/portal/project/awareness/stream' } = opts;
  const [events, setEvents] = useState<CognitiveStreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const url = kinds && kinds.length > 0
      ? `${endpoint}?kinds=${encodeURIComponent(kinds.join(','))}`
      : endpoint;
    const src = new EventSource(url, { withCredentials: true });
    sourceRef.current = src;

    src.onopen = () => { setConnected(true); setError(null); };
    src.onerror = () => {
      setConnected(false);
      setError('Stream interrupted; reconnecting…');
      // EventSource auto-reconnects, but on transient errors we surface a soft state.
    };
    src.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as CognitiveStreamEvent;
        setEvents(prev => {
          const next = [...prev, event];
          if (next.length > buffer_size) next.splice(0, next.length - buffer_size);
          return next;
        });
      } catch { /* drop malformed */ }
    };

    return () => {
      try { src.close(); } catch { /* ignore */ }
      sourceRef.current = null;
      setConnected(false);
    };
  }, [enabled, endpoint, kinds?.join(',') ?? '', buffer_size]);

  return {
    events,
    latest: events[events.length - 1] ?? null,
    connected,
    error,
    clear: () => setEvents([]),
  };
}
