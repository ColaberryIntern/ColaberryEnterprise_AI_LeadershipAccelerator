/**
 * stateGraphBuilder — produces the deterministic graph connecting:
 *   project → BPs → tasks → files → API/UI/database/test nodes
 *
 * Pure function. Same inputs → same graph.
 */
import type {
  AuthoritativeTask,
  EngineCapabilityInput,
  EngineProjectInput,
  StateGraph,
  StateGraphEdge,
  StateGraphNode,
} from '../types/systemState.types';

export interface GraphInput {
  readonly project: EngineProjectInput;
  readonly capabilities: ReadonlyArray<EngineCapabilityInput>;
  readonly tasks: ReadonlyArray<AuthoritativeTask>;
}

export function buildStateGraph(input: GraphInput): StateGraph {
  const nodes: StateGraphNode[] = [];
  const edges: StateGraphEdge[] = [];

  // Project node
  nodes.push({
    id: `project:${input.project.id}`,
    type: 'project',
    label: 'Project',
    metadata: { target_mode: input.project.target_mode },
  });

  // BPs
  for (const cap of input.capabilities) {
    nodes.push({
      id: `bp:${cap.id}`,
      type: 'bp',
      label: cap.name,
      metadata: {
        source: cap.source,
        is_page_bp: !!cap.is_page_bp,
        user_status: cap.user_status,
        applicability_status: cap.applicability_status,
      },
    });
    edges.push({
      from: `project:${input.project.id}`,
      to: `bp:${cap.id}`,
      relation: 'contains',
    });

    // File nodes — backend
    for (const f of cap.linked_backend_services || []) {
      const fileId = `file:${f}`;
      ensureNode(nodes, fileId, 'file', f, { layer: 'backend' });
      edges.push({ from: `bp:${cap.id}`, to: fileId, relation: 'implements' });
    }

    // File nodes — frontend
    for (const f of cap.linked_frontend_components || []) {
      const fileId = `file:${f}`;
      ensureNode(nodes, fileId, 'file', f, { layer: 'frontend' });
      edges.push({ from: `bp:${cap.id}`, to: fileId, relation: 'implements' });
    }

    // File nodes — agents
    for (const f of cap.linked_agents || []) {
      const fileId = `file:${f}`;
      ensureNode(nodes, fileId, 'file', f, { layer: 'agent' });
      edges.push({ from: `bp:${cap.id}`, to: fileId, relation: 'implements' });
    }

    // UI component (if Page BP / has frontend_route)
    if (cap.frontend_route) {
      const uiId = `ui:${cap.frontend_route}`;
      ensureNode(nodes, uiId, 'ui_component', cap.frontend_route, { route: cap.frontend_route });
      edges.push({ from: `bp:${cap.id}`, to: uiId, relation: 'exposes' });
    }
  }

  // Task nodes
  for (const task of input.tasks) {
    nodes.push({
      id: `task:${task.id}`,
      type: 'task',
      label: task.title,
      metadata: { type: task.type, state: task.state, rank: task.calculated_rank },
    });
    if (task.bp_id) {
      edges.push({ from: `bp:${task.bp_id}`, to: `task:${task.id}`, relation: 'has_pending_task' });
    } else {
      edges.push({ from: `project:${input.project.id}`, to: `task:${task.id}`, relation: 'project_task' });
    }
    for (const dep of task.dependencies) {
      edges.push({ from: `task:${task.id}`, to: `task:${dep}`, relation: 'depends_on' });
    }
  }

  return Object.freeze({
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
  });
}

function ensureNode(
  nodes: StateGraphNode[],
  id: string,
  type: StateGraphNode['type'],
  label: string,
  metadata: Record<string, unknown>,
): void {
  if (nodes.some(n => n.id === id)) return;
  nodes.push({ id, type, label, metadata });
}
