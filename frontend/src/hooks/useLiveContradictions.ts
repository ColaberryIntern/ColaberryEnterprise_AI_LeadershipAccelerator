/**
 * useLiveContradictions — subscribes to contradiction-related events for
 * live overlays on the decision graph + dashboard.
 */
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface LiveContradictionSignal {
  id: string;
  kind: string;                 // 'contradiction.detected' | 'regression.detected' etc.
  severity: 'info' | 'warning' | 'error';
  emitted_at: string;
  payload: any;
}

export function useLiveContradictions() {
  const { events, connected } = useRealtimeAwareness({
    endpoint: '/api/portal/project/awareness/contradictions/stream',
    buffer_size: 50,
  });
  const recent: LiveContradictionSignal[] = events.map(e => ({
    id: e.id,
    kind: e.kind,
    severity: e.severity ?? 'info',
    emitted_at: e.emitted_at,
    payload: e.payload,
  }));
  return { recent, connected, latest: recent[recent.length - 1] ?? null };
}
