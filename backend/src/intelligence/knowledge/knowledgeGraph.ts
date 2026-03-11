// ─── Knowledge Graph ─────────────────────────────────────────────────────────
// In-memory business entity relationship graph built from DatasetRegistry and
// businessEntityService. Used by RootCauseAgent and ActionPlannerAgent to trace
// impact paths across entities.

import DatasetRegistry from '../../models/DatasetRegistry';
import { buildBusinessEntityHierarchy } from '../services/businessEntityService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KGNode {
  id: string;
  type: 'entity' | 'table' | 'metric';
  label: string;
  metadata: Record<string, any>;
}

export interface KGEdge {
  source: string;
  target: string;
  relationship: string;
  weight: number; // 0-1, strength of connection
}

// ─── Knowledge Graph ─────────────────────────────────────────────────────────

export class KnowledgeGraph {
  private nodes = new Map<string, KGNode>();
  private adjacency = new Map<string, KGEdge[]>(); // node id → outgoing edges

  addNode(node: KGNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, []);
    }
  }

  addEdge(edge: KGEdge): void {
    const edges = this.adjacency.get(edge.source);
    if (edges) {
      edges.push(edge);
    } else {
      this.adjacency.set(edge.source, [edge]);
    }
    // Ensure reverse lookup exists (undirected traversal)
    if (!this.adjacency.has(edge.target)) {
      this.adjacency.set(edge.target, []);
    }
  }

  getNode(id: string): KGNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Return nodes related to `entity` within `depth` hops.
   */
  getRelated(entity: string, depth = 1): KGNode[] {
    const visited = new Set<string>();
    const queue: Array<{ id: string; d: number }> = [{ id: entity, d: 0 }];
    const result: KGNode[] = [];

    while (queue.length > 0) {
      const { id, d } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      if (id !== entity) {
        const node = this.nodes.get(id);
        if (node) result.push(node);
      }

      if (d < depth) {
        // Forward edges
        for (const edge of this.adjacency.get(id) || []) {
          if (!visited.has(edge.target)) {
            queue.push({ id: edge.target, d: d + 1 });
          }
        }
        // Reverse edges (undirected traversal)
        for (const [sourceId, edges] of this.adjacency) {
          for (const edge of edges) {
            if (edge.target === id && !visited.has(sourceId)) {
              queue.push({ id: sourceId, d: d + 1 });
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Find shortest path between two nodes. Returns edges along the path.
   */
  getPath(from: string, to: string): KGEdge[] {
    if (from === to) return [];

    const visited = new Set<string>();
    const parent = new Map<string, { node: string; edge: KGEdge }>();
    const queue: string[] = [from];
    visited.add(from);

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Forward edges
      for (const edge of this.adjacency.get(current) || []) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          parent.set(edge.target, { node: current, edge });
          if (edge.target === to) return this.reconstructPath(parent, to);
          queue.push(edge.target);
        }
      }

      // Reverse edges
      for (const [sourceId, edges] of this.adjacency) {
        for (const edge of edges) {
          if (edge.target === current && !visited.has(sourceId)) {
            visited.add(sourceId);
            parent.set(sourceId, { node: current, edge: { ...edge, source: current, target: sourceId } });
            if (sourceId === to) return this.reconstructPath(parent, to);
            queue.push(sourceId);
          }
        }
      }
    }

    return []; // no path
  }

  /**
   * Trace all entities that would be affected by a change to `entity`.
   * Uses BFS with edge weights to estimate impact propagation.
   */
  traceImpact(entity: string): { affected: KGNode[]; edges: KGEdge[] } {
    const affected: KGNode[] = [];
    const impactEdges: KGEdge[] = [];
    const visited = new Set<string>();
    const queue: string[] = [entity];
    visited.add(entity);

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const edge of this.adjacency.get(current) || []) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          impactEdges.push(edge);
          const node = this.nodes.get(edge.target);
          if (node) affected.push(node);
          queue.push(edge.target);
        }
      }
    }

    return { affected, edges: impactEdges };
  }

  /**
   * Return summary stats for logging/debugging.
   */
  stats(): { nodes: number; edges: number } {
    let edgeCount = 0;
    for (const edges of this.adjacency.values()) {
      edgeCount += edges.length;
    }
    return { nodes: this.nodes.size, edges: edgeCount };
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private reconstructPath(
    parent: Map<string, { node: string; edge: KGEdge }>,
    to: string,
  ): KGEdge[] {
    const path: KGEdge[] = [];
    let current = to;
    while (parent.has(current)) {
      const { node, edge } = parent.get(current)!;
      path.unshift(edge);
      current = node;
    }
    return path;
  }

  // ─── Factory ───────────────────────────────────────────────────────────

  /**
   * Build a KnowledgeGraph from DatasetRegistry + businessEntityService.
   */
  static async buildFromRegistry(): Promise<KnowledgeGraph> {
    const graph = new KnowledgeGraph();

    try {
      // 1. Add entity category nodes from business hierarchy
      const hierarchy = await buildBusinessEntityHierarchy();

      for (const cat of hierarchy.categories) {
        graph.addNode({
          id: cat.id,
          type: 'entity',
          label: cat.label,
          metadata: {
            color: cat.color,
            table_count: cat.table_count,
            total_rows: cat.total_rows,
            tables: cat.matched_tables,
          },
        });
      }

      // 2. Add hierarchy edges (campaign→leads, leads→students, etc.)
      for (const edge of hierarchy.hierarchy_edges) {
        graph.addEdge({
          source: edge.source,
          target: edge.target,
          relationship: edge.relationship,
          weight: 0.8,
        });
      }

      // 3. Enrich with DatasetRegistry table-level relationships
      const datasets = await DatasetRegistry.findAll({
        where: { status: 'active' },
        attributes: ['table_name', 'relationships', 'row_count', 'semantic_types'],
      });

      for (const ds of datasets) {
        const tableName = ds.get('table_name') as string;
        const relationships = ds.get('relationships') as Record<string, any>[] | null;

        // Add table node
        graph.addNode({
          id: `table:${tableName}`,
          type: 'table',
          label: tableName,
          metadata: {
            row_count: ds.get('row_count'),
            semantic_types: ds.get('semantic_types'),
          },
        });

        // Link table to its entity category
        for (const cat of hierarchy.categories) {
          if (cat.matched_tables.includes(tableName)) {
            graph.addEdge({
              source: cat.id,
              target: `table:${tableName}`,
              relationship: 'contains_table',
              weight: 0.6,
            });
            break;
          }
        }

        // Add cross-table relationships from discovery
        if (Array.isArray(relationships)) {
          for (const rel of relationships) {
            if (rel.target_table) {
              graph.addEdge({
                source: `table:${tableName}`,
                target: `table:${rel.target_table}`,
                relationship: rel.type || 'references',
                weight: 0.5,
              });
            }
          }
        }
      }

      console.log(`[KnowledgeGraph] Built: ${graph.stats().nodes} nodes, ${graph.stats().edges} edges`);
    } catch (err: any) {
      console.warn('[KnowledgeGraph] Build error (returning partial graph):', err?.message);
    }

    return graph;
  }
}

// ─── Singleton Cache ─────────────────────────────────────────────────────────
// Refreshed after each discovery run or on demand.

let cachedGraph: KnowledgeGraph | null = null;
let lastBuild = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get or build the Knowledge Graph, with a 10-minute cache.
 */
export async function getKnowledgeGraph(forceRefresh = false): Promise<KnowledgeGraph> {
  const now = Date.now();
  if (!forceRefresh && cachedGraph && now - lastBuild < CACHE_TTL_MS) {
    return cachedGraph;
  }
  cachedGraph = await KnowledgeGraph.buildFromRegistry();
  lastBuild = now;
  return cachedGraph;
}

/**
 * Invalidate the cached graph (call after discovery runs).
 */
export function invalidateKnowledgeGraph(): void {
  cachedGraph = null;
  lastBuild = 0;
}
