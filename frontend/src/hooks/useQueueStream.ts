/**
 * useQueueStream — subscribes to queue.reranked events. Exposes the latest
 * rerank metadata so dashboards can flash an indicator when the queue moves.
 */
import { useEffect, useState } from 'react';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface QueueRerankSignal {
  trigger: string;
  elapsed_ms: number;
  queue_length: number;
  next_task_id: string | null;
  contradiction_count: number;
  sync_health: number;
  emitted_at: string;
}

export function useQueueStream() {
  const { events, connected } = useRealtimeAwareness({
    endpoint: '/api/portal/project/awareness/queue/stream',
    buffer_size: 20,
  });
  const latest = events[events.length - 1] ?? null;

  // Flash flag — true for 2s after a fresh rerank, then clears
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!latest) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 2000);
    return () => clearTimeout(t);
  }, [latest?.id]);

  const signal: QueueRerankSignal | null = latest
    ? {
        trigger: latest.payload?.trigger ?? 'unknown',
        elapsed_ms: latest.payload?.elapsed_ms ?? 0,
        queue_length: latest.payload?.queue_length ?? 0,
        next_task_id: latest.payload?.next_task_id ?? null,
        contradiction_count: latest.payload?.contradiction_count ?? 0,
        sync_health: latest.payload?.sync_health ?? 100,
        emitted_at: latest.emitted_at,
      }
    : null;

  return { signal, flash, connected, all_signals: events };
}
