import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CampusPerson } from '../campusApi';
import type { BuildingId, CampusBuilding } from '../campusMap';
import type { Pt } from '../walkPath';
import { campusGraph, routeToPoint } from '../walkGraph';
import { WALKERS_MAX, WALK_SPEED, pointAt, track, walkerPlan } from '../campusWalkers';
import type { WalkerPlace } from '../campusWalkers';
import { initialsOf } from '../WhoIsHere';

/**
 * C23 Q1: the real people walking the campus (campusWalkers.ts has the rules). Each stands by the building the presence poll lists
 * them in; when a later poll lists them elsewhere they walk the paths there (walkGraph.routeToPoint), at the prototype's speed. The
 * walk is moved by requestAnimationFrame writing the transform straight onto the element, so a walk never re-renders the map. With
 * reduce motion they are simply in the new place. A press opens their person card; like the people chip the figures are pointer
 * only (aria-hidden), and Who's here in the arrival panel is the keyboard way to the same people.
 */
interface Run { pts: Pt[]; lens: number[]; total: number; d: number }

export default function MapWalkers({ people, buildings, reduceMotion, team = false, onPick }: {
  people?: Partial<Record<string, { shown: CampusPerson[] }>>; buildings: CampusBuilding[]; reduceMotion: boolean; team?: boolean;
  onPick?: (p: CampusPerson, at: BuildingId) => void;
}): React.ReactElement | null {
  const graph = useMemo(() => campusGraph(buildings), [buildings]);
  const [shown, setShown] = useState<WalkerPlace[]>(() => walkerPlan(people, buildings, WALKERS_MAX));
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const els = useRef(new Map<string, SVGGElement>());
  const runs = useRef(new Map<string, Run>());
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const prev = new Map(shownRef.current.map((w) => [w.person.enrollment_id, w]));
    const want = walkerPlan(people, buildings, WALKERS_MAX, new Set(prev.keys()));
    const live = new Set(want.map((w) => w.person.enrollment_id));
    runs.current.forEach((_r, id) => { if (!live.has(id)) runs.current.delete(id); });
    const next = want.map((w) => {
      const id = w.person.enrollment_id, o = prev.get(id), r = runs.current.get(id);
      if (o && r && o.at === w.at && !reduceMotion) return { ...w, rest: o.rest }; // still on the way there: let the walk finish
      if (!o || o.at === w.at || reduceMotion) { runs.current.delete(id); return w; }
      // they moved: walk from where they are now (mid-walk too) to their new spot; the element keeps its old place until the walk ends
      const from = r ? pointAt(r.pts, r.lens, r.d) : o.rest;
      const pts = [from, ...routeToPoint(graph, from, w.rest)];
      runs.current.set(id, { pts, ...track(pts), d: 0 });
      return { ...w, rest: o.rest };
    });
    setShown(next);
  }, [people, buildings, graph, reduceMotion]);

  useEffect(() => {
    if (!runs.current.size || frame.current !== null) return undefined;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const done: string[] = [];
      runs.current.forEach((r, id) => {
        r.d += WALK_SPEED * dt;
        const at = pointAt(r.pts, r.lens, r.d);
        els.current.get(id)?.setAttribute('transform', `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`);
        if (r.d >= r.total) done.push(id);
      });
      if (done.length) {
        const end = new Map(done.map((id) => { const r = runs.current.get(id) as Run; return [id, r.pts[r.pts.length - 1]]; }));
        done.forEach((id) => runs.current.delete(id));
        setShown((s) => s.map((w) => (end.has(w.person.enrollment_id) ? { ...w, rest: end.get(w.person.enrollment_id) as Pt } : w)));
      }
      frame.current = runs.current.size ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
    return undefined;
  }, [shown]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; }, []);

  if (!shown.length) return null;
  return (
    <g className="cm-walkers" aria-hidden="true" data-testid="cm-walkers">
      {shown.map((w, i) => {
        const id = w.person.enrollment_id;
        return (
          <g key={id} ref={(el) => { if (el) els.current.set(id, el); else els.current.delete(id); }}
            className={`cm-walker${team ? ' is-team' : ''}${onPick ? ' is-pickable' : ''}`} transform={`translate(${w.rest.x} ${w.rest.y})`}
            data-testid="cm-walker" data-at={w.at} onClick={onPick ? (e) => { e.stopPropagation(); onPick(w.person, w.at); } : undefined}>
            <title>{w.person.display_name}</title>
            <ellipse className="sh" cx={0} cy={1} rx={5} ry={1.8} />
            <circle className="face" r={6.5} cy={-6} />
            {w.person.avatar_url
              ? <>
                  <defs><clipPath id={`cm-walker-clip-${i}`}><circle r={5.5} cy={-6} /></clipPath></defs>
                  <image href={w.person.avatar_url} x={-5.5} y={-11.5} width={11} height={11} preserveAspectRatio="xMidYMid slice" clipPath={`url(#cm-walker-clip-${i})`} />
                </>
              : <text y={-3.8} textAnchor="middle">{initialsOf(w.person.display_name)}</text>}
          </g>
        );
      })}
    </g>
  );
}
