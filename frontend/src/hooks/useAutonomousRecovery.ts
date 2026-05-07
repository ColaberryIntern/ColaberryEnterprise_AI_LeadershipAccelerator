import { useEffect, useMemo, useState } from 'react';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface RecoveryEvent {
  kind: string;
  project_id: string;
  severity: string;
  payload: any;
  emitted_at: string;
}

const RECOVERY_KINDS = [
  'autonomy.self_heal.triggered',
  'mutation.containment.activated',
  'mutation.rollback.completed',
  'autonomy.execution.failed',
  'mutation.execution.failed',
];

/**
 * Phase 15 — passive feed of autonomous recovery activity. Combines
 * Phase 14 self-heal events with Phase 15 mutation containment +
 * rollback events so dashboards can show one unified "the system is
 * stabilizing itself" surface without having to merge feeds in the UI.
 *
 * No fetch — stream-only. The /replay endpoint already covers
 * historical lookup via useAutonomyReplay.
 */
export function useAutonomousRecovery(opts?: { historyLimit?: number }) {
  const historyLimit = opts?.historyLimit ?? 30;
  const [events, setEvents] = useState<RecoveryEvent[]>([]);
  const stream = useRealtimeAwareness({ kinds: RECOVERY_KINDS });

  useEffect(() => {
    const ev = stream.latest as any;
    if (!ev || !RECOVERY_KINDS.includes(ev.kind)) return;
    setEvents(h => [ev as RecoveryEvent, ...h].slice(0, historyLimit));
  }, [stream.latest, historyLimit]);

  const summary = useMemo(() => {
    const byKind: Record<string, number> = {};
    for (const e of events) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    return { total: events.length, by_kind: byKind };
  }, [events]);

  return { events, summary, streamConnected: stream.connected };
}
