import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BuildingId, CampusBuilding, ExplorerAccess } from './campusMap';
import { buildingName } from './campusMap';
import { accessLabel } from './campusAccess';
import type { CampusPerson } from './campusApi';
import type { Equipped } from './campusGear';
import BuildingArt from './art/BuildingArt';
import { MainGateArt } from './art/MainGate';
import { PeopleChip, StatusBadge, TourBadge, PlanPin, UrgentPing, statusOf } from './art/BuildingBadges';
import type { BadgeStatus } from './art/BuildingBadges';
import AvatarPin from './art/AvatarPin';
import type { Me } from './art/AvatarPin';
import type { PlanStop } from './campusPlan';
import { LiveBack, LiveFront } from './art/LiveDressing';
import type { LiveMark } from './art/LiveDressing';
import StaffTokens from './art/StaffTokens';
import type { MapDesk } from './art/StaffTokens';
import { GroundPatterns, Ground, QuadAndPaths, District, Trees, GATE } from './art/grounds';
import type { PathDoor } from './art/grounds';
import { doorOf, routeTo, START } from './walkPath';
import type { Here, Pt } from './walkPath';
import { campusGraph, clampGround, routeFrom } from './walkGraph';
import type { Graph } from './walkGraph';
import { useCampusCamera } from './useCampusCamera';
import type { CameraApi, InsetsOf } from './useCampusCamera';
import type { Cam } from './campusCamera';
import { useWalk } from './useWalk';
import type { Travel } from './useWalk';
import BoardSign from './board/BoardSign';
import TodayFlag, { GateTodaySign } from './art/TodayFlag';
import { onBoard } from './board/boardApi';
import { BOARD_SPOT } from './board/boardModel';
import './campusMapArt.css';

/**
 * The campus world, drawn as the prototype draws it (C11b; docs/design/campus/colaberry-campus.html): grass, the paved business
 * district, the quad with its fountain, two-tone paths, trees, and every building in its own roof family, standing on its ground
 * line with a name pill below. Colors are art tokens only (campusArtTokens.css).
 *
 * Buildings are real buttons (role=button, in Tab order, Enter/Space activate) so the map is usable without a pointer. In full
 * mode a pick walks the avatar along the paths (useWalk) and then calls onArrive; with reduce motion it arrives at once.
 * Compact mode (the side column, the banner) is a picture: no avatar, no labels, no tab stops; a pick is reported straight away.
 *
 * WP-3: the prototype's walk (speed, easing, route line, footsteps, highlight, toast via onTravel), a bigger click area round each
 * building, the people chip's peek, "—" chips while presence is down, a partner's "N · M yours", a member's time badges and urgent
 * ring, the night look when nobody else is on campus, and your pin in your colour with your photo and level.
 */

export { doorOf } from './walkPath';
export const WORLD = { w: 1000, h: 700 };

export interface MapMoments { urgent: BuildingId | null; badges: Partial<Record<BuildingId, BadgeStatus>> }
/** A walk asked for from outside the map: to a building (`id`) or, C17, to a spot on the grass (`spot`, id null). */
export interface WalkRequest { id: BuildingId | null; spot?: Pt; seq: number; instant?: boolean; run?: boolean }
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
  /** C5: named people per building id (the chip's dots). */
  people?: Partial<Record<string, { shown: CampusPerson[]; more: number }>>;
  /** WP-3: a press on a building's people chip opens the peek at the press. */
  onPeek?: (id: BuildingId, x: number, y: number) => void;
  /** WP-3: a partner's teammates present per building ("N · M yours"). */
  yours?: Partial<Record<string, number>>;
  /** WP-3: presence failed: every chip reads "—" (unknown, not zero). */
  presenceDown?: boolean;
  /** C5: walk to this building now. A new seq means a new walk. `instant` stands you at its door with no walk (Skip, Step outside);
   *  `run` uses the prototype's running speed. */
  walkRequest?: WalkRequest | null;
  /** WP-3: told when a walk starts (what the toast should say) and ends (null). */
  onTravel?: (t: Travel | null) => void;
  /** C17: a click on open ground (not a building, a person, a chip or you), in world units, clamped into the campus. The caller
   *  decides: walk there (a walkRequest with `spot`), or close what is open. Absent = ground clicks do nothing. */
  onGroundClick?: (spot: Pt) => void;
  /** C17: arrived at a spot on the grass (nothing opens; the caller clears "here"). */
  onGround?: () => void;
  /** WP-1: where the avatar stands when the map mounts (the building you were last at), instead of the gate. */
  startAt?: BuildingId | null;
  /** C8: buildings whose room is on air now (from broadcast discovery). */
  onAir?: Set<string>;
  /** C9: the learner's OWN equipped set, drawn on their pin. */
  ownGear?: Equipped;
  /** WP-2: today's plan (route and pins); absent during a tour and while live. */
  plan?: PlanStop[];
  /** WP-2: the tour's stop badges (they replace the status badges while the tour runs). */
  tourBadges?: { id: BuildingId; text: string; live: boolean }[];
  /** WP-2: while a building's arrival panel is open, every other building dims. */
  dimExcept?: BuildingId | null;
  /** WP-3: a member's time badges ("Class in 1d 3h") and the building whose class starts within 15 minutes. */
  moments?: MapMoments;
  /** WP-3: nobody else is on campus right now (the prototype's quiet hours look). */
  quiet?: boolean;
  /** WP-6: Colaberry Live's state and the marquee's words over the live building (beams and waves only while live). */
  liveMark?: LiveMark | null;
  /** WP-4: lifted like a walk's destination (a Right now row in the side panel is hovered). */
  hover?: BuildingId | null;
  /** C11b: the Explorer view's OPEN badges. */
  showOpen?: boolean;
  /** C51 / C52 (v13 T3, T4): the Explorer's TODAY flag over the Schedule tower and START HERE sign at the gate (open Today, no walk). */
  todayFlag?: boolean;
  /** C11b: the AI staff desks on duty for this viewer, drawn at their buildings (full map only). */
  desks?: MapDesk[];
  /** C11b / WP-3: you: initials (from your name), photo, level and account colour. */
  me?: Me | null;
  /** C11b: the prototype camera (full map only). */
  camera?: { insets?: InsetsOf; focusInsets?: InsetsOf; apiRef?: React.MutableRefObject<CameraApi | null>;
    framed?: () => { x: number; y: number; h: number } | null; startCam?: Cam };
}

interface BuildingProps {
  b: CampusBuilding; access: ExplorerAccess; label: string; compact: boolean; count: number; shown?: CampusPerson[]; onAir?: boolean; here?: boolean;
  hl?: boolean; showOpen?: boolean; pin?: { n: number; done: boolean; next: boolean }; tourBadge?: { text: string; live: boolean }; dim?: boolean;
  moment?: BadgeStatus; urgent?: boolean; yours?: number; down?: boolean; onPeek?: (id: BuildingId, x: number, y: number) => void;
  onPick: (id: BuildingId) => void; setRef?: (id: BuildingId, el: SVGGElement | null) => void;
}

// C11 (the map stays light): memoized, so a walking avatar (one state update per frame) does not re-render every building.
const Building = memo(function Building(p: BuildingProps): React.ReactElement {
  const { b, access, label, compact, count, onAir = false, onPick } = p;
  const chip = accessLabel(access);
  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(b.id); } };
  const aria = [label, onAir ? 'on air now' : null, chip, count > 0 ? `${count} here now` : null].filter(Boolean).join(', ');
  // C11: compact maps (banner, side nav) are pictures, not controls.
  const a11y = compact ? {} : { role: 'button', tabIndex: 0, 'aria-label': aria, onKeyDown };
  const isGate = b.kind === 'gate';
  const status = statusOf(access, onAir, !!p.showOpen, p.moment);
  const cls = ['cm-bld', `cm-b-${b.id}`, access === 'locked' && 'is-locked', p.here && 'is-here', p.hl && 'is-hl', p.dim && 'is-dim', onAir && 'onair', p.urgent && 'is-urgent'].filter(Boolean).join(' ');
  return (
    <g ref={(el) => p.setRef?.(b.id, el)} className={cls} {...a11y} data-building={b.id} data-testid={`cm-bld-${b.id}`} onClick={() => onPick(b.id)}
      transform={`translate(${isGate ? GATE.x : b.pos.x} ${isGate ? GATE.y : b.pos.y})`}>
      {!compact && !isGate && <UrgentPing b={b} />}
      {isGate ? <MainGateArt /> : <BuildingArt id={b.id} kind={b.kind as Exclude<CampusBuilding['kind'], 'gate'>} w={b.pos.w} h={b.pos.h} label={compact ? undefined : label} />}
      {(count > 0 || (p.down && !isGate)) && <PeopleChip b={b} count={count} shown={p.shown} compact={compact} yours={p.yours} down={p.down}
        onPeek={p.onPeek && count > 0 ? (e) => p.onPeek!(b.id, e.clientX, e.clientY) : undefined} />}
      {status && !p.tourBadge && <StatusBadge b={b} status={status} compact={compact} />}
      {p.tourBadge && <TourBadge b={b} text={p.tourBadge.text} live={p.tourBadge.live} />}
      {p.pin && <PlanPin b={b} n={p.pin.n} done={p.pin.done} next={p.pin.next} />}
    </g>
  );
});

/**
 * WP-3: the prototype's big click area round each building (D:1712, w+32 by h+74), so a press between the roof, the name pill and
 * the badges still counts. One layer UNDER all the buildings: it catches only the gaps, never a neighbour's art. Pointer only; the
 * buildings themselves are the keyboard targets.
 */
const HitAreas = memo(function HitAreas({ buildings, onPick }: { buildings: CampusBuilding[]; onPick: (id: BuildingId) => void }): React.ReactElement {
  return (
    <g className="cm-hits" aria-hidden="true">
      {buildings.filter((b) => b.kind !== 'gate').map((b) => (
        <rect key={b.id} className="cm-hit-area" data-testid={`cm-hit-${b.id}`} x={b.pos.x - b.pos.w / 2 - 16} y={b.pos.y - b.pos.h - 40}
          width={b.pos.w + 32} height={b.pos.h + 74} fill="transparent" onClick={() => onPick(b.id)} />
      ))}
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
export function planPathD(from: Here, stops: Pick<CampusBuilding, 'pos' | 'zone'>[], g?: Graph): string | null {
  if (!stops.length) return null;
  let d = `M${from.x} ${from.y}`;
  let prev = from;
  for (const b of stops) {
    for (const q of (g ? routeFrom(g, prev, b) : routeTo(prev, b))) d += `L${q.x} ${q.y}`;
    prev = { ...doorOf(b), zone: b.zone };
  }
  return d;
}

/** WP-2: the plan route (hidden while walking: it is redrawn from where you arrive), its pins, and the tour's badges by building. */
function useMapOverlays(o: { plan?: PlanStop[]; tourBadges?: { id: BuildingId; text: string; live: boolean }[]; buildings: CampusBuilding[];
  compact: boolean; moving: boolean; from: Here; graph: Graph }): { pins: ReturnType<typeof pinsOf>; badges: Partial<Record<BuildingId, { text: string; live: boolean }>>; planD: string | null } {
  const { plan, tourBadges, buildings, compact, moving, from, graph } = o;
  const pins = useMemo(() => pinsOf(plan), [plan]);
  const badges = useMemo(() => Object.fromEntries((tourBadges ?? []).map((t) => [t.id, t])) as Partial<Record<BuildingId, { text: string; live: boolean }>>, [tourBadges]);
  const { x, y, zone } = from;
  const planD = useMemo(() => {
    if (compact || moving || !plan) return null;
    const ids: BuildingId[] = [];
    for (const s of plan) if (!s.done && s.buildingId && !ids.includes(s.buildingId)) ids.push(s.buildingId);
    return planPathD({ x, y, zone }, ids.map((id) => buildings.find((b) => b.id === id)).filter((b): b is CampusBuilding => !!b), graph);
  }, [compact, moving, plan, buildings, x, y, zone, graph]);
  return { pins, badges, planD };
}

/** Each plan step's building: its number, whether it is done, and whether it is the next one. */
function pinsOf(plan: PlanStop[] | undefined): Partial<Record<BuildingId, { n: number; done: boolean; next: boolean }>> {
  const out: Partial<Record<BuildingId, { n: number; done: boolean; next: boolean }>> = {};
  const next = plan?.find((s) => !s.done && s.buildingId);
  plan?.forEach((s, i) => { if (s.buildingId && !out[s.buildingId]) out[s.buildingId] = { n: i + 1, done: s.done, next: s === next }; });
  return out;
}

/** C17: what a click must NOT be on to count as ground: a building (or its click area), a staff desk, or you. */
const NOT_GROUND = '.cm-bld, .cm-hit-area, .cm-staff-tok, .cm-avatar, .cm-cboard-sign, .cm-today-flag, .cm-gate-today';
/** A screen point in world units, through the map's current viewBox (null where the browser cannot say, e.g. jsdom). */
function toWorld(svg: SVGSVGElement | null, x: number, y: number): Pt | null {
  const m = svg?.getScreenCTM?.();
  if (!svg || !m || typeof svg.createSVGPoint !== 'function') return null;
  const pt = svg.createSVGPoint();
  pt.x = x; pt.y = y;
  const w = pt.matrixTransform(m.inverse());
  return { x: w.x, y: w.y };
}

export default function CampusWorldMap(p: CampusMapProps): React.ReactElement {
  const { buildings, accessOf, workplaceNames, reduceMotion, compact = false, onArrive, counts, people, onAir, walkRequest, camera } = p;
  // WP-1: you start where you last were (the building's door), else at the gate.
  const [first] = useState<Here>(() => { const b = p.startAt ? buildings.find((x) => x.id === p.startAt) : undefined; return b ? { ...doorOf(b), zone: b.zone } : START; });
  const [pos, setPos] = useState<Pt>({ x: first.x, y: first.y });
  const hereRef = useRef<Here>(first);
  const svgRef = useRef<SVGSVGElement>(null);
  const stepsRef = useRef<SVGGElement>(null);
  const locate = useCallback((id: string) => { const b = buildings.find((x) => x.id === id); return b ? (b.kind === 'gate' ? GATE : { x: b.pos.x, y: b.pos.y }) : null; }, [buildings]);
  const cam = useCampusCamera(svgRef, { enabled: !compact && !!camera, insets: camera?.insets, focusInsets: camera?.focusInsets, avatarRef: hereRef, locate, reduceMotion,
    apiRef: camera?.apiRef, framed: camera?.framed, startCam: camera?.startCam });
  const { walkTo, walkToSpot, moving, running, atId, targetId, routeD, spot } = useWalk({ buildings, compact, reduceMotion, hereRef, setPos, cam, stepsRef,
    onArrive, onTravel: p.onTravel, onGround: p.onGround });
  const graph = useMemo(() => campusGraph(buildings), [buildings]);

  const pick = useCallback((id: BuildingId) => walkTo(id), [walkTo]);
  // C17: a click on open ground (a drag's closing click never gets here: useCampusCamera swallows it in the capture phase).
  const { onGroundClick } = p;
  const groundClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!onGroundClick || (e.target as Element).closest?.(NOT_GROUND)) return;
    const w = toWorld(svgRef.current, e.clientX, e.clientY);
    if (w) onGroundClick(clampGround(w));
  }, [onGroundClick]);
  const gateIsBuilding = buildings.some((b) => b.kind === 'gate');
  const tower = buildings.find((b) => b.id === 'tower');
  // C11b Colaberry Live: evening over the full map while a building is really on air, and the path from you to it.
  const live = useMemo(() => (compact || !onAir ? [] : buildings.filter((b) => b.kind !== 'gate' && onAir.has(b.id))), [buildings, onAir, compact]);
  const livePath = live.length && atId !== live[0].id ? [{ x: pos.x, y: pos.y }, ...routeFrom(graph, hereRef.current, live[0])] : null;
  const doors = useMemo<PathDoor[]>(() => buildings.filter((b) => b.kind !== 'gate').map((b) => ({ id: b.id, x: b.pos.x, y: b.pos.y, zone: b.zone })), [buildings]);

  const { pins, badges, planD } = useMapOverlays({ plan: p.plan, tourBadges: p.tourBadges, buildings, compact, moving, from: { x: pos.x, y: pos.y, zone: hereRef.current.zone }, graph });
  const started = useRef(false);
  const { initialTarget } = p;
  useEffect(() => { if (initialTarget && !started.current) { started.current = true; walkTo(initialTarget); } }, [initialTarget, walkTo]);
  const lastWalk = useRef(0);
  useEffect(() => {
    if (!walkRequest || walkRequest.seq === lastWalk.current) return;
    lastWalk.current = walkRequest.seq;
    const how = { instant: !!walkRequest.instant, run: !!walkRequest.run };
    if (walkRequest.spot) walkToSpot(walkRequest.spot, how); else if (walkRequest.id) walkTo(walkRequest.id, how);
  }, [walkRequest, walkTo, walkToSpot]);

  // C30 (v7 R3): opening the Community Board with a walk (the board, the chip, Where to?) walks you to it first
  useEffect(() => (compact ? undefined : onBoard((o) => { if (o.walk) walkToSpot({ ...BOARD_SPOT }, { instant: false, run: false }); })), [compact, walkToSpot]);

  const quiet = !compact && !!p.quiet && !live.length;
  const urgent = live.length ? null : p.moments?.urgent ?? null; // the prototype drops the urgent ring while live
  const cls = ['cm-map', compact && 'is-compact', reduceMotion && 'is-reduced', camera && !compact && 'has-camera', live.length && 'is-evening', live.length && `ls-${p.liveMark?.state ?? 'live'}`, quiet && 'is-quiet'].filter(Boolean).join(' ');
  return (
    <svg ref={svgRef} className={cls} viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} data-testid={compact ? undefined : 'cm-world'}
      {...(compact ? { 'aria-hidden': true, focusable: 'false' } : { role: 'group', 'aria-label': 'Campus map', onClick: groundClick })}>
      <Scenery doors={doors} gateIsBuilding={gateIsBuilding} />
      {!compact && <path className="cm-route-line" d={routeD ?? ''} aria-hidden="true" data-testid="cm-route-line" />}
      {!compact && spot && (
        <g className="cm-drop-pin" transform={`translate(${spot.x} ${spot.y})`} aria-hidden="true" data-testid="cm-drop-pin">
          <circle className="ring" r={10} /><circle className="dot" r={3.5} />
        </g>
      )}
      {!compact && <g className="cm-steps" ref={stepsRef} aria-hidden="true" />}
      {live.length > 0 && <LiveBack buildings={live} path={livePath} />}
      {planD && <path className="cm-plan-path" d={planD} aria-hidden="true" data-testid="cm-plan-path" />}
      {!compact && <HitAreas buildings={buildings} onPick={pick} />}
      {buildings.map((b) => (
        <Building key={b.id} b={b} access={accessOf(b)} label={buildingName(b, workplaceNames)} compact={compact} count={counts?.[b.id] ?? 0}
          shown={people?.[b.id]?.shown} onAir={!!onAir?.has(b.id)} here={!compact && atId === b.id} hl={!compact && (targetId === b.id || p.hover === b.id)} showOpen={p.showOpen}
          pin={compact ? undefined : pins[b.id]} tourBadge={compact ? undefined : badges[b.id]} dim={!compact && !!p.dimExcept && p.dimExcept !== b.id}
          moment={compact ? undefined : p.moments?.badges[b.id]} urgent={!compact && urgent === b.id} yours={p.yours?.[b.id]} down={!compact && !!p.presenceDown}
          onPeek={compact ? undefined : p.onPeek} onPick={pick} setRef={p.buildingRef} />
      ))}
      {live.length > 0 && <LiveFront buildings={live} mark={compact ? null : p.liveMark} />}
      {!compact && <BoardSign />}
      {!compact && p.todayFlag && tower && <TodayFlag tower={tower} />}
      {!compact && p.todayFlag && gateIsBuilding && <GateTodaySign />}
      {!compact && p.desks && p.desks.length > 0 && <StaffTokens desks={p.desks} buildings={buildings} onPick={pick} />}
      {!compact && <AvatarPin pos={pos} moving={moving} running={running} reduceMotion={reduceMotion} ownGear={p.ownGear} me={p.me} />}
    </svg>
  );
}
