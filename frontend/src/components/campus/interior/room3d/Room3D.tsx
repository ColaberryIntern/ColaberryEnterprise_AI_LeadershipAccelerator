import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BuildingId } from '../../campusMap';
import { art } from '../../art/artColor';
import { ROOMS } from '../roomModel';
import { Figure } from '../Figure';
import type { FigurePerson } from '../RoomFurniture';
import type { SpotDef } from '../roomSpots';
import { SpotArt } from '../spots';
import type { PageSummary } from '../pageSummary';
import type { PlanStop } from '../../campusPlan';
import { RoomScreen, WallBoard } from './RoomBoard';
import PlansBoard from '../../admissions/PlansBoard';
import { openBookCall } from '../../admissions/admissionsCallApi';
import { DESK_AT, STAFF_AT, YOU_AT, YOU_FROM, furnitureOf, peoplePlaces, roomDepth } from './roomPlaces';
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

function Billboard({ x, z, w, h, fw, fh, d, children, className = '', ...rest }: { x: number; z: number; w: number; h: number; fw: number; fh: number; d: number; children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={`cm-r3-bb ${className}`} style={{ width: w, height: h, transform: `translate3d(${fw * x - w / 2}px, ${fh - h}px, ${-d * z}px)` }} {...rest}>{children}</div>;
}

const person = (p: FigurePerson, lanyard: boolean | undefined, onPick?: (at: { x: number; y: number }) => void, testId?: string) => (
  <svg viewBox="-45 -128 90 132" width={70} height={130} overflow="visible"><Figure x={0} y={0} s={1} p={p} pose="stand" lanyard={lanyard} onPick={onPick} testId={testId} /></svg>
);

export default function Room3D(p: Room3DProps): React.ReactElement | null {
  const { id, people, you, summary, spot, reduceMotion } = p;
  const wrap = useRef<HTMLDivElement>(null);
  const { fw, fh } = useRoomSize(wrap);
  const d = roomDepth(fw);
  const [youAt, setYouAt] = useState<Place>(reduceMotion ? YOU_AT : YOU_FROM);
  const [walkMs, setWalkMs] = useState(1100);
  const [zoom, setZoom] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    if (reduceMotion) return undefined;
    const t = window.requestAnimationFrame(() => window.requestAnimationFrame(() => setYouAt(YOU_AT)));
    return () => window.cancelAnimationFrame(t);
  }, [reduceMotion]);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);
  const room = ROOMS[id];
  if (!room) return null;
  const places = peoplePlaces(room.layout, !!spot);
  const shown = people.slice(0, places.length);
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
              onPlan={(r) => p.onOpen(r)} custom={id === 'admissions' ? <PlansBoard onSection={section} /> : undefined} />
          </div>
          <div className="face left"><div className="wainscot" aria-hidden="true" />
            {summary?.sideTop && <div className="cm-r3-wallslot"><WallBoard side={summary.sideTop} onSection={section} /></div>}
          </div>
          <div className="face right" aria-hidden="true"><div className="wainscot" /></div>
          <div className="cm-r3-floorlayer">
            {furnitureOf(room.layout, !!spot).map((f, i) => (
              <Billboard key={`f${i}`} x={f.x} z={f.z - (f.kind === 'table' ? 0.02 : 0.015)} w={f.kind === 'table' ? 150 : fw * f.w} h={f.kind === 'table' ? 56 : 40} fw={fw} fh={fh} d={d}
                className={`cm-r3-${f.kind}`} aria-hidden="true">{null}</Billboard>
            ))}
            {p.desk && (
              <>
                <Billboard x={DESK_AT[0]} z={DESK_AT[1]} w={150} h={46} fw={fw} fh={fh} d={d} className="cm-r3-desk" aria-hidden="true">{p.desk.title.toUpperCase()}</Billboard>
                <Billboard x={STAFF_AT[0]} z={STAFF_AT[1]} w={70} h={130} fw={fw} fh={fh} d={d} className="cm-r3-fig" data-testid="cm-inside-desk">
                  {person({ key: 'desk', name: p.desk.name, initials: p.desk.initials, photo: null, tone: art('gold'), staff: true }, false, p.onDesk, 'cm-inside-staff')}
                </Billboard>
              </>
            )}
            {shown.map((per, i) => (
              <Billboard key={per.key} x={places[i][0]} z={places[i][1]} w={70} h={130} fw={fw} fh={fh} d={d} className="cm-r3-fig">
                {person(per, p.lanyard, p.onPick ? (at) => p.onPick!(per.key, at) : undefined, 'cm-inside-person')}
              </Billboard>
            ))}
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
