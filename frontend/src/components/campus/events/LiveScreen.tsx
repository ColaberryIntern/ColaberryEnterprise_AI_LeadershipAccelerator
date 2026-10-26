import React, { useState } from 'react';
import type { CampusLiveNow } from '../campusOnAir';
import { roomRoute } from '../campusOnAir';
import { LIVE_STATES, liveSub } from '../campusLiveState';
import '../campusLiveStates.css';

/**
 * Colaberry Live as the Events Hall's stage (C31, v7 R4). While a broadcast is on air:
 *  - LiveScreen: the room's back-wall screen becomes the broadcast: the pulsing state chip with its clock ("● ON AIR · on air for
 *    4:12"), "COLABERRY LIVE · ON STAGE NOW", the title, how many people are in the hall (real presence), Join the audience (the
 *    broadcast's own room / live page) and 👏 React (local only, round-1 Q15: nothing is sent);
 *  - LiveTile: the arrival card's single tile in place of the board tile.
 * Not shown (no data in discovery, logged for Ali): the host's name, a watcher count and "captions on".
 */
const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

export function LiveScreen({ live, hereCount, onJoin }: { live: CampusLiveNow; hereCount: number | null; onJoin: (route: string) => void }): React.ReactElement {
  const [claps, setClaps] = useState(0);
  const route = roomRoute(live.b);
  const st = LIVE_STATES[live.state];
  return (
    <>
      <span className={`cm-ls-chip is-${live.state}`} data-testid="cm-board-onair">{st.chip} · {liveSub(live.b, live.now)}</span>
      <span className="cm-ls-brand">Colaberry Live · On stage now</span>
      <h3 data-testid="cm-board-title">{live.b.title}</h3>
      {hereCount !== null && hereCount > 0 && <p className="cm-ls-meta">{hereCount === 1 ? '1 person in the hall' : `${hereCount} people in the hall`}</p>}
      <div className="row">
        {route && <button type="button" className="b red" onClick={stop(() => onJoin(route))} data-testid="cm-board-join-audience">Join the audience &rarr;</button>}
        <button type="button" className="b" onClick={stop(() => setClaps((n) => n + 1))} aria-label="React with applause" data-testid="cm-board-react">👏{claps > 0 ? ` ${claps}` : ''}</button>
      </div>
    </>
  );
}

export function LiveTile({ live, onJoin }: { live: CampusLiveNow; onJoin: (route: string) => void }): React.ReactElement {
  const route = roomRoute(live.b);
  return (
    <div className="cm-ls-tile" data-testid="cm-arrive-live-tile">
      <small>● COLABERRY LIVE</small>
      <b>{live.b.title}</b>
      <span>The live broadcast is this hall&rsquo;s stage, streamed to everyone.</span>
      {route && <button type="button" className="cm-btn-red" onClick={() => onJoin(route)}>Join the audience &rarr;</button>}
    </div>
  );
}
