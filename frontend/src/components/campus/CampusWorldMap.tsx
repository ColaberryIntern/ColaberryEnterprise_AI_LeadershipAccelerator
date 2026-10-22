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
import { PeopleChip, StatusBadge, TourBadge, PlanPin, statusOf } from './art/BuildingBadges';
import type { PlanStop } from './campusPlan';
import { LiveBack, LiveFront } from './art/LiveDressing';
import StaffTokens from './art/StaffTokens';
import type { MapDesk } from './art/StaffTokens';
import { GroundPatterns, Ground, QuadAndPaths, District, Trees, GATE } from './art/grounds';
import type { PathDoor } from './art/grounds';
import { doorOf, routeTo, START } from './walkPath';
import type { Here, Pt } from './walkPath';
import { useCampusCamera } from './useCampusCamera';
import type { CameraApi, InsetsOf } from './useCampusCamera';
import type { Cam } from './campusCamera';
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
  /** C5: walk to this building now (Walk over). A new seq means a new walk. `instant` stands you at its door with no walk (coming
   *  back from a page with Step outside, WP-1). */
  walkRequest?: { id: BuildingId; seq: number; instant?: boolean } | null;
  /** WP-1: where the avatar stands when the map mounts (the building you were last at), instead of the gate. */
  startAt?: BuildingId | null;
  /** C8: buildings whose room is on air now (from broadcast discovery). */
  onAir?: Set<string>;
  /** C9: the learner's OWN equipped set, drawn on their pin (public slots) and, only while it travels, the ride. */
  ownGear?: Equipped;
  /** WP-2: today's plan: one teal route from where you stand through each unfinished stop, and a numbered pin per stop. Full map only;
   *  the caller leaves it out during a tour and while Colaberry Live is on air (the prototype hides it then too). */
  plan?: PlanStop[];
  /** WP-2: the tour's stop badges (they replace the status badges while the tour runs). */
  tourBadges?: { id: BuildingId; text: string; live: boolean }[];
  /** WP-2: while a building's arrival panel is open, every other building dims (the prototype's .bld.dim). */
  dimExcept?: BuildingId | null;
  /** C11b: the Explorer view's OPEN badges (the prototype shows OPEN on every building an Explorer may use). */
  showOpen?: boolean;
  /** C11b: the AI staff desks on duty for this viewer, drawn at their buildings (full map only). */
  desks?: MapDesk[];
  /** C11b: your initials, drawn in your pin's head as the prototype does. */
  me?: { initials: string } | null;
  /** C11b: the prototype camera (full map only): panels' insets for framing, and a handle for the zoom buttons. */
  camera?: { insets?: InsetsOf; focusInsets?: InsetsOf; apiRef?: React.MutableRefObject<CameraApi | null>;
    framed?: () => { x: number; y: number; h: number } | null; startCam?: Cam };
}

// C11 (the map stays light): memoized, so a walking avatar (one state update per frame) does not re-render every building.
const Building = memo(function Building({ b, access, label, compact, count, shown, onAir = false, here = false, showOpen = false, pin, tourBadge, dim = false, onPick, setRef }: {
  b: CampusBuilding; access: ExplorerAccess; label: string; compact: boolean; count: number; shown?: CampusPerson[]; onAir?: boolean; here?: boolean;
  showOpen?: boolean; pin?: { n: number; done: boolean; next: boolean }; tourBadge?: { text: string; live: boolean }; dim?: boolean;
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
      className={`cm-bld cm-b-${b.id}${access === 'locked' ? ' is-locked' : ''}${here ? ' is-here' : ''}${dim ? ' is-dim' : ''}${onAir ? ' onair' : ''}`}
      {...a11y}
      data-building={b.id} data-testid={`cm-bld-${b.id}`} onClick={() => onPick(b.id)}
      transform={`translate(${isGate ? GATE.x : b.pos.x} ${isGate ? GATE.y : b.pos.y})`}
    >
      {isGate ? <MainGateArt /> : <BuildingArt id={b.id} kind={b.kind as Exclude<CampusBuilding['kind'], 'gate'>} w={b.pos.w} h={b.pos.h} label={compact ? undefined : label} />}
      {count > 0 && <PeopleChip b={b} count={count} shown={shown} compact={compact} />}
      {status && !tourBadge && <StatusBadge b={b} status={status} compact={compact} />}
      {tourBadge && <TourBadge b={b} text={tourBadge.text} live={tourBadge.live} />}
      {pin && <PlanPin b={b} n={pin.n} done={pin.done} next={pin.next} />}
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

/**
 * Today's plan as ONE route (the prototype's renderPlanMap): from where you stand, along the campus paths, through each unfinished
 * stop in order (each leg starts at the previous stop's door).
 */
export function planPathD(from: Here, stops: Pick<CampusBuilding, 'pos' | 'zone'>[]): string | null {
  if (!stops.length) return null;
  let d = `M${from.x} ${from.y}`;
  let prev = from;
  for (const b of stops) {
    for (const q of routeTo(prev, b)) d += `L${q.x} ${q.y}`;
    prev = { ...doorOf(b), zone: b.zone };
  }
  return d;
}

/** WP-2: the plan route (hidden while walking: it is redrawn from where you arrive), its pins, and the tour's badges by building. */
function useMapOverlays(o: { plan?: PlanStop[]; tourBadges?: { id: BuildingId; text: string; live: boolean }[]; buildings: CampusBuilding[];
  compact: boolean; moving: boolean; from: Here }): { pins: ReturnType<typeof pinsOf>; badges: Partial<Record<BuildingId, { text: string; live: boolean }>>; planD: string | null } {
  const { plan, tourBadges, buildings, compact, moving, from } = o;
  const pins = useMemo(() => pinsOf(plan), [plan]);
  const badges = useMemo(() => Object.fromEntries((tourBadges ?? []).map((t) => [t.id, t])) as Partial<Record<BuildingId, { text: string; live: boolean }>>, [tourBadges]);
  const { x, y, zone } = from;
  const planD = useMemo(() => {
    if (compact || moving || !plan) return null;
    const ids: BuildingId[] = [];
    for (const s of plan) if (!s.done && s.buildingId && !ids.includes(s.buildingId)) ids.push(s.buildingId);
    return planPathD({ x, y, zone }, ids.map((id) => buildings.find((b) => b.id === id)).filter((b): b is CampusBuilding => !!b));
  }, [compact, moving, plan, buildings, x, y, zone]);
  return { pins, badges, planD };
}

/** Each plan step's building: its number, whether it is done, and whether it is the next one. */
function pinsOf(plan: PlanStop[] | undefined): Partial<Record<BuildingId, { n: number; done: boolean; next: boolean }>> {
  const out: Partial<Record<BuildingId, { n: number; done: boolean; next: boolean }>> = {};
  const next = plan?.find((s) => !s.done && s.buildingId);
  plan?.forEach((s, i) => { if (s.buildingId && !out[s.buildingId]) out[s.buildingId] = { n: i + 1, done: s.done, next: s === next }; });
  return out;
}

/** You: the prototype's red teardrop with your initials, your public gear on its head, and your ride only while you travel. */
function AvatarPin({ pos, moving, reduceMotion, ownGear, initials }: { pos: Pt; moving: boolean; reduceMotion: boolean; ownGear?: Equipped; initials?: string }): React.ReactElement {
  return (
    <g className={`cm-avatar${moving ? ' is-walking' : ''}`} transform={`translate(${pos.x} ${pos.y})`} aria-hidden="true" data-testid="cm-avatar">
      <ellipse className="cm-pin-shadow" cx={0} cy={3} rx={7} ry={2.5} />
      <g className="bob">
        {ownGear?.ride && moving && !reduceMotion && <RideUnder ride={ownGear.ride} />}
        <path className="cm-pin" d="M0 2 L-7 -12 A9 9 0 1 1 7 -12 Z" />
        {initials
          ? <text className="cm-pin-initials" x={0} y={-15.2} textAnchor="middle">{initials.slice(0, 2)}</text>
          : <circle className="cm-pin-dot" cx={0} cy={-17.7} r={3.6} />}
        {ownGear && <GearOnHead gear={publicOnly(ownGear)} cx={0} cy={-17.7} r={9} />}
      </g>
    </g>
  );
}

export default function CampusWorldMap({ buildings, accessOf, workplaceNames, reduceMotion, compact = false, initialTarget, onArrive, buildingRef, counts, people, onPickPerson, walkRequest, startAt, onAir, plan, tourBadges, dimExcept, ownGear, showOpen = false, camera, desks, me }: CampusMapProps): React.ReactElement {
  // WP-1: you start where you last were (the building's door), else at the gate.
  const [first] = useState<Here>(() => { const b = startAt ? buildings.find((x) => x.id === startAt) : undefined; return b ? { ...doorOf(b), zone: b.zone } : START; });
  const [pos, setPos] = useState<Pt>({ x: first.x, y: first.y });
  const hereRef = useRef<Here>(first);
  const svgRef = useRef<SVGSVGElement>(null);
  const locate = useCallback((id: string) => { const b = buildings.find((x) => x.id === id); return b ? (b.kind === 'gate' ? GATE : { x: b.pos.x, y: b.pos.y }) : null; }, [buildings]);
  const cam = useCampusCamera(svgRef, { enabled: !compact && !!camera, insets: camera?.insets, focusInsets: camera?.focusInsets, avatarRef: hereRef, locate, reduceMotion,
    apiRef: camera?.apiRef, framed: camera?.framed, startCam: camera?.startCam });
  const raf = useRef<number | null>(null);
  // C9: true only while a walk animates (never with reduce motion or on the compact map): the only time a ride is drawn.
  const [moving, setMoving] = useState(false);
  const [atId, setAtId] = useState<BuildingId | null>(null);

  const stop = () => { if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null; } setMoving(false); };
  useEffect(() => stop, []);

  const walkTo = useCallback((id: BuildingId, instant = false) => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    stop();
    if (compact) { onArrive(id); return; }
    const door = doorOf(b);
    const arrive = () => { hereRef.current = { ...door, zone: b.zone }; setAtId(id); cam.focus(b.kind === 'gate' ? { ...GATE, h: 50 } : { x: b.pos.x, y: b.pos.y, h: b.pos.h }); onArrive(id); };
    if (reduceMotion || instant) { setPos(door); arrive(); return; }
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

  const pick = useCallback((id: BuildingId) => walkTo(id), [walkTo]);
  // One stable pick handler per building, so the memoized token groups do not re-render on every walk frame.
  const pickers = useMemo(() => {
    const out: Partial<Record<BuildingId, (p: CampusPerson) => void>> = {};
    if (onPickPerson) for (const b of buildings) out[b.id] = (p: CampusPerson) => onPickPerson(p, b.id);
    return out;
  }, [buildings, onPickPerson]);
  const gateIsBuilding = buildings.some((b) => b.kind === 'gate');
  // C11b Colaberry Live: evening over the full map while a building is really on air, and the path from you to it.
  const live = useMemo(() => (compact || !onAir ? [] : buildings.filter((b) => b.kind !== 'gate' && onAir.has(b.id))), [buildings, onAir, compact]);
  const livePath = live.length && atId !== live[0].id ? [{ x: pos.x, y: pos.y }, ...routeTo(hereRef.current, live[0])] : null;
  const doors = useMemo<PathDoor[]>(() => buildings.filter((b) => b.kind !== 'gate').map((b) => ({ id: b.id, x: b.pos.x, y: b.pos.y, zone: b.zone })), [buildings]);

  const { pins, badges, planD } = useMapOverlays({ plan, tourBadges, buildings, compact, moving, from: { x: pos.x, y: pos.y, zone: hereRef.current.zone } });
  const started = useRef(false);
  useEffect(() => {
    if (initialTarget && !started.current) { started.current = true; walkTo(initialTarget); }
  }, [initialTarget, walkTo]);
  const lastWalk = useRef(0);
  useEffect(() => {
    if (walkRequest && walkRequest.seq !== lastWalk.current) { lastWalk.current = walkRequest.seq; walkTo(walkRequest.id, !!walkRequest.instant); }
  }, [walkRequest, walkTo]);

  return (
    <svg ref={svgRef} className={`cm-map${compact ? ' is-compact' : ''}${reduceMotion ? ' is-reduced' : ''}${camera && !compact ? ' has-camera' : ''}${live.length ? ' is-evening' : ''}`} viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} data-testid={compact ? undefined : 'cm-world'}
      {...(compact ? { 'aria-hidden': true, focusable: 'false' } : { role: 'group', 'aria-label': 'Campus map' })}>
      <Scenery doors={doors} gateIsBuilding={gateIsBuilding} />
      {live.length > 0 && <LiveBack buildings={live} path={livePath} />}
      {planD && <path className="cm-plan-path" d={planD} aria-hidden="true" data-testid="cm-plan-path" />}
      {buildings.map((b) => (
        <Building key={b.id} b={b} access={accessOf(b)} label={buildingName(b, workplaceNames)} compact={compact} count={counts?.[b.id] ?? 0}
          shown={people?.[b.id]?.shown} onAir={!!onAir?.has(b.id)} here={!compact && atId === b.id} showOpen={showOpen}
          pin={compact ? undefined : pins[b.id]} tourBadge={compact ? undefined : badges[b.id]} dim={!compact && !!dimExcept && dimExcept !== b.id}
          onPick={pick} setRef={buildingRef} />
      ))}
      {live.length > 0 && <LiveFront buildings={live} />}
      {!compact && desks && desks.length > 0 && <StaffTokens desks={desks} buildings={buildings} onPick={pick} />}
      {!compact && people && onPickPerson && buildings.map((b) => {
        const t = people[b.id];
        return t ? <PersonTokens key={'t-' + b.id} b={b} shown={t.shown} more={t.more} maxY={WORLD.h} onPick={pickers[b.id]!} /> : null;
      })}
      {!compact && <AvatarPin pos={pos} moving={moving} reduceMotion={reduceMotion} ownGear={ownGear} initials={me?.initials} />}
    </svg>
  );
}
