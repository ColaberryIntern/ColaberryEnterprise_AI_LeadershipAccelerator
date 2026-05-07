import { useEffect, useRef } from 'react';
import { useRemediationIntelligence } from './useRemediationIntelligence';
import { useRealtimeAwareness } from './useRealtimeAwareness';

const REMEDIATION_KINDS = [
  'remediation.cluster.detected',
  'remediation.cluster.reranked',
  'remediation.cluster.resolved',
  'remediation.regression.detected',
  'remediation.pressure.changed',
];

const DEBOUNCE_MS = 250;

/**
 * Phase 11 — composes useRemediationIntelligence (poll) + useRealtimeAwareness
 * (SSE) so the report auto-refetches when relevant events arrive. Refetches
 * are trailing-debounced 250ms AND deduped by (kind, payload.cluster_signature)
 * within a 2s window — 3 events on the same cluster in quick succession
 * collapse into a single refetch.
 */
export function useLiveRemediationIntelligence(bpId: string | null) {
  const intel = useRemediationIntelligence(bpId, { autoFetch: true });
  const stream = useRealtimeAwareness({ kinds: REMEDIATION_KINDS, enabled: !!bpId });

  const seenRef = useRef<Map<string, number>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef(intel.refresh);
  refreshRef.current = intel.refresh;

  useEffect(() => {
    const latest = stream.latest;
    if (!latest || !bpId) return;
    if (latest.payload?.capability_id && latest.payload.capability_id !== bpId) return;
    const dedupeKey = `${latest.kind}|${latest.payload?.cluster_signature ?? ''}`;
    const now = Date.now();
    const lastSeen = seenRef.current.get(dedupeKey) || 0;
    if (now - lastSeen < 2_000) return;
    seenRef.current.set(dedupeKey, now);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void refreshRef.current(); }, DEBOUNCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [stream.latest, bpId]);

  return {
    ...intel,
    streamConnected: stream.connected,
    streamError: stream.error,
    recentEvents: stream.events,
  };
}
