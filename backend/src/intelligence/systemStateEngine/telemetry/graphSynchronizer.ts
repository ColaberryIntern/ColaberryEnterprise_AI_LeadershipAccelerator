/**
 * graphSynchronizer — merge manifests + validations + repo evidence into the
 * authoritative state graph.
 *
 * Phase 3 layering (high → low priority):
 *   1. manifest telemetry
 *   2. validation telemetry
 *   3. declared maps (database_map.json, ui_map.json)
 *   4. repo evidence (file tree)
 *
 * Existing graph nodes/edges from the engine's stateGraphBuilder are
 * preserved; this synchronizer ONLY ENHANCES the graph with telemetry.
 *
 * Contract: GRAPH_CONTRACT.md
 */
import type {
  StateGraph,
  StateGraphNode,
  StateGraphEdge,
} from '../types/systemState.types';

export interface GraphAugmentInput {
  readonly base: StateGraph;
  readonly manifests: ReadonlyArray<any>;       // BuildManifest rows
  readonly projectId: string;
}

/**
 * Pure: takes a base graph + manifests and returns an augmented graph with
 * api/ui_component/test/database_object nodes added, plus relation edges
 * back to BPs.
 */
export function augmentGraphFromManifests(input: GraphAugmentInput): StateGraph {
  const nodeMap = new Map<string, StateGraphNode>();
  for (const n of input.base.nodes) nodeMap.set(n.id, n);

  const edges: StateGraphEdge[] = [...input.base.edges];

  for (const m of input.manifests) {
    const bpNodeId = m.bp_id ? `bp:${m.bp_id}` : null;

    // APIs (added + modified)
    for (const a of [...(m.apis_added || []), ...(m.apis_modified || [])]) {
      const id = `api:${a.method} ${a.path}`;
      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id, type: 'api',
          label: `${a.method} ${a.path}`,
          metadata: { source: 'manifest', handler_file: a.handler_file, manifest_id: m.id },
        });
      }
      if (bpNodeId && nodeMap.has(bpNodeId)) {
        edges.push({ from: id, to: bpNodeId, relation: 'exposes' });
      }
    }

    // Frontend routes / UI components
    for (const r of m.frontend_routes_added || []) {
      const id = `ui:route:${r.route}`;
      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id, type: 'ui_component',
          label: r.route,
          metadata: { source: 'manifest', component_file: r.component_file, kind: 'route' },
        });
      }
      if (bpNodeId && nodeMap.has(bpNodeId)) {
        edges.push({ from: id, to: bpNodeId, relation: 'renders' });
      }
    }
    for (const c of [...(m.ui_components_added || []), ...(m.ui_components_modified || [])]) {
      const id = `ui:${c.name}`;
      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id, type: 'ui_component',
          label: c.name,
          metadata: { source: 'manifest', file: c.file, kind: c.category || 'widget' },
        });
      }
      if (bpNodeId && nodeMap.has(bpNodeId)) {
        edges.push({ from: id, to: bpNodeId, relation: 'renders' });
      }
    }

    // Database changes
    for (const d of m.database_changes || []) {
      const id = `db:${d.schema || 'public'}.${d.table}`;
      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id, type: 'database_object',
          label: `${d.schema || 'public'}.${d.table}`,
          metadata: { source: 'manifest', operation: d.operation, manifest_id: m.id },
        });
      }
      if (bpNodeId && nodeMap.has(bpNodeId)) {
        edges.push({ from: bpNodeId, to: id, relation: d.operation.startsWith('drop') ? 'mutates' : 'reads' });
      }
    }

    // Tests
    for (const t of [...(m.tests_added || []), ...(m.tests_modified || [])]) {
      const id = `test:${t.file}`;
      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id, type: 'test',
          label: t.file,
          metadata: { source: 'manifest', test_kind: t.type, target: t.coverage_target },
        });
      }
      if (bpNodeId && nodeMap.has(bpNodeId)) {
        edges.push({ from: id, to: bpNodeId, relation: 'tests' });
      }
    }

    // Validation results inside the manifest (lightweight nodes)
    for (let i = 0; i < (m.validation_results || []).length; i++) {
      const v = m.validation_results[i];
      const id = `val:${m.id}:${i}`;
      nodeMap.set(id, {
        id, type: 'validation_result',
        label: `${v.check}: ${v.status}`,
        metadata: { source: 'manifest', manifest_id: m.id, ...v },
      });
      if (bpNodeId && nodeMap.has(bpNodeId)) {
        edges.push({ from: id, to: bpNodeId, relation: 'validates' });
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}

/**
 * DB-backed: pulls the latest manifests for a project and augments the
 * provided base graph. The engine calls this during state build.
 */
export async function augmentGraphForProject(
  projectId: string,
  base: StateGraph,
): Promise<StateGraph> {
  const { loadManifestsForProject } = await import('./telemetryIngestionService');
  const manifests = await loadManifestsForProject(projectId, { limit: 200 });
  return augmentGraphFromManifests({ base, manifests, projectId });
}

/**
 * Persist the latest reference copy of a project's graph to
 * /system/intelligence/state_graph.json. Idempotent — overwrites the file
 * with the freshest snapshot. Best-effort: never throws.
 */
export async function persistReferenceCopy(
  projectId: string,
  graph: StateGraph,
): Promise<void> {
  try {
    const path = await import('path');
    const fs = await import('fs/promises');
    const repoRoot = path.resolve(__dirname, '../../../../..');
    const target = path.join(repoRoot, 'system', 'intelligence', 'state_graph.json');
    const payload = {
      graph_version: '1.0',
      project_id: projectId,
      generated_at: new Date().toISOString(),
      note: 'Reference copy. Source of truth is the latest snapshot row.',
      nodes: graph.nodes,
      edges: graph.edges,
    };
    await fs.writeFile(target, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn('[graphSynchronizer] persistReferenceCopy failed:', err?.message);
  }
}
