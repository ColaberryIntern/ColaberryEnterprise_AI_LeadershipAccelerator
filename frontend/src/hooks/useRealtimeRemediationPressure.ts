import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface RemediationPressureSnapshot {
  pressure: number;             // 0-100
  tier: 'calm' | 'elevated' | 'urgent' | 'critical';
}

/**
 * Phase 11 — combines an initial poll of /remediation/pressure with an
 * SSE subscription to remediation.pressure.changed events. Frontend
 * surfaces (RealtimeRemediationDashboard) get live tier updates without
 * poll, with a baseline reading on mount.
 */
export function useRealtimeRemediationPressure(opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled !== false;
  const [data, setData] = useState<RemediationPressureSnapshot | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['remediation.pressure.changed'], enabled });

  const fetchInitial = useCallback(async () => {
    try {
      const r = await portalApi.get('/api/portal/project/remediation/pressure');
      setData(r.data as RemediationPressureSnapshot);
    } catch {
      /* fail-soft */
    }
  }, []);

  useEffect(() => { if (enabled) void fetchInitial(); }, [enabled, fetchInitial]);

  useEffect(() => {
    const e = stream.latest;
    if (!e || e.kind !== 'remediation.pressure.changed') return;
    if (typeof e.payload?.pressure === 'number' && typeof e.payload?.tier === 'string') {
      setData({ pressure: e.payload.pressure, tier: e.payload.tier });
    }
  }, [stream.latest]);

  return { data, connected: stream.connected, error: stream.error, refresh: fetchInitial };
}
