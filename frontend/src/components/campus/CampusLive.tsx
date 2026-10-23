import React, { useEffect, useState } from 'react';
import { useBroadcastPlayer } from '../../contexts/BroadcastPlayerContext';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';
import { buildingName } from './campusMap';
import type { BuildingId } from './campusMap';
import { roomRoute, useLiveNow } from './campusOnAir';
import { LIVE_STATES, liveSub } from './campusLiveState';
import './campusLiveStates.css';

/**
 * The live bar (C8; WP-6 the prototype's #livebar, D:1102-1108 and D:2045-2049): the state chip (● ON AIR / RECONNECTING), the
 * title with "· on air for 4:12" ticking, then:
 *  - on the campus home, "Walk in" (it runs while the class is on air, the prototype's walkrun), or "You're here" once you are;
 *    on a page, "Go to the room" through the campus door (walking would leave the page);
 *  - "▶ Watch here" / "⏸ Watching" on the portal's own player (only when the viewer may watch: the server already said so);
 *  - × to put it away for this broadcast (it comes back for the next one).
 * The first time a broadcast appears this session the bar pulses once (the prototype's launch cue); the chime is the portal's own
 * cue (LiveNowBadge), so it is never played twice. The crowd line is the building's real head count, nothing invented.
 */
const DISMISSED = 'colaberry.campus.live.dismissed';
const CUED = 'colaberry.campus.live.cued';
const readSet = (k: string): string[] => { try { return JSON.parse(window.sessionStorage.getItem(k) || '[]'); } catch { return []; } };
const addTo = (k: string, id: string) => { try { window.sessionStorage.setItem(k, JSON.stringify([...readSet(k), id].slice(-20))); } catch { /* no storage */ } };

export default function CampusLive({ onWalk, hereId = null }: { onWalk?: (id: BuildingId, run: boolean) => void; hereId?: BuildingId | null } = {}): React.ReactElement | null {
  const live = useLiveNow();
  const { presence, presenceError, enterThroughDoor, settings } = useCampus();
  const { buildings } = useCampusView();
  const { open, close, session } = useBroadcastPlayer();
  const [dismissed, setDismissed] = useState<string[]>(() => readSet(DISMISSED));
  const [cue, setCue] = useState(false);
  const id = live?.b.id ?? null;
  useEffect(() => {
    if (!id || readSet(CUED).includes(id)) return undefined;
    addTo(CUED, id);
    setCue(true);
    const t = window.setTimeout(() => setCue(false), 1500);
    return () => window.clearTimeout(t);
  }, [id]);
  if (!live || dismissed.includes(live.b.id) || live.state === 'replay') return null;
  const { b, state, now } = live;
  const route = roomRoute(b);
  const building = live.building ? buildings.find((x) => x.id === live.building) : undefined;
  const count = building && presence && !presenceError ? presence[building.id]?.count ?? 0 : 0;
  const watching = session?.occurrenceId === b.id;
  const here = !!building && hereId === building.id;
  return (
    // C11: only the title is a live region (the ticking clock is aria-hidden so it is not re-read every second).
    <div className={`cm-live is-${state}${cue ? ' is-cue' : ''}`} data-testid="cm-live">
      <span className={`cm-lb-chip ${LIVE_STATES[state].tone}`} data-testid="cm-live-chip">{LIVE_STATES[state].chip}</span>
      <span className="cm-live-text" role="status"><strong>{b.title}</strong> <span className="cm-lb-sub" aria-hidden="true" data-testid="cm-live-sub">· {liveSub(b, now)}</span></span>
      {count > 0 && building && <span className="cm-live-crowd" data-testid="cm-live-crowd">{count} in the {buildingName(building, settings.workplaceNames)} now</span>}
      {onWalk && building && (here
        ? <span className="cm-lb-here" data-testid="cm-live-here">You&rsquo;re here</span>
        : <button type="button" className="cm-lb-btn" data-testid="cm-live-walk" onClick={() => onWalk(building.id, state === 'live')}>Walk in</button>)}
      {!onWalk && route && <button type="button" className="cm-lb-btn" data-testid="cm-live-go" onClick={() => enterThroughDoor(route, null)}>Go to the room</button>}
      {b.can_watch && state !== 'backstage' && (watching
        ? <button type="button" className="cm-lb-btn is-ghost" data-testid="cm-live-stop" onClick={close}>⏸ Watching</button>
        : <button type="button" className="cm-lb-btn is-ghost" data-testid="broadcast-watch" onClick={() => open({ occurrenceId: b.id, asset: 'master.m3u8', title: b.title })}>▶ Watch here</button>)}
      <button type="button" className="cm-lb-x" aria-label="Dismiss the live bar" data-testid="cm-live-x" onClick={() => { addTo(DISMISSED, b.id); setDismissed(readSet(DISMISSED)); }}>×</button>
    </div>
  );
}
