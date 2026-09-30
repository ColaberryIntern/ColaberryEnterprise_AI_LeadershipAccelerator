/**
 * dependencyService — Components may require other Components (e.g. a Prompt Lab
 * requires an Overview + Video + Knowledge Check). Maintains the `dependencies`
 * edge list, computes the transitive graph, and PREVENTS cycles so curriculum
 * can never be invalid. Pure graph logic over a DB-backed adjacency map.
 */
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';

async function adjacency(): Promise<Map<string, string[]>> {
  const rows = await CurriculumTypeDefinition.findAll({ attributes: ['slug', 'dependencies'] });
  return new Map(rows.map((r) => [r.slug, Array.isArray(r.dependencies) ? r.dependencies : []]));
}

/** True if `deps` for `slug` would introduce a cycle. Pure over the adjacency map. */
export function createsCycle(slug: string, deps: string[], adj: Map<string, string[]>): boolean {
  const map = new Map(adj); map.set(slug, deps);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const dfs = (n: string): boolean => {
    color.set(n, GRAY);
    for (const m of map.get(n) || []) {
      const c = color.get(m) ?? WHITE;
      if (c === GRAY) return true;             // back-edge -> cycle
      if (c === WHITE && dfs(m)) return true;
    }
    color.set(n, BLACK);
    return false;
  };
  return dfs(slug);
}

export async function setDependencies(slug: string, deps: string[]): Promise<CurriculumTypeDefinition> {
  const c = await CurriculumTypeDefinition.findOne({ where: { slug } });
  if (!c) throw Object.assign(new Error(`Component "${slug}" not found`), { status: 404 });
  const clean = Array.from(new Set(deps.filter((d) => d && d !== slug)));
  const adj = await adjacency();
  for (const d of clean) if (!adj.has(d)) throw Object.assign(new Error(`Dependency "${d}" does not exist`), { status: 400 });
  if (createsCycle(slug, clean, adj)) throw Object.assign(new Error('That dependency would create a cycle'), { status: 400 });
  await c.update({ dependencies: clean });
  return c;
}

/** Transitive dependency graph rooted at `slug` (nodes + edges), for visualization. */
export async function dependencyGraph(slug: string) {
  const adj = await adjacency();
  if (!adj.has(slug)) throw Object.assign(new Error(`Component "${slug}" not found`), { status: 404 });
  const nodes = new Set<string>(); const edges: Array<{ from: string; to: string }> = [];
  const stack = [slug];
  while (stack.length) {
    const n = stack.pop()!;
    if (nodes.has(n)) continue;
    nodes.add(n);
    for (const m of adj.get(n) || []) { edges.push({ from: n, to: m }); if (!nodes.has(m)) stack.push(m); }
  }
  // dependents (who requires me)
  const dependents: string[] = [];
  for (const [k, v] of adj) if (v.includes(slug)) dependents.push(k);
  return { root: slug, nodes: Array.from(nodes), edges, dependents, has_cycle: createsCycle(slug, adj.get(slug) || [], adj) };
}
