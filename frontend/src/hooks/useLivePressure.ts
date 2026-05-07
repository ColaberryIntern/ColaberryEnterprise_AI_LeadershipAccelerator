/**
 * useLivePressure — subscribes to pressure-only SSE stream and exposes the
 * current tier + value, plus the timestamp of the last escalation.
 */
import { useMemo } from 'react';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type PressureTier = 'calm' | 'elevated' | 'urgent' | 'critical';

export interface LivePressureState {
  pressure: number;
  tier: PressureTier;
  last_change_at: string | null;
  last_escalation_at: string | null;
  recently_escalated: boolean;
  connected: boolean;
}

export function useLivePressure(): LivePressureState {
  const { events, connected } = useRealtimeAwareness({
    endpoint: '/api/portal/project/awareness/pressure/stream',
    buffer_size: 30,
  });

  return useMemo<LivePressureState>(() => {
    let pressure = 0;
    let tier: PressureTier = 'calm';
    let last_change_at: string | null = null;
    let last_escalation_at: string | null = null;
    let recently_escalated = false;

    for (const evt of events) {
      const p = evt.payload || {};
      if (typeof p.pressure === 'number') pressure = p.pressure;
      if (p.tier) tier = p.tier;
      if (evt.kind === 'pressure.changed') last_change_at = evt.emitted_at;
      if (evt.kind === 'pressure.escalated') {
        last_escalation_at = evt.emitted_at;
        // "Recently escalated" = within the last 60s — UI can flash a badge
        const ageMs = Date.now() - new Date(evt.emitted_at).getTime();
        if (ageMs < 60_000) recently_escalated = true;
      }
    }

    return { pressure, tier, last_change_at, last_escalation_at, recently_escalated, connected };
  }, [events, connected]);
}
