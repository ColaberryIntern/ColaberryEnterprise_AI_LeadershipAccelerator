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
 *
 * C28b — THE STAGE ACTUALLY PLAYS NOW. Until this, the only action on the Events Hall's screen
 * was "Join the audience →", which navigates OUT of the room: walking into the hall and walking
 * away from the class were the same click. "Watch on the big screen" opens the broadcast in the
 * portal's one player, which `Room3D` then docks over this very screen.
 *
 * WHEN DOCKED, THIS BOARD GETS OUT OF THE WAY. The player covers the screen, so everything here
 * except the chip would be drawn behind a video — present to a screen reader, invisible to
 * everyone else, and impossible to click. `docked` therefore collapses the board to its state
 * line, and the player's own controls take over.
 */
const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

export interface LiveScreenProps {
  live: CampusLiveNow;
  hereCount: number | null;
  onJoin: (route: string) => void;
  /** Open the broadcast in the portal's player. Absent on a surface that cannot dock it. */
  onWatchHere?: () => void;
  /** True while the player covers this screen, so the board stands down. */
  docked?: boolean;
}

export function LiveScreen({ live, hereCount, onJoin, onWatchHere, docked = false }: LiveScreenProps): React.ReactElement {
  const [claps, setClaps] = useState(0);
  const route = roomRoute(live.b);
  const st = LIVE_STATES[live.state];

  if (docked) {
    /**
     * The player is on this wall. Only the state line survives, and it sits ABOVE the video
     * rather than behind it — the room keeps telling you what you are watching and for how
     * long, which the player's own title bar does not say.
     */
    return (
      <span className={`cm-ls-chip is-${live.state} is-docked`} data-testid="cm-board-onair">
        {st.chip} &middot; {liveSub(live.b, live.now)}
      </span>
    );
  }

  return (
    <>
      <span className={`cm-ls-chip is-${live.state}`} data-testid="cm-board-onair">{st.chip} · {liveSub(live.b, live.now)}</span>
      <span className="cm-ls-brand">Colaberry Live · On stage now</span>
      <h3 data-testid="cm-board-title">{live.b.title}</h3>
      {hereCount !== null && hereCount > 0 && <p className="cm-ls-meta">{hereCount === 1 ? '1 person in the hall' : `${hereCount} people in the hall`}</p>}
      <div className="row">
        {/* The primary action is now to WATCH, not to leave. */}
        {onWatchHere && <button type="button" className="b red" onClick={stop(onWatchHere)} data-testid="cm-board-watch-here">&#9654; Watch on the big screen</button>}
        {route && <button type="button" className={onWatchHere ? 'b' : 'b red'} onClick={stop(() => onJoin(route))} data-testid="cm-board-join-audience">Join the audience &rarr;</button>}
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
