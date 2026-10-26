import { campusGraph, project, routeToPoint, routeFrom, clampGround, clean } from '../walkGraph';
import { doorOf, routeTo, START } from '../walkPath';
import type { Pt } from '../walkPath';
import { CAMPUS_BUILDINGS } from '../campusMap';

/** Campus round 3 §2.5 (C17): the path graph behind click-to-walk (prototype D:1065-1086). */
const all = [...CAMPUS_BUILDINGS];
const b = (id: string) => all.find((x) => x.id === id)!;
const g = campusGraph(all);
const len = (pts: Pt[]) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
/** True when p lies on some path segment (within a hair). */
const onPath = (p: Pt) => project(g, p).d < 1e-6;

describe('the campus path graph', () => {
  it('has the spine, a door per building (the gate is its own node), and the avenue joined in order', () => {
    expect(g.nodes.hub).toEqual({ x: 500, y: 400 });
    expect(g.nodes.gate).toEqual({ x: 500, y: 640 });
    expect(g.nodes.aveC).toEqual({ x: 500, y: 592 });
    expect(g.edges).toEqual(expect.arrayContaining([['hub', 'aveC'], ['aveC', 'gate']]));
    for (const x of all.filter((y) => y.zone !== 'gate')) expect(g.nodes[`door_${x.id}`]).toEqual(doorOf(x));
    expect(g.nodes.door_gate).toBeUndefined();
    // upper doors hang off the hub; lower doors drop to the avenue at their own x
    expect(g.edges).toContainEqual(['hub', 'door_library']);
    expect(g.edges).toContainEqual(['door_commons', 'ave310']);
    // the avenue runs left to right with no gaps: each avenue edge joins neighbours
    const ave = g.edges.filter(([a, z]) => a.startsWith('ave') && z.startsWith('ave'));
    for (const [a, z] of ave) expect(g.nodes[a].x).toBeLessThan(g.nodes[z].x);
    expect(ave[0][0]).toBe('ave100');
    expect(ave[ave.length - 1][1]).toBe('ave900');
  });

  it('projects a point onto the nearest segment, clamped to its ends', () => {
    const p = project(g, { x: 700, y: 600 });
    expect(p.q).toEqual({ x: 700, y: 592 });
    expect(p.d).toBeCloseTo(8);
    expect(project(g, { x: 20, y: 592 }).q).toEqual({ x: 100, y: 592 }); // past the avenue's end
  });
});

describe('routeToPoint: onto the paths, along them, off across the grass', () => {
  it('ends exactly at the spot, never repeats a point, and walks the paths in between', () => {
    const to = { x: 700, y: 300 };
    const r = routeToPoint(g, START, to);
    expect(r[r.length - 1]).toEqual(to);
    expect(clean([START, ...r])).toHaveLength(r.length + 1);
    r.slice(0, -1).forEach((p) => expect(onPath(p)).toBe(true)); // every turn is on a path; only the last leg crosses grass
  });

  it('two spots on the same segment: straight along it, no detour through a node', () => {
    const r = routeToPoint(g, { x: 600, y: 600 }, { x: 650, y: 600 });
    expect(r).toEqual([{ x: 600, y: 592 }, { x: 650, y: 592 }, { x: 650, y: 600 }]);
  });

  it('takes the shortest way (Dijkstra): along the avenue between two lower spots, not round by the hub', () => {
    const from = { x: 200, y: 600 }, to = { x: 800, y: 600 };
    const r = routeToPoint(g, from, to);
    expect(r.every((p) => p.y >= 592)).toBe(true);
    expect(len([from, ...r])).toBeCloseTo(600 + 16);
  });

  it('from the gate to a spot by the library: up the spine through the hub', () => {
    const r = routeToPoint(g, START, { x: 260, y: 240 });
    expect(r).toContainEqual({ x: 500, y: 400 });
    expect(r).toContainEqual({ x: 500, y: 592 });
  });

  it('already there: no waypoints', () => {
    expect(routeToPoint(g, { x: 700, y: 592 }, { x: 700, y: 592 })).toEqual([]);
  });
});

describe('routeFrom: a building walk from a door is unchanged; from the grass it finds the paths first', () => {
  it('from a door or the gate it is the classic zone route', () => {
    expect(routeFrom(g, START, b('library'))).toEqual(routeTo(START, b('library')));
    const at = { ...doorOf(b('commons')), zone: 'ave' as const };
    expect(routeFrom(g, at, b('tower'))).toEqual(routeTo(at, b('tower')));
  });

  it('from a spot on the grass: onto the nearest path, then to the door', () => {
    const at = { x: 700, y: 520, zone: 'ground' as const };
    const r = routeFrom(g, at, b('library'));
    expect(r[0]).toEqual(project(g, at).q);
    expect(r[r.length - 1]).toEqual(doorOf(b('library')));
    expect(r).toContainEqual({ x: 500, y: 400 }); // through the hub, not straight over the lawn
  });
});

it('clampGround keeps a click inside the drawn campus (the prototype bounds)', () => {
  expect(clampGround({ x: 5, y: 900 })).toEqual({ x: 40, y: 690 });
  expect(clampGround({ x: 2000, y: 20 })).toEqual({ x: 980, y: 110 });
  expect(clampGround({ x: 400, y: 300 })).toEqual({ x: 400, y: 300 });
});
