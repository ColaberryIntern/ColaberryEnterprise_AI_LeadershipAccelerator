import React, { useCallback, useEffect, useState } from 'react';
import { fetchHallway, HALLWAY_CHANGED_EVENT, openMeetSheet, type Hallway } from './hallwayApi';
import { doorSign, hallwayDoors, initialsOf, liveRooms, rowLine, type AnyDoor, type Door } from './hallwayModel';
import './hallway.css';

/**
 * The Meeting Rooms hallway's pieces (C29, v7 R2): the doors on the two side walls, the back-wall board ("MEETING ROOMS · n OPEN
 * NOW", live rows with Join, + New room and Book a session) and the arrival card's "Rooms in the hallway". All of them read the
 * one useHallway() list; every action is real: Join opens the room's page (its existing audio/video join), a door opens the peek,
 * + New room and Book a session open the sheet (MeetingSheet), More rooms opens /portal/rooms.
 */
export function useHallway(enabled: boolean): { hallway: Hallway | null; error: boolean } {
  const [hallway, setHallway] = useState<Hallway | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    if (!enabled) return;
    fetchHallway().then((h) => { setHallway(h); setError(false); }).catch(() => setError(true));
  }, [enabled]);
  useEffect(() => {
    load();
    window.addEventListener(HALLWAY_CHANGED_EVENT, load);
    window.addEventListener('focus', load);
    return () => { window.removeEventListener(HALLWAY_CHANGED_EVENT, load); window.removeEventListener('focus', load); };
  }, [load]);
  return { hallway, error };
}

export const roomPath = (roomId: string): string => `/portal/rooms/${encodeURIComponent(roomId)}`;
const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

function Avatars({ d, max = 4 }: { d: Door; max?: number }): React.ReactElement {
  return <>{d.inside.slice(0, max).map((p) => <i key={p.enrollment_id} className={p.friend ? 'is-friend' : undefined} title={p.display_name}>{initialsOf(p.display_name)}</i>)}</>;
}

const LEFTS = [6, 38, 70];

/** One side wall's doors: the left wall carries doors 1-3, the right 4-6. */
export function HallwayWall({ doors, side, onOpen }: { doors: AnyDoor[]; side: 'left' | 'right'; onOpen: (route: string) => void }): React.ReactElement {
  const mine = doors.filter((d) => (side === 'left' ? d.n <= 3 : d.n > 3));
  return (
    <>
      {mine.map((d) => {
        const left = `${LEFTS[(d.n - 1) % 3]}%`;
        if (d.more) {
          return (
            <button key="more" type="button" className="cm-mdoor is-more" style={{ left }} onClick={stop(() => onOpen('/portal/rooms'))} data-testid="cm-door-more">
              <span className="num">{d.n}</span>
              <span className="plate"><b>More rooms &rarr;</b><small>{d.hidden} more</small></span>
            </button>
          );
        }
        return (
          <button key={d.key} type="button" className={`cm-mdoor is-${d.state}${d.friends ? ' is-friends' : ''}`} style={{ left }} data-testid={`cm-door-${d.n}`} data-room={d.roomId}
            aria-label={`Meeting room ${d.n}: ${d.name}, ${doorSign(d).replace('●', '').trim()}`} onClick={stop(() => openMeetSheet({ mode: 'peek', roomId: d.roomId }))}>
            <span className="num">{d.n}</span>
            <span className="glass"><Avatars d={d} /></span>
            <span className="plate"><b>{d.name}</b><small className={`st-${d.state}`}>{doorSign(d)}</small></span>
            <span className="knob" aria-hidden="true" />
          </button>
        );
      })}
    </>
  );
}

/** The back-wall board. */
export function HallwayBoard({ hallway, onOpen }: { hallway: Hallway | null; onOpen: (route: string) => void }): React.ReactElement {
  const live = hallway ? liveRooms(hallway) : [];
  return (
    <>
      <div className="k" data-testid="cm-board-title">Meeting rooms · {hallway ? live.length : '…'} open now</div>
      {hallway && !live.length && <h3 className="plain">Nobody is in a room right now. Open one, or book one for later.</h3>}
      <ul className="cm-hall-board-rows" onClick={(e) => e.stopPropagation()}>
        {live.slice(0, 4).map((d) => (
          <li key={d.key} data-testid={`cm-board-room-${d.roomId}`}>
            <span className="tx"><b>{d.name}</b>{d.sub && <small>{d.sub}</small>}</span>
            <span className="av"><Avatars d={d as Door} max={3} /></span>
            <button type="button" className="b red" onClick={() => onOpen(roomPath(d.roomId))}>Join</button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" className="b red" onClick={stop(() => openMeetSheet({ mode: 'new' }))} data-testid="cm-board-new-room">+ New room</button>
        <button type="button" className="b" onClick={stop(() => openMeetSheet({ mode: 'book' }))} data-testid="cm-board-book-room">📅 Book a session</button>
      </div>
    </>
  );
}

/** The arrival card's "Rooms in the hallway". */
export function HallwayRows({ hallway, error, onOpen }: { hallway: Hallway | null; error: boolean; onOpen: (route: string) => void }): React.ReactElement {
  const doors = hallway ? hallwayDoors(hallway) : [];
  return (
    <section className="cm-hall" data-testid="cm-hall-rows">
      <div className="cm-sec">Rooms in the hallway</div>
      {error && <p className="cm-hall-muted" role="status">We can&rsquo;t load the rooms right now.</p>}
      {!error && !hallway && <p className="cm-hall-muted" role="status">Loading the rooms&hellip;</p>}
      {hallway && !doors.length && <p className="cm-hall-muted">No rooms are open yet. Open one now, or book one for later.</p>}
      {doors.length > 0 && (
        <ol className="cm-hall-rows">
          {doors.map((d) => d.more ? (
            <li key="more"><span className="n">{d.n}</span><span className="tx"><b>More rooms</b><small>{d.hidden} more on the rooms page</small></span>
              <button type="button" className="cm-btn-line" onClick={() => onOpen('/portal/rooms')}>Open</button></li>
          ) : (
            <li key={d.key} data-testid={`cm-hall-row-${d.n}`}>
              <span className="n">{d.n}</span>
              {d.state === 'live' && <span className="dot" aria-label="live" />}
              <span className="tx"><b>{d.name}</b><small>{rowLine(d)}</small></span>
              {d.state === 'live' && <button type="button" className="cm-btn-line pri" onClick={() => onOpen(roomPath(d.roomId))}>Join</button>}
              {d.state === 'booked' && <button type="button" className="cm-btn-line" onClick={() => openMeetSheet({ mode: 'peek', roomId: d.roomId })}>Details</button>}
              {d.state === 'free' && <button type="button" className="cm-btn-line" onClick={() => onOpen(roomPath(d.roomId))}>Open</button>}
            </li>
          ))}
        </ol>
      )}
      <div className="cm-hall-acts">
        <button type="button" className="cm-btn-line pri" onClick={() => openMeetSheet({ mode: 'new' })} data-testid="cm-hall-new">+ New room</button>
        <button type="button" className="cm-btn-line" onClick={() => openMeetSheet({ mode: 'book' })} data-testid="cm-hall-book">📅 Book a session</button>
      </div>
      <p className="cm-hall-board">Looking for posts and questions? <button type="button" className="cm-hall-link" onClick={() => onOpen('/portal/community')}>The Community feed &rarr;</button></p>
    </section>
  );
}
