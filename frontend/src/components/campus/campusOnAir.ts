import { useMemo, useRef } from 'react';
import { useDiscoveryState } from '../../contexts/BroadcastDiscoveryContext';
import type { DiscoveryBroadcast, DiscoveryState } from '../../hooks/useBroadcastDiscovery';
import type { BuildingId } from './campusMap';
import { liveStateOf, useLiveClock } from './campusLiveState';
import type { LiveState } from './campusLiveState';
import { ROOM_BUILDING } from './campusRoomKind';

/**
 * Live mode on the campus (Colaberry Campus C8), from the portal's existing broadcast discovery (useDiscoveryState: polled at the
 * server's pace, paused when hidden, backed off on errors; ROLLOUT_RUNBOOK P3-09 rules out SSE). The campus adds no request.
 *
 *  - What is on air: whatever discovery lists (the server returns only live and reconnecting broadcasts). Disabled or
 *    unavailable discovery shows nothing, never a stale "on air".
 *  - Where (C28, v7 R1, completing round-1 Q2): EVERY broadcast airs in the EVENTS HALL (an event room, campusRoomKind). One tied
 *    to a class session (session_id) still airs there, and the Classroom shows "Your class is live in the Events Hall · Walk in".
 *    LIVE_ROOM_BUILDING ('commons') is retired: a broadcast never lights the commons. Its join route is unchanged (the class
 *    session's live page, else its room).
 */
export const LIVE_BUILDING: BuildingId = ROOM_BUILDING.event;

/** Where a broadcast airs on the campus: always the Events Hall (C28). */
export function liveBuildingOf(_b: Pick<DiscoveryBroadcast, 'room_id' | 'session_id'>): BuildingId {
  return LIVE_BUILDING;
}

/** C28: a live broadcast of a class session (the Classroom's "Your class is live in the Events Hall" line), else null. */
export const liveClassOf = (list: DiscoveryBroadcast[]): DiscoveryBroadcast | null => list.find((b) => !!b.session_id) ?? null;

export function onAirBroadcasts(s: Pick<DiscoveryState, 'broadcasts' | 'disabled' | 'unavailable'>): DiscoveryBroadcast[] {
  if (s.disabled || s.unavailable) return [];
  return s.broadcasts;
}

/** The buildings to light: the Events Hall, once any broadcast has a place to walk into (a roomless one lights nothing). */
export function onAirBuildings(list: DiscoveryBroadcast[]): Set<string> {
  return new Set(list.filter((b) => roomRoute(b) !== null).map(liveBuildingOf));
}

/** Where to join a broadcast, as a portal route: the class session's live page (Q2), else its room, else null. */
export function roomRoute(b: Pick<DiscoveryBroadcast, 'room_id' | 'session_id'>): string | null {
  if (b.session_id) return `/portal/live/${encodeURIComponent(b.session_id)}`;
  return b.room_id ? `/portal/rooms/${encodeURIComponent(b.room_id)}` : null;
}

/** The broadcast the banner names: one with a place to go first (a class session or a room), else the first listed. */
export function headlineBroadcast(list: DiscoveryBroadcast[]): DiscoveryBroadcast | null {
  return list.find((b) => !!(b.session_id || b.room_id)) ?? list[0] ?? null; // one with a place to go first
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
