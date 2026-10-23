import { useEffect, useState } from 'react';
import type { DiscoveryBroadcast } from '../../hooks/useBroadcastDiscovery';

/**
 * Colaberry Live's states on the campus (WP-6; the prototype's LSTATES, marqueeText and liveSub, D:1954-1974), from the broadcast
 * discovery the portal already polls. Pure, so every line is tested.
 *
 * Today the server lists only LIVE and RECONNECTING broadcasts (backend broadcastActiveQuery ACTIVE_DISCOVERY_STATES: backstage is a
 * producer state, replay is not "on air"), so those are the two the campus shows. BACKSTAGE ("DOORS OPEN") and REPLAY are mapped
 * here too so they read right the day discovery lists them; nothing invents them in the meantime.
 *
 * Times are real: on air for = now - content_started_at; doors open countdown = scheduled_start_at - now. The prototype's topic,
 * "58 min" and 15 s countdown were samples.
 */
export type LiveState = 'backstage' | 'live' | 'reconnecting' | 'replay';
export const LIVE_STATES: Record<LiveState, { label: string; chip: string; tone: string }> = {
  backstage: { label: 'Backstage', chip: 'DOORS OPEN', tone: 'ls-backstage' },
  live: { label: 'On air', chip: '● ON AIR', tone: 'ls-live' },
  reconnecting: { label: 'Reconnecting', chip: 'RECONNECTING', tone: 'ls-reconnecting' },
  replay: { label: 'Replay ready', chip: '▶ REPLAY', tone: 'ls-replay' },
};

export function liveStateOf(b: Pick<DiscoveryBroadcast, 'editorial_state'>): LiveState {
  switch (b.editorial_state) {
    case 'reconnecting': return 'reconnecting';
    case 'backstage': return 'backstage';
    case 'replay_ready': return 'replay';
    default: return 'live';
  }
}

/** "4:12", "61:05" (the prototype's fmt: minutes unpadded). Negative reads 0:00. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type Timed = Pick<DiscoveryBroadcast, 'editorial_state' | 'content_started_at' | 'scheduled_start_at'>;

/** The marquee over the live building: "● ON AIR · 4:12", "RECONNECTING…", "DOORS OPEN · 0:14", "▶ REPLAY READY". */
export function marqueeText(b: Timed, now: number): string {
  const st = liveStateOf(b);
  if (st === 'live') return b.content_started_at ? `● ON AIR · ${clock(now - b.content_started_at)}` : '● ON AIR';
  if (st === 'reconnecting') return 'RECONNECTING…';
  if (st === 'backstage') return b.scheduled_start_at ? `DOORS OPEN · ${clock(b.scheduled_start_at - now)}` : 'DOORS OPEN';
  return '▶ REPLAY READY';
}

/** The line under the title: "on air for 4:12", "reconnecting, hang tight", "starts in 0:14", "replay ready". */
export function liveSub(b: Timed, now: number): string {
  const st = liveStateOf(b);
  if (st === 'live') return b.content_started_at ? `on air for ${clock(now - b.content_started_at)}` : 'on air now';
  if (st === 'reconnecting') return 'reconnecting, hang tight';
  if (st === 'backstage') return b.scheduled_start_at ? `starts in ${clock(b.scheduled_start_at - now)}` : 'starting soon';
  return 'replay ready';
}

/** An Explorer's preview left, counted down locally from the polled value (the server measures it from the show's start, the
 *  same wall clock). null: not a preview; 0: the preview has ended. */
export function previewLeft(b: Pick<DiscoveryBroadcast, 'preview_seconds_remaining' | 'reason'>, polledAt: number, now: number): number | null {
  if (b.reason === 'preview_expired') return 0;
  if (typeof b.preview_seconds_remaining !== 'number') return null;
  return Math.max(0, b.preview_seconds_remaining - Math.floor((now - polledAt) / 1000));
}

/** A one-second clock while something is on air (the marquee and the "on air for" lines tick); still otherwise. */
export function useLiveClock(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return undefined;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [on]);
  return now;
}
