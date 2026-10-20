import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BuildingId, CampusBuilding, ExplorerAccess } from './campusMap';
import { buildingName } from './campusMap';
import { accessLabel } from './campusAccess';
import PersonTokens from './PersonToken';
import type { CampusPerson } from './campusApi';
import { GearOnHead, RideUnder } from './AvatarGear';
import { publicOnly } from './campusGear';
import type { Equipped } from './campusGear';
import BuildingArt from './art/BuildingArt';
import { MainGateArt } from './art/MainGate';
import { PeopleChip, StatusBadge, StopBadge, statusOf } from './art/BuildingBadges';
import { GroundPatterns, Ground, QuadAndPaths, District, Trees, AVE, GATE, HUB } from './art/grounds';
import type { PathDoor } from './art/grounds';
import { doorOf, routeTo, START } from './walkPath';
import type { Here, Pt } from './walkPath';
import { useCampusCamera } from './useCampusCamera';
import type { CameraApi, InsetsOf } from './useCampusCamera';
import './campusMapArt.css';

/**
 * The campus world, drawn as the prototype draws it (C11b; docs/design/campus/colaberry-campus.html): grass, the paved business
 * district, the quad with its fountain, two-tone paths, trees, and every building in its own roof family, standing on its ground
 * line with a name pill below. Colors are art tokens only (campusArtTokens.css).
 *
 * Buildings are real buttons (role=button, in Tab order, Enter/Space activate) so the map is usable without a pointer. In full
 * mode a pick walks the avatar along the paths (walkPath.routeTo: hub for the upper campus, the avenue for the lower one) to the
 * door (requestAnimationFrame) and then calls onArrive; with reduce motion it arrives at once and never schedules a frame.
 * Compact mode (the side column, the banner) is a picture: no avatar, no labels, no tab stops; a pick is reported straight away.
 */

export { doorOf } from './walkPath';
export const WORLD = { w: 1000, h: 700 };
const SPEED = 900; // world units per second

export interface CampusMapProps {
  buildings: CampusBuilding[];
  accessOf: (b: CampusBuilding) => ExplorerAccess;
  workplaceNames: boolean;
  reduceMotion: boolean;
  compact?: boolean;
  /** Full mode: walk here on mount (e.g. the building picked in the side column). */
  initialTarget?: BuildingId | null;
  onArrive: (id: BuildingId) => void;
  /** Registers each building's element so a closed card can return focus to it. */
  buildingRef?: (id: BuildingId, el: SVGGElement | null) => void;
  /** C4: live head count per building id (real data only; absent or 0 = no chip). */
  counts?: Partial<Record<string, number>>;
  /** C5: named people per building id (tokens beside the building) and what a token click does. Full map only. */
  people?: Partial<Record<string, { shown: CampusPerson[]; more: number }>>;
  onPickPerson?: (p: CampusPerson, buildingId: BuildingId) => void;
  /** C5: walk to this building now (Walk over). A new seq means a new walk. */
  walkRequest?: { id: BuildingId; seq: number } | null;
  /** C8: buildings whose room is on air now (from broadcast discovery). */
  onAir?: Set<string>;
  /** C9: the learner's OWN equipped set, drawn on their pin (public slots) and, only while it travels, the ride. */
  ownGear?: Equipped;
  /** C8: today's plan route, the unfinished stops' buildings in order (campusPlan.routeBuildings). Full map only. */
  route?: BuildingId[];
  /** C11b: the Explorer view's OPEN badges (the prototype shows OPEN on every building an Explorer may use). */
  showOpen?: boolean;
  /** C11b: the prototype camera (full map only): panels' insets for framing, and a handle for the zoom buttons. */
  camera?: { insets?: InsetsOf; focusInsets?: InsetsOf; apiRef?: React.MutableRefObject<CameraApi | null> };
}

// C11 (the map stays light): memoized, so a walking avatar (one state update per frame) does not re-render every building.
const Building = memo(function Building({ b, access, label, compact, count, shown, onAir = false, here = false, showOpen = false, stop, onPick, setRef }: {
  b: CampusBuilding; access: ExplorerAccess; label: string; compact: boolean; count: number; shown?: CampusPerson[]; onAir?: boolean; here?: boolean;
  showOpen?: boolean; stop?: number;
  onPick: (id: BuildingId) => void; setRef?: (id: BuildingId, el: SVGGElement | null) => void;
}): React.ReactElement {
  const chip = accessLabel(access);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(b.id); }
  };
  const aria = [label, onAir ? 'on air now' : null, chip, count > 0 ? `${count} here now` : null].filter(Boolean).join(', ');
  // C11: compact maps (banner, side nav) are pictures, not controls: the banner's map sits inside its own button and the side
  // nav lists every building as a link right below. A pointer click on the nav map still opens the full map.
  const a11y = compact ? {} : { role: 'button', tabIndex: 0, 'aria-label': aria, onKeyDown };
  const isGate = b.kind === 'gate';
  const status = statusOf(access, onAir, showOpen);
  return (
    <g
      ref={(el) => setRef?.(b.id, el)}
      className={`cm-bld cm-b-${b.id}${access === 'locked' ? ' is-locked' : ''}${here ? ' is-here' : ''}${onAir ? ' onair' : ''}`}
      {...a11y}
      data-building={b.id} data-testid={`cm-bld-${b.id}`} onClick={() => onPick(b.id)}
      transform={`translate(${isGate ? GATE.x : b.pos.x} ${isGate ? GATE.y : b.pos.y})`}
    >
      {isGate ? <MainGateArt /> : <BuildingArt id={b.id} kind={b.kind as Exclude<CampusBuilding['kind'], 'gate'>} w={b.pos.w} h={b.pos.h} label={compact ? undefined : label} />}
      {count > 0 && <PeopleChip b={b} count={count} shown={shown} compact={compact} />}
      {status && <StatusBadge b={b} status={status} compact={compact} />}
      {stop !== undefined && <StopBadge b={b} n={stop + 1} next={stop === 0} />}
    </g>
  );
});

// The grounds never change during a walk: one memoized group, so a walk frame or a presence poll does not re-render ~200 nodes.
const Scenery = memo(function Scenery({ doors, gateIsBuilding }: { doors: PathDoor[]; gateIsBuilding: boolean }): React.ReactElement {
  return (
    <>
      <GroundPatterns />
      <Ground />
      <QuadAndPaths doors={doors} />
      <District />
      <Trees />
      {/* The gate is scenery for everyone (the prototype always draws it); only Explorers and staff get it as a building. */}
      {!gateIsBuilding && <g transform={`translate(${GATE.x} ${GATE.y})`}><MainGateArt /></g>}
    </>
  );
});

/** The plan route's path to one stop's door, along the campus paths (a spoke from the hub, or up from the avenue). */
function routeSegment(b: CampusBuilding): string {
  const d = doorOf(b);
  if (b.zone === 'up') return `M${HUB.x} ${HUB.y}L${d.x} ${d.y}`;
  if (b.zone === 'ave') return `M${HUB.x} ${AVE}L${d.x} ${AVE}L${d.x} ${d.y}`;
  return `M${HUB.x} ${AVE}L${GATE.x} ${GATE.y}`;
}

export default function CampusWorldMap({ buildings, accessOf, workplaceNames, reduceMotion, compact = false, initialTarget, onArrive, buildingRef, counts, people, onPickPerson, walkRequest, onAir, route, ownGear, showOpen = false, camera }: CampusMapProps): React.ReactElement {
  const [pos, setPos] = useState<Pt>({ x: START.x, y: START.y });
  const hereRef = useRef<Here>(START);
  const svgRef = useRef<SVGSVGElement>(null);
  const locate = useCallback((id: string) => { const b = buildings.find((x) => x.id === id); return b ? (b.kind === 'gate' ? GATE : { x: b.pos.x, y: b.pos.y }) : null; }, [buildings]);
  const cam = useCampusCamera(svgRef, { enabled: !compact && !!camera, insets: camera?.insets, focusInsets: camera?.focusInsets, avatarRef: hereRef, locate, reduceMotion, apiRef: camera?.apiRef });
  const raf = useRef<number | null>(null);
  // C9: true only while a walk animates (never with reduce motion or on the compact map): the only time a ride is drawn.
  const [moving, setMoving] = useState(false);
  const [atId, setAtId] = useState<BuildingId | null>(null);

  const stop = () => { if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null; } setMoving(false); };
  useEffect(() => stop, []);

  const walkTo = useCallback((id: BuildingId) => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    stop();
    if (compact) { onArrive(id); return; }
    const door = doorOf(b);
    const arrive = () => { hereRef.current = { ...door, zone: b.zone }; setAtId(id); cam.focus(b.kind === 'gate' ? { ...GATE, h: 50 } : { x: b.pos.x, y: b.pos.y, h: b.pos.h }); onArrive(id); };
    if (reduceMotion) { setPos(door); arrive(); return; }
    // A walk cancelled midway starts from where the avatar stands, in the zone it was heading for.
    const from = hereRef.current;
    const pts: Pt[] = [{ x: from.x, y: from.y }, ...routeTo(from, b)];
    const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
    const total = seg.reduce((a, c) => a + c, 0) || 1;
    const duration = (total / SPEED) * 1000;
    setAtId(null);
    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const d = Math.min(1, (t - start) / duration) * total;
      let acc = 0, i = 0;
      while (i < seg.length - 1 && acc + seg[i] < d) { acc += seg[i]; i += 1; }
      const f = seg[i] ? Math.min(1, (d - acc) / seg[i]) : 1;
      const p = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
      hereRef.current = { ...p, zone: b.zone };
      setPos(p);
      if (d < total) raf.current = requestAnimationFrame(step);
      else { raf.current = null; setMoving(false); arrive(); }
    };
    setMoving(true);
    cam.follow();
    raf.current = requestAnimationFrame(step);
  }, [buildings, compact, reduceMotion, onArrive, cam]);

  // One stable pick handler per building, so the memoized token groups do not re-render on every walk frame.
  const pickers = useMemo(() => {
    const out: Partial<Record<BuildingId, (p: CampusPerson) => void>> = {};
    if (onPickPerson) for (const b of buildings) out[b.id] = (p: CampusPerson) => onPickPerson(p, b.id);
    return out;
  }, [buildings, onPickPerson]);
  const gateIsBuilding = buildings.some((b) => b.kind === 'gate');
  const doors = useMemo<PathDoor[]>(() => buildings.filter((b) => b.kind !== 'gate').map((b) => ({ id: b.id, x: b.pos.x, y: b.pos.y, zone: b.zone })), [buildings]);

  const started = useRef(false);
  useEffect(() => {
    if (initialTarget && !started.current) { started.current = true; walkTo(initialTarget); }
  }, [initialTarget, walkTo]);
  const lastWalk = useRef(0);
  useEffect(() => {
    if (walkRequest && walkRequest.seq !== lastWalk.current) { lastWalk.current = walkRequest.seq; walkTo(walkRequest.id); }
  }, [walkRequest, walkTo]);

  return (
    <svg ref={svgRef} className={`cm-map${compact ? ' is-compact' : ''}${reduceMotion ? ' is-reduced' : ''}${camera && !compact ? ' has-camera' : ''}`} viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} data-testid={compact ? undefined : 'cm-world'}
      {...(compact ? { 'aria-hidden': true, focusable: 'false' } : { role: 'group', 'aria-label': 'Campus map' })}>
      <Scenery doors={doors} gateIsBuilding={gateIsBuilding} />
      {!compact && route && route.map((id) => {
        const b = buildings.find((x) => x.id === id); if (!b) return null;
        return <path key={'r-' + id} className="cm-route-line" data-testid={`cm-route-${id}`} d={routeSegment(b)} aria-hidden="true" />;
      })}
      {buildings.map((b) => (
        <Building key={b.id} b={b} access={accessOf(b)} label={buildingName(b, workplaceNames)} compact={compact} count={counts?.[b.id] ?? 0}
          shown={people?.[b.id]?.shown} onAir={!!onAir?.has(b.id)} here={!compact && atId === b.id} showOpen={showOpen}
          stop={!compact && route && route.includes(b.id) ? route.indexOf(b.id) : undefined} onPick={walkTo} setRef={buildingRef} />
      ))}
      {!compact && people && onPickPerson && buildings.map((b) => {
        const t = people[b.id];
        return t ? <PersonTokens key={'t-' + b.id} b={b} shown={t.shown} more={t.more} maxY={WORLD.h} onPick={pickers[b.id]!} /> : null;
      })}
      {!compact && (
        <g className={`cm-avatar${moving ? ' is-walking' : ''}`} transform={`translate(${pos.x} ${pos.y})`} aria-hidden="true" data-testid="cm-avatar">
          <ellipse className="cm-pin-shadow" cx={0} cy={3} rx={7} ry={2.5} />
          <g className="bob">
            {ownGear?.ride && moving && !reduceMotion && <RideUnder ride={ownGear.ride} />}
            <path className="cm-pin" d="M0 2 L-7 -12 A9 9 0 1 1 7 -12 Z" />
            <circle className="cm-pin-dot" cx={0} cy={-17.7} r={3.6} />
            {ownGear && <GearOnHead gear={publicOnly(ownGear)} cx={0} cy={-17.7} r={9} />}
          </g>
        </g>
      )}
    </svg>
  );
}
