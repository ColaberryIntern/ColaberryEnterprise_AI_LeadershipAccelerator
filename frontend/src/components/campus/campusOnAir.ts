import { useMemo, useRef } from 'react';
import { useDiscoveryState } from '../../contexts/BroadcastDiscoveryContext';
import type { DiscoveryBroadcast, DiscoveryState } from '../../hooks/useBroadcastDiscovery';
import type { BuildingId } from './campusMap';
import { liveStateOf, useLiveClock } from './campusLiveState';
import type { LiveState } from './campusLiveState';

/**
 * Live mode on the campus (Colaberry Campus C8), from the portal's existing broadcast discovery (useDiscoveryState: polled at the
 * server's pace, paused when hidden, backed off on errors; ROLLOUT_RUNBOOK P3-09 rules out SSE). The campus adds no request.
 *
 *  - What is on air: whatever discovery lists (the server returns only live and reconnecting broadcasts). Disabled or
 *    unavailable discovery shows nothing, never a stale "on air".
 *  - Where: a broadcast joins the portal only through its room_id, and rooms live in the commons building (/portal/rooms is a
 *    commons prefix), so a room broadcast lights the commons. One without a room has no building; the banner still names it.
 */
export const LIVE_ROOM_BUILDING: BuildingId = 'commons';

export function onAirBroadcasts(s: Pick<DiscoveryState, 'broadcasts' | 'disabled' | 'unavailable'>): DiscoveryBroadcast[] {
  if (s.disabled || s.unavailable) return [];
  return s.broadcasts;
}

export function onAirBuildings(list: DiscoveryBroadcast[]): Set<string> {
  return new Set(list.some((b) => !!b.room_id) ? [LIVE_ROOM_BUILDING] : []);
}

/** The room a broadcast is airing in, as a portal route, or null. */
export function roomRoute(b: Pick<DiscoveryBroadcast, 'room_id'>): string | null {
  return b.room_id ? `/portal/rooms/${encodeURIComponent(b.room_id)}` : null;
}

/** The broadcast the banner names: one in a room first (it has a place to go), else the first listed. */
export function headlineBroadcast(list: DiscoveryBroadcast[]): DiscoveryBroadcast | null {
  return list.find((b) => !!b.room_id) ?? list[0] ?? null;
}

/** What is on air now and which buildings show it. */
export function useCampusOnAir(): { broadcasts: DiscoveryBroadcast[]; buildings: Set<string> } {
  const state = useDiscoveryState();
  return useMemo(() => {
    const broadcasts = onAirBroadcasts(state);
    return { broadcasts, buildings: onAirBuildings(broadcasts) };
  }, [state]);
}

/**
 * WP-6: the headline broadcast with its state and a one-second clock, for every live surface (the marquee, the live bar, the
 * concierge card, the arrival card, the gate). `polledAt` is when its preview count was last read, so an Explorer's preview can
 * count down locally between polls.
 */
export interface CampusLiveNow { b: DiscoveryBroadcast; state: LiveState; now: number; polledAt: number; building: BuildingId | null }
export function useLiveNow(): CampusLiveNow | null {
  const { broadcasts, buildings } = useCampusOnAir();
  const b = headlineBroadcast(broadcasts);
  const now = useLiveClock(!!b);
  const polled = useRef<{ key: string; at: number }>({ key: '', at: Date.now() });
  const key = b ? `${b.id}:${b.preview_seconds_remaining ?? ''}:${b.reason}` : '';
  if (polled.current.key !== key) polled.current = { key, at: Date.now() };
  if (!b) return null;
  return { b, state: liveStateOf(b), now, polledAt: polled.current.at, building: ([...buildings][0] ?? null) as BuildingId | null };
}
