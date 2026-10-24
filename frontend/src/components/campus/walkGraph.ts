import type { CampusBuilding } from './campusMap';
import { HUB, AVE, GATE } from './art/grounds';
import { doorOf, routeTo } from './walkPath';
import type { Here, Pt } from './walkPath';

/**
 * Campus round 3 §2.5 (C17): the path graph for walking to ANY spot (the prototype's N / E / project / routeTo, D:1065-1086 in
 * docs/design/campus/colaberry-campus-v3.html). Nodes: the hub by the fountain, the avenue's foot under the hub, the gate, both
 * ends of the avenue, every building's door step, and where each lower building's path meets the avenue. Edges: the spine (hub,
 * avenue foot, gate), each upper door to the hub, each lower door down to the avenue, and the avenue itself, node to node.
 *
 * A walk to a spot projects you and the spot onto the nearest path segment, takes the shortest route between them over the graph
 * (Dijkstra; about 30 nodes, so a plain scan is fine), then goes straight across the grass. Pure, so it is unit-tested without a
 * browser.
 */
export interface Graph { nodes: Record<string, Pt>; edges: [string, string][] }
/** The prototype's clamp on a ground click: inside the drawn campus, below the top band. */
export const GROUND = { minX: 40, maxX: 980, minY: 110, maxY: 690 };

export function campusGraph(buildings: Pick<CampusBuilding, 'id' | 'pos' | 'zone'>[]): Graph {
  const nodes: Record<string, Pt> = { hub: HUB, gate: { x: GATE.x, y: GATE.y }, aveC: { x: HUB.x, y: AVE }, ave100: { x: 100, y: AVE }, ave900: { x: 900, y: AVE } };
  const edges: [string, string][] = [['hub', 'aveC'], ['aveC', 'gate']];
  const aveKey = (x: number) => (x === HUB.x ? 'aveC' : `ave${x}`);
  for (const b of buildings) {
    if (b.zone === 'gate') continue; // the gate's door is the gate node itself
    const door = `door_${b.id}`;
    nodes[door] = doorOf(b);
    if (b.zone === 'up') edges.push(['hub', door]);
    else { nodes[aveKey(b.pos.x)] = { x: b.pos.x, y: AVE }; edges.push([door, aveKey(b.pos.x)]); }
  }
  // The avenue: every point on it, left to right, joined in order.
  const onAve = Object.keys(nodes).filter((k) => k.startsWith('ave')).sort((a, b) => nodes[a].x - nodes[b].x);
  onAve.forEach((k, i) => { if (i) edges.push([onAve[i - 1], k]); });
  return { nodes, edges };
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The nearest point on any path segment to `p`, and that segment's two ends. */
export function project(g: Graph, p: Pt): { a: string; z: string; q: Pt; d: number } {
  let best: { a: string; z: string; q: Pt; d: number } | null = null;
  for (const [a, z] of g.edges) {
    const A = g.nodes[a], Z = g.nodes[z], dx = Z.x - A.x, dy = Z.y - A.y, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / L)) : 0;
    const q = { x: A.x + t * dx, y: A.y + t * dy }, d = dist(p, q);
    if (!best || d < best.d) best = { a, z, q, d };
  }
  return best as { a: string; z: string; q: Pt; d: number }; // a campus graph always has the spine's two edges
}

/** Shortest path between two graph points (node keys, plus _S / _T for the projections) by Dijkstra. */
function shortest(g: Graph, s: ReturnType<typeof project>, t: ReturnType<typeof project>): Pt[] {
  const nodes: Record<string, Pt> = { ...g.nodes, _S: s.q, _T: t.q };
  const adj: Record<string, [string, number][]> = {};
  const add = (a: string, b: string) => { const w = dist(nodes[a], nodes[b]); (adj[a] = adj[a] || []).push([b, w]); (adj[b] = adj[b] || []).push([a, w]); };
  g.edges.forEach(([a, z]) => add(a, z));
  add('_S', s.a); add('_S', s.z); add('_T', t.a); add('_T', t.z);
  const D: Record<string, number> = {}, prev: Record<string, string> = {}, Q = new Set(Object.keys(nodes));
  Q.forEach((k) => { D[k] = Infinity; });
  D._S = 0;
  while (Q.size) {
    let cur = '';
    Array.from(Q).forEach((k) => { if (cur === '' || D[k] < D[cur]) cur = k; });
    Q.delete(cur);
    if (cur === '_T' || D[cur] === Infinity) break;
    for (const [v, w] of adj[cur] || []) if (D[cur] + w < D[v]) { D[v] = D[cur] + w; prev[v] = cur; }
  }
  const out: Pt[] = [];
  for (let k: string | undefined = '_T'; k; k = prev[k]) out.unshift(nodes[k]);
  return out;
}

/** Drop points within 1 world unit of the one before (the prototype's clean). */
export function clean(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) if (!out.length || dist(out[out.length - 1], p) > 1) out.push({ x: p.x, y: p.y });
  return out;
}

/** The waypoints from `from` to `to` (excluding `from`, ending exactly at `to`): onto the paths, along them, off across the grass. */
export function routeToPoint(g: Graph, from: Pt, to: Pt): Pt[] {
  const s = project(g, from), t = project(g, to);
  const same = (s.a === t.a && s.z === t.z) || (s.a === t.z && s.z === t.a);
  return clean([from, ...(same ? [s.q, t.q] : shortest(g, s, t)), to]).slice(1);
}

/** Clamp a ground click into the drawn campus (the prototype's bounds). */
export const clampGround = (p: Pt): Pt => ({ x: Math.max(GROUND.minX, Math.min(GROUND.maxX, p.x)), y: Math.max(GROUND.minY, Math.min(GROUND.maxY, p.y)) });

/**
 * The route to a building's door. From a door or the gate it is the classic zone route (unchanged since WP-3); from a spot on the
 * grass (zone 'ground') it goes onto the paths first, over the graph.
 */
export function routeFrom(g: Graph, from: Here, b: Pick<CampusBuilding, 'pos' | 'zone'>): Pt[] {
  return from.zone === 'ground' ? routeToPoint(g, from, doorOf(b)) : routeTo(from, b);
}
