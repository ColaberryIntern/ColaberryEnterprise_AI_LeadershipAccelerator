import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BuildingId, CampusBuilding, ExplorerAccess } from './campusMap';
import { buildingName } from './campusMap';
import { accessLabel } from './campusAccess';
import PersonTokens from './PersonToken';
import type { CampusPerson } from './campusApi';
import { GearOnHead, RideUnder } from './AvatarGear';
import { publicOnly } from './campusGear';
import type { Equipped } from './campusGear';

/**
 * The campus world (Campus C2): an SVG map drawn from the catalog. Original art only - simple
 * pediment, tower, block, amphitheater and arcade shapes, colored by shell tokens in campus.css.
 *
 * Buildings are real buttons (role=button, in Tab order, Enter/Space activate) so the map is
 * usable without a pointer. In full mode a pick walks the avatar along the paths to the door
 * (requestAnimationFrame) and then calls onArrive; with reduce motion it arrives at once and
 * never schedules a frame. Compact mode (the side column) has no avatar: a pick is reported
 * straight away so the caller can open the full map at that building.
 */

export const WORLD = { w: 1000, h: 700 };
export const QUAD = { x: 500, y: 430 };
const SPEED = 900; // world units per second

type Pt = { x: number; y: number };
// The avatar stands on the door step (the pin's tip is its position), above the building's label.
export const doorOf = (b: Pick<CampusBuilding, 'pos'>): Pt => ({ x: b.pos.x, y: b.pos.y + b.pos.h / 2 + 2 });

/** How far a building's roof rises above its body, so the access chip sits clear of it. */
function roofRise(b: CampusBuilding): number {
  const { h } = b.pos;
  if (b.id === 'lecture' || b.id === 'library' || b.id === 'testing' || b.id === 'amphi') return h * 0.45;
  if (b.id === 'observatory') return h * 0.7;
  if (b.id === 'arcade') return 14;
  return 6;
}

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
}

function Roof({ b }: { b: CampusBuilding }): React.ReactElement {
  const { x, y, w, h } = b.pos;
  const left = x - w / 2, top = y - h / 2;
  switch (b.id) {
    case 'lecture': case 'library': case 'testing': case 'observatory':
      return b.id === 'observatory'
        ? <path className="cm-roof" d={`M${left} ${top} A ${w / 2} ${h * 0.7} 0 0 1 ${left + w} ${top} Z`} />
        : <polygon className="cm-roof" points={`${left - 6},${top} ${x},${top - h * 0.45} ${left + w + 6},${top}`} />;
    case 'tower':
      return <circle className="cm-detail" cx={x} cy={top + 18} r={12} />;
    case 'amphi':
      return <path className="cm-roof cm-arch" d={`M${left} ${top + h * 0.2} A ${w / 2} ${h * 0.65} 0 0 1 ${left + w} ${top + h * 0.2}`} />;
    case 'arcade':
      return <rect className="cm-roof" x={left} y={top - 14} width={w} height={16} rx={3} />;
    case 'gate':
      return <path className="cm-roof cm-arch" d={`M${left} ${top + h} V ${top + 10} A ${w / 2} 18 0 0 1 ${left + w} ${top + 10} V ${top + h}`} />;
    default:
      return <rect className="cm-roof" x={left} y={top - 6} width={w} height={8} />;
  }
}

/** C8: a building whose room is on air. Drawn at the roof's left (the head count sits at the right), large on the small maps. */
function OnAirBadge({ b, compact }: { b: CampusBuilding; compact: boolean }): React.ReactElement {
  const { x, y, w, h } = b.pos;
  const bw = compact ? 170 : 62, bh = compact ? 70 : 22;
  const bx = x - w / 2 - 6, by = y - h / 2 - bh / 2 - (compact ? 10 : 0);
  return (
    <g className="cm-onair" aria-hidden="true" data-testid={`cm-onair-${b.id}`}>
      <rect x={bx} y={by} width={bw} height={bh} rx={bh / 2} />
      <text x={bx + bw / 2} y={by + bh / 2 + (compact ? 17 : 4)} textAnchor="middle">ON AIR</text>
    </g>
  );
}

/** Live head count on a building (C4). Rendered only for a real count above zero. */
function CountChip({ b, count, compact }: { b: CampusBuilding; count: number; compact: boolean }): React.ReactElement {
  const { x, y, w, h } = b.pos;
  // The side-column map renders the 1000-unit world at about a fifth of its size, so its chip is
  // drawn large enough to read there (about 24 x 16 px on screen).
  const cw = compact ? 110 : 40, ch = compact ? 76 : 24;
  const cx = x + w / 2 - cw / 2 + 6, cy = y - h / 2 - ch / 2 - (compact ? 10 : 0);
  return (
    <g className="cm-count" data-count={count} aria-hidden="true">
      <rect x={cx} y={cy} width={cw} height={ch} rx={ch / 2} />
      <text x={cx + cw / 2} y={cy + ch / 2 + (compact ? 19 : 5)} textAnchor="middle">{count}</text>
    </g>
  );
}

// C11 (the map stays light): memoized, so a walking avatar (one state update per frame) does not re-render every building.
const Building = memo(function Building({ b, access, label, compact, count, onAir = false, onPick, setRef }: {
  b: CampusBuilding; access: ExplorerAccess; label: string; compact: boolean; count: number; onAir?: boolean;
  onPick: (id: BuildingId) => void; setRef?: (id: BuildingId, el: SVGGElement | null) => void;
}): React.ReactElement {
  const { x, y, w, h } = b.pos;
  const chip = accessLabel(access);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(b.id); }
  };
  const aria = [label, onAir ? 'on air now' : null, chip, count > 0 ? `${count} here now` : null].filter(Boolean).join(', ');
  // C11: compact maps (banner, side nav) are pictures, not controls. The banner's map sits inside its own button and the
  // side nav lists every building as a link right below, so focusable buildings there were 12 duplicate, unlabeled-in-
  // context tab stops (inside aria-hidden in the banner). A pointer click on the nav map still opens the full map.
  const a11y = compact ? {} : { role: 'button', tabIndex: 0, 'aria-label': aria, onKeyDown };
  return (
    <g
      ref={(el) => setRef?.(b.id, el)}
      className={`cm-bld cm-b-${b.id}${access === 'locked' ? ' is-locked' : ''}`}
      {...a11y}
      data-building={b.id} onClick={() => onPick(b.id)}
    >
      {b.id !== 'gate' && <rect className="cm-body" x={x - w / 2} y={y - h / 2} width={w} height={h} rx={4} />}
      {/* The gate is only an arch outline; this invisible area makes its whole footprint clickable (found in C5
          screenshots: clicks inside the arch fell through to the path behind it). */}
      {b.id === 'gate' && <rect className="cm-hit" x={x - w / 2} y={y - h / 2 - 18} width={w} height={h + 18} />}
      <Roof b={b} />
      {b.id !== 'gate' && <rect className="cm-door" x={x - 7} y={y + h / 2 - 16} width={14} height={16} rx={2} />}
      {!compact && <text className="cm-label" x={x} y={y + h / 2 + 22} textAnchor="middle">{label}</text>}
      {!compact && chip && <text className="cm-chip" x={x} y={y - h / 2 - roofRise(b) - 10} textAnchor="middle">{chip}</text>}
      {count > 0 && <CountChip b={b} count={count} compact={compact} />}
      {onAir && <OnAirBadge b={b} compact={compact} />}
    </g>
  );
});

export default function CampusWorldMap({ buildings, accessOf, workplaceNames, reduceMotion, compact = false, initialTarget, onArrive, buildingRef, counts, people, onPickPerson, walkRequest, onAir, route, ownGear }: CampusMapProps): React.ReactElement {
  const [pos, setPos] = useState<Pt>({ x: QUAD.x, y: 640 });
  const posRef = useRef(pos);
  const raf = useRef<number | null>(null);
  posRef.current = pos;
  // C9: true only while a walk animates (never with reduce motion or on the compact map): the only time a ride is drawn.
  const [moving, setMoving] = useState(false);

  const stop = () => { if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null; } setMoving(false); };
  useEffect(() => stop, []);

  const walkTo = useCallback((id: BuildingId) => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    stop();
    const door = doorOf(b);
    if (compact) { onArrive(id); return; }
    if (reduceMotion) { setPos(door); onArrive(id); return; }
    const pts: Pt[] = [posRef.current, QUAD, door];
    const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
    const total = seg.reduce((a, c) => a + c, 0) || 1;
    const duration = (total / SPEED) * 1000;
    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const d = Math.min(1, (t - start) / duration) * total;
      let acc = 0, i = 0;
      while (i < seg.length - 1 && acc + seg[i] < d) { acc += seg[i]; i += 1; }
      const f = seg[i] ? Math.min(1, (d - acc) / seg[i]) : 1;
      setPos({ x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f });
      if (d < total) raf.current = requestAnimationFrame(step);
      else { raf.current = null; setMoving(false); onArrive(id); }
    };
    setMoving(true);
    raf.current = requestAnimationFrame(step);
  }, [buildings, compact, reduceMotion, onArrive]);

  // One stable pick handler per building, so the memoized token groups do not re-render on every walk frame.
  const pickers = useMemo(() => {
    const out: Partial<Record<BuildingId, (p: CampusPerson) => void>> = {};
    if (onPickPerson) for (const b of buildings) out[b.id] = (p: CampusPerson) => onPickPerson(p, b.id);
    return out;
  }, [buildings, onPickPerson]);

  const started = useRef(false);
  useEffect(() => {
    if (initialTarget && !started.current) { started.current = true; walkTo(initialTarget); }
  }, [initialTarget, walkTo]);
  const lastWalk = useRef(0);
  useEffect(() => {
    if (walkRequest && walkRequest.seq !== lastWalk.current) { lastWalk.current = walkRequest.seq; walkTo(walkRequest.id); }
  }, [walkRequest, walkTo]);

  return (
    <svg className={`cm-map${compact ? ' is-compact' : ''}`} viewBox={`0 0 ${WORLD.w} ${WORLD.h}`}
      {...(compact ? { 'aria-hidden': true, focusable: 'false' } : { role: 'group', 'aria-label': 'Campus map' })}>
      <rect className="cm-ground" x={0} y={0} width={WORLD.w} height={WORLD.h} rx={compact ? 18 : 0} />
      {buildings.map((b) => { const d = doorOf(b); return <path key={'p-' + b.id} className="cm-path" d={`M${QUAD.x} ${QUAD.y} L${d.x} ${d.y}`} />; })}
      {!compact && route && route.map((id) => {
        const b = buildings.find((x) => x.id === id); if (!b) return null; const d = doorOf(b);
        return <path key={'r-' + id} className="cm-path is-route" data-testid={`cm-route-${id}`} d={`M${QUAD.x} ${QUAD.y} L${d.x} ${d.y}`} />;
      })}
      <circle className="cm-quad" cx={QUAD.x} cy={QUAD.y} r={compact ? 34 : 28} />
      {buildings.map((b) => (
        <Building key={b.id} b={b} access={accessOf(b)} label={buildingName(b, workplaceNames)} compact={compact} count={counts?.[b.id] ?? 0} onAir={!!onAir?.has(b.id)} onPick={walkTo} setRef={buildingRef} />
      ))}
      {!compact && route && route.map((id, i) => {
        const b = buildings.find((x) => x.id === id); if (!b) return null;
        const n = { x: b.pos.x + b.pos.w / 2, y: b.pos.y }; // the right edge: clear of the label (below) and the chips (top corners)
        return (
          <g key={'n-' + id} className="cm-route-stop" data-testid={`cm-route-stop-${id}`} aria-hidden="true">
            <circle cx={n.x} cy={n.y} r={12} />
            <text x={n.x} y={n.y + 5} textAnchor="middle">{i + 1}</text>
          </g>
        );
      })}
      {!compact && people && onPickPerson && buildings.map((b) => {
        const t = people[b.id];
        return t ? <PersonTokens key={'t-' + b.id} b={b} shown={t.shown} more={t.more} maxY={WORLD.h} onPick={pickers[b.id]!} /> : null;
      })}
      {!compact && (
        <g className="cm-avatar" transform={`translate(${pos.x} ${pos.y}) scale(0.8)`} aria-hidden="true" data-testid="cm-avatar">
          <path className="cm-pin" d="M0 0 C -9 -12 -12 -18 -12 -24 A 12 12 0 1 1 12 -24 C 12 -18 9 -12 0 0 Z" />
          <circle className="cm-pin-dot" cx={0} cy={-24} r={5} />
          {ownGear && <GearOnHead gear={publicOnly(ownGear)} cx={0} cy={-24} r={12} />}
          {ownGear?.ride && moving && !reduceMotion && <RideUnder ride={ownGear.ride} />}
        </g>
      )}
    </svg>
  );
}
