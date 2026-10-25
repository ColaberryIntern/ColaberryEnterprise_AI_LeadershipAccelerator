import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BuildingId } from '../../campusMap';
import { art } from '../../art/artColor';
import { ROOMS } from '../roomModel';
import type { FigurePerson } from '../RoomFurniture';
import type { SpotDef } from '../roomSpots';
import { SpotArt } from '../spots';
import RoomCrowd from './RoomCrowd';
import { Billboard, person } from './billboard';
import type { PageSummary } from '../pageSummary';
import type { PlanStop } from '../../campusPlan';
import { RoomScreen, WallBoard } from './RoomBoard';
import PlansBoard from '../../admissions/PlansBoard';
import { NextEventBoard } from '../../events/EventRows';
import { useCampusEvents } from '../../events/EventSignup';
import { upcoming } from '../../events/eventsModel';
import { openBookCall } from '../../admissions/admissionsCallApi';
import { HallwayBoard, HallwayWall, useHallway } from '../../hallway/Hallway';
import { hallwayDoors } from '../../hallway/hallwayModel';
import { LiveScreen } from '../../events/LiveScreen';
import { AgendaBoard, useAgenda } from '../../events/Agenda';
import { useCampus } from '../../CampusContext';
import { CAMPUS_BUILDINGS } from '../../campusMap';

const placeName = (b: BuildingId): string => CAMPUS_BUILDINGS.find((x) => x.id === b)?.name ?? b;
import { useLiveNow } from '../../campusOnAir';
import { YOU_AT, YOU_FROM, roomDepth } from './roomPlaces';
import type { Place } from './roomPlaces';
import './room3d.css';

/**
 * A building's inside as the prototype's CSS 3D room (v3 §2.1 + v6 D1; docs/design/campus/colaberry-campus-v6.html openRoom /
 * placeFigures): perspective + preserve-3d, the walls are DOM so their text stays crisp and clickable.
 *  - back wall: the screen ("the board"): the page's Next step; its body opens the section, its primary button the workstation;
 *  - left wall: ONE board, the card to the right of the Next step on the page;
 *  - floor: the people really here (named; never an invented face), the staff desk, YOUR SPOT (front right, with your name card;
 *    it glows on hover) and you, walking in from the front. No floating labels: the only overlay is Step outside (CampusInside).
 * Clicking your spot: you walk to it (750 ms), the camera drops into it (520 ms), then it opens. Reduce motion: it opens at once.
 */
export interface Room3DProps {
  id: BuildingId;
  name: string;
  people: FigurePerson[];
  you: FigurePerson;
  summary: PageSummary | null;
  planStep?: PlanStop | null;
  spot: SpotDef | null;
  /** The learner's first name in caps, for the name card on the spot. */
  firstName: string;
  desk?: { name: string; initials: string; title: string } | null;
  onDesk?: (at: { x: number; y: number }) => void;
  onPick?: (key: string, at: { x: number; y: number }) => void;
  lanyard?: boolean;
  reduceMotion?: boolean;
  /** Go through to a route (the section page, a workstation, the game room); the caller zooms from the clicked element. */
  onOpen: (route: string) => void;
  sectionRoute: string;
  onBook?: () => void;
}

const FALLBACK = { fw: 900, fh: 560 };
export const WALK_MS = 750;
export const ZOOM_MS = 520;

function useRoomSize(ref: React.RefObject<HTMLDivElement>): { fw: number; fh: number } {
  const [size, setSize] = useState(FALLBACK);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setSize({ fw: r.width, fh: r.height }); };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}



export default function Room3D(p: Room3DProps): React.ReactElement | null {
  const { id, people, you, summary, spot, reduceMotion } = p;
  const wrap = useRef<HTMLDivElement>(null);
  const { fw, fh } = useRoomSize(wrap);
  const tiers = ROOMS[id]?.layout === 'tiers'; // C26 (v6 D4): the Events Hall auditorium, a deeper room
  const d = roomDepth(fw, tiers);
  const [youAt, setYouAt] = useState<Place>(reduceMotion ? YOU_AT : YOU_FROM);
  const [walkMs, setWalkMs] = useState(1100);
  const [zoom, setZoom] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  // C27 (v6 D5): the Schedule board's week and upcoming events; C26: the Events Hall board's next event
  const events = useCampusEvents(id === 'amphi');
  // C29 (v7 R2): Meeting Rooms is a hallway: doors on both side walls, the open rooms on the board
  const hall = id === 'commons';
  const { hallway } = useHallway(hall);
  const doors = hall && hallway ? hallwayDoors(hallway) : [];
  // C31 (v7 R4): while Colaberry Live is on air, the Events Hall's screen is the broadcast
  const live = useLiveNow();
  // C33 (v7 R6): the Schedule's board is one list: classes, events and booked sessions
  const agendaItems = useAgenda(id === 'tower');
  const { openMap } = useCampus();
  useEffect(() => {
    if (reduceMotion) return undefined;
    const t = window.requestAnimationFrame(() => window.requestAnimationFrame(() => setYouAt(YOU_AT)));
    return () => window.cancelAnimationFrame(t);
  }, [reduceMotion]);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);
  const room = ROOMS[id];
  if (!room) return null;
  const section = () => p.onOpen(p.sectionRoute);
  const cardRoute = spot?.opens === 'page' ? p.sectionRoute : summary?.card ?? null;
  // The spot, the screen's primary button and "Open the card" all land on the same workstation.
  const sitDown = () => {
    if (spot?.opens === 'book') { (p.onBook ?? (() => openBookCall()))(); return; } // C21: the meeting table opens the booking sheet
    if (!cardRoute) { section(); return; }
    if (reduceMotion || !spot) { p.onOpen(cardRoute); return; }
    setWalkMs(WALK_MS); setYouAt([spot.x, Math.max(0, spot.z - 0.1)]);
    timers.current.push(window.setTimeout(() => {
      setZoom(`${fw * spot.x}px ${fh - spot.h * 0.75}px`);
      timers.current.push(window.setTimeout(() => p.onOpen(cardRoute), ZOOM_MS));
    }, WALK_MS));
  };
  const c = (k: string) => art(`in-${id}-${k}`);
  return (
    <div className={`cm-r3${room.dark ? ' is-dark' : ''}${zoom ? ' is-zoom' : ''}`} ref={wrap} data-testid="cm-room3d" data-room={id}
      style={{ ['--fw' as string]: `${fw}px`, ['--fh' as string]: `${fh}px`, ['--d' as string]: `${d}px`, ['--persp' as string]: `${Math.round(fw * 0.95)}px`,
        ['--wall' as string]: c('wall'), ['--wall-s' as string]: c('wall-d16'), ['--ceil' as string]: c('wall-d28'), ['--floor' as string]: c('floor'),
        ['--bc' as string]: art(id), ...(zoom ? { ['--zo' as string]: zoom } : {}) }}>
      <div className="cm-r3-stage">
        <div className="cm-r3-room">
          <div className="face ceil" aria-hidden="true">{[0.2, 0.5, 0.8].map((x) => <i key={x} style={{ left: `calc(${x * 100}% - 75px)` }} />)}</div>
          <div className="face floor" aria-hidden="true" />
          <div className="face back"><div className="wainscot" aria-hidden="true" />
            <RoomScreen summary={summary} name={p.name} planStep={p.planStep} onSection={section} onCard={cardRoute && spot?.opens !== 'book' ? sitDown : null}
              onPlan={(r) => p.onOpen(r)} custom={id === 'admissions' ? <PlansBoard onSection={section} />
                : id === 'tower' && agendaItems ? <AgendaBoard items={agendaItems} now={new Date()} place={placeName} onWalk={(b) => openMap(b)} onSection={section} />
                : id === 'amphi' && live ? <LiveScreen live={live} hereCount={people.length} onJoin={p.onOpen} />
                : id === 'amphi' && events ? <NextEventBoard event={upcoming(events, new Date(), 1)[0] ?? null} onSection={section} />
                : hall ? <HallwayBoard hallway={hallway} onOpen={p.onOpen} /> : undefined} />
            {tiers && <div className="cm-r3-platform" aria-hidden="true" data-testid="cm-r3-stage" />}
          </div>
          <div className="face left"><div className="wainscot" aria-hidden="true" />
            {hall ? <HallwayWall doors={doors} side="left" onOpen={p.onOpen} />
              : summary?.sideTop && <div className="cm-r3-wallslot"><WallBoard side={summary.sideTop} onSection={section} /></div>}
          </div>
          <div className="face right" aria-hidden={hall ? undefined : true}><div className="wainscot" aria-hidden="true" />
            {hall && <HallwayWall doors={doors} side="right" onOpen={p.onOpen} />}
          </div>
          <div className="cm-r3-floorlayer">
            <RoomCrowd layout={room.layout} spot={spot} people={people} desk={p.desk} onDesk={p.onDesk} onPick={p.onPick} lanyard={p.lanyard} fw={fw} fh={fh} d={d} />
            {spot && (
              <Billboard x={spot.x} z={spot.z} w={spot.w} h={spot.h} fw={fw} fh={fh} d={d} className={`cm-r3-spot${zoom ? ' is-sit' : ''}`}
                role="button" tabIndex={0} aria-label={`${spot.tile.replace(/^\S+\s/, '')}: ${spot.sub}`} data-testid={`cm-spot-${spot.kind}`}
                onClick={sitDown} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sitDown(); } }}>
                <SpotArt kind={spot.kind} name={p.firstName} />
              </Billboard>
            )}
            <div className={`cm-r3-bb cm-r3-fig is-you${zoom ? ' is-gone' : ''}`} data-testid="cm-r3-you"
              style={{ width: 70, height: 130, transition: reduceMotion ? 'none' : `transform ${walkMs}ms cubic-bezier(.2,.7,.3,1)`,
                transform: `translate3d(${fw * youAt[0] - 35}px, ${fh - 130}px, ${-d * youAt[1]}px)` }}>
              {person(you, p.lanyard)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
