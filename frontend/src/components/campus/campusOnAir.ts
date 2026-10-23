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
 *  - Where (decision Q2, WP-7): a broadcast that carries its class session (session_id, #3346) airs in the CLASSROOM, and its
 *    room is the session's live page; otherwise one with a room_id lights the commons (/portal/rooms is a commons prefix). One
 *    with neither has no building; the banner still names it.
 */
export const LIVE_ROOM_BUILDING: BuildingId = 'commons';
export const LIVE_CLASS_BUILDING: BuildingId = 'lecture';

/** Where a broadcast airs on the campus (Q2): the Classroom for a class session, the commons for a room, else nowhere. */
export function liveBuildingOf(b: Pick<DiscoveryBroadcast, 'room_id' | 'session_id'>): BuildingId | null {
  if (b.session_id) return LIVE_CLASS_BUILDING;
  return b.room_id ? LIVE_ROOM_BUILDING : null;
}

export function onAirBroadcasts(s: Pick<DiscoveryState, 'broadcasts' | 'disabled' | 'unavailable'>): DiscoveryBroadcast[] {
  if (s.disabled || s.unavailable) return [];
  return s.broadcasts;
}

export function onAirBuildings(list: DiscoveryBroadcast[]): Set<string> {
  return new Set(list.map(liveBuildingOf).filter((x): x is BuildingId => !!x));
}

/** Where to join a broadcast, as a portal route: the class session's live page (Q2), else its room, else null. */
export function roomRoute(b: Pick<DiscoveryBroadcast, 'room_id' | 'session_id'>): string | null {
  if (b.session_id) return `/portal/live/${encodeURIComponent(b.session_id)}`;
  return b.room_id ? `/portal/rooms/${encodeURIComponent(b.room_id)}` : null;
}

/** The broadcast the banner names: one with a place to go first (a class session or a room), else the first listed. */
export function headlineBroadcast(list: DiscoveryBroadcast[]): DiscoveryBroadcast | null {
  return list.find((b) => !!liveBuildingOf(b)) ?? list[0] ?? null;
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
  const { broadcasts } = useCampusOnAir();
  const b = headlineBroadcast(broadcasts);
  const now = useLiveClock(!!b);
  const polled = useRef<{ key: string; at: number }>({ key: '', at: Date.now() });
  const key = b ? `${b.id}:${b.preview_seconds_remaining ?? ''}:${b.reason}` : '';
  if (polled.current.key !== key) polled.current = { key, at: Date.now() };
  if (!b) return null;
  return { b, state: liveStateOf(b), now, polledAt: polled.current.at, building: liveBuildingOf(b) };
}
