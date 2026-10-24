import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { BuildingId, CampusBuilding } from './campusMap';
import { doorOf } from './walkPath';
import type { Here, Pt } from './walkPath';
import { campusGraph, routeFrom, routeToPoint } from './walkGraph';
import { GATE } from './art/grounds';
import { travelSpeed, travelVerb } from './campusGear';
import type { CameraApi } from './useCampusCamera';

/**
 * Walking the avatar (WP-3; the prototype's travelTo / finishTravel D:1766-1804), out of CampusWorldMap so the map stays about
 * drawing:
 *  - speed 330 world units a second (560 running) times the ride's (Skateboard 1.35, Cherry Cruiser 1.9), ease-in-out over the
 *    whole route, never under 600 ms;
 *  - while walking: the red dashed route line, a footstep every 140 ms (90 running) that fades over 1.6 s (at most 60 on the
 *    ground; added straight to the DOM so a step never re-renders the map), the destination highlighted, and `onTravel` told what
 *    the toast should say ("Skating to Library…");
 *  - reduce motion, or an `instant` request (Skip, Step outside), stands you at the door at once.
 * A walk started mid-walk starts from where the avatar stands, in the zone it was heading for.
 *
 * C17 (round 3 §2.5): `walkToSpot` walks to any point on the grass over the path graph (walkGraph), with the same animation; on
 * arrival you stand on the ground (zone 'ground'), nothing opens, the camera goes back to the whole campus and `onGround` is told.
 */
export interface Travel { id: BuildingId | null; verb: string; spot?: Pt }
export interface WalkOptions {
  buildings: CampusBuilding[];
  compact: boolean;
  reduceMotion: boolean;
  ride?: string;
  hereRef: MutableRefObject<Here>;
  setPos: (p: Pt) => void;
  cam: CameraApi;
  stepsRef: RefObject<SVGGElement>;
  onArrive: (id: BuildingId) => void;
  onTravel?: (t: Travel | null) => void;
  /** C17: arrived at a spot on the grass. */
  onGround?: () => void;
}
interface How { instant?: boolean; run?: boolean }
export const MIN_WALK_MS = 600;
const STEP_MS = 140;
const STEP_RUN_MS = 90;
const MAX_STEPS = 60;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The prototype's ease-in-out quad. */
export const easeInOut = (d: number): number => (d < 0.5 ? 2 * d * d : 1 - Math.pow(-2 * d + 2, 2) / 2);
/** How long a walk of `total` world units takes. */
export const walkMs = (total: number, ride?: string, run = false): number => Math.max(MIN_WALK_MS, (total / travelSpeed(ride, run)) * 1000);

export function useWalk(o: WalkOptions): {
  walkTo: (id: BuildingId, how?: How) => void;
  walkToSpot: (spot: Pt, how?: How) => void;
  moving: boolean; running: boolean; atId: BuildingId | null; targetId: BuildingId | null; routeD: string | null; spot: Pt | null;
} {
  const opts = useRef(o);
  opts.current = o;
  const raf = useRef<number | null>(null);
  const [moving, setMoving] = useState(false);
  const [running, setRunning] = useState(false);
  const [atId, setAtId] = useState<BuildingId | null>(null);
  const [targetId, setTargetId] = useState<BuildingId | null>(null);
  const [routeD, setRouteD] = useState<string | null>(null);
  const [spot, setSpot] = useState<Pt | null>(null);
  const graph = useMemo(() => campusGraph(o.buildings), [o.buildings]);
  const graphRef = useRef(graph);
  graphRef.current = graph;

  const stop = useCallback(() => {
    if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null; }
    setMoving(false); setRunning(false); setRouteD(null);
  }, []);
  useEffect(() => () => { if (raf.current !== null) cancelAnimationFrame(raf.current); }, []);

  const step = (at: Pt) => {
    const g = opts.current.stepsRef.current;
    if (!g || typeof document === 'undefined') return;
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('class', 'cm-step');
    c.setAttribute('cx', String(at.x + (Math.random() * 4 - 2)));
    c.setAttribute('cy', String(at.y + 1));
    c.setAttribute('r', '1.4');
    g.appendChild(c);
    while (g.childNodes.length > MAX_STEPS) g.removeChild(g.firstChild as ChildNode);
  };

  /** Animate along `pts` (the first is where you stand), in `zone` while moving, then `arrive`. */
  const animate = useCallback((pts: Pt[], zone: Here['zone'], run: boolean, arrive: () => void) => {
    const { ride, hereRef, setPos, cam } = opts.current;
    const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
    const total = seg.reduce((a, c) => a + c, 0) || 1;
    const duration = walkMs(total, ride, run);
    setRunning(run);
    setRouteD('M' + pts.map((p) => `${p.x} ${p.y}`).join('L'));
    let start: number | null = null;
    let lastStep = -Infinity;
    const tick = (t: number) => {
      if (start === null) start = t;
      const d = Math.min(1, (t - start) / duration);
      let dist = easeInOut(d) * total, i = 0;
      while (i < seg.length - 1 && dist > seg[i]) { dist -= seg[i]; i += 1; }
      const f = seg[i] ? Math.min(1, dist / seg[i]) : 1;
      const p = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
      hereRef.current = { ...p, zone };
      setPos(p);
      if (t - lastStep > (run ? STEP_RUN_MS : STEP_MS)) { lastStep = t; step(p); }
      if (d < 1) raf.current = requestAnimationFrame(tick);
      else { raf.current = null; setMoving(false); setRunning(false); setRouteD(null); arrive(); }
    };
    setMoving(true);
    cam.follow();
    raf.current = requestAnimationFrame(tick);
  }, []);

  const walkTo = useCallback((id: BuildingId, how: How = {}) => {
    const { buildings, compact, reduceMotion, ride, hereRef, setPos, cam, onArrive, onTravel } = opts.current;
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    stop();
    setSpot(null);
    if (compact) { onArrive(id); return; }
    const door = doorOf(b);
    const arrive = () => {
      hereRef.current = { ...door, zone: b.zone };
      setAtId(id); setTargetId(null); onTravel?.(null);
      cam.focus(b.kind === 'gate' ? { ...GATE, h: 50 } : { x: b.pos.x, y: b.pos.y, h: b.pos.h });
      onArrive(id);
    };
    if (reduceMotion || how.instant) { setPos(door); arrive(); return; }
    const from = hereRef.current;
    const pts: Pt[] = [{ x: from.x, y: from.y }, ...routeFrom(graphRef.current, from, b)];
    setAtId(null); setTargetId(id);
    onTravel?.({ id, verb: travelVerb(ride, !!how.run) });
    animate(pts, b.zone, !!how.run, arrive);
  }, [stop, animate]);

  const walkToSpot = useCallback((to: Pt, how: How = {}) => {
    const { compact, reduceMotion, ride, hereRef, setPos, cam, onTravel, onGround } = opts.current;
    if (compact) return;
    stop();
    const arrive = () => {
      hereRef.current = { x: to.x, y: to.y, zone: 'ground' };
      setSpot(null); setTargetId(null); onTravel?.(null);
      cam.base();
      onGround?.();
    };
    setAtId(null); setTargetId(null);
    if (reduceMotion || how.instant) { setPos(to); arrive(); return; }
    const from = hereRef.current;
    const pts: Pt[] = [{ x: from.x, y: from.y }, ...routeToPoint(graphRef.current, from, to)];
    if (pts.length < 2) { arrive(); return; } // already there
    setSpot(to);
    onTravel?.({ id: null, verb: travelVerb(ride, !!how.run), spot: to });
    animate(pts, 'ground', !!how.run, arrive);
  }, [stop, animate]);

  return { walkTo, walkToSpot, moving, running, atId, targetId, routeD, spot };
}
