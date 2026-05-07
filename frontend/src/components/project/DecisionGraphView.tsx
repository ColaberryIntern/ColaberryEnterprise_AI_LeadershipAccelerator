/**
 * DecisionGraphView — light SVG-based visualization of the state graph.
 *
 * Phase 5 V1: tier-based layered layout (no force simulation, no extra deps).
 * Nodes group into columns by type; edges are simple cubic bezier curves.
 * Hover a node → details panel shows metadata.
 *
 * Phase 5 §9, §14.
 */
import React, { useMemo, useState } from 'react';
import { useDecisionGraph, type GraphNode, type GraphEdge } from '../../hooks/useDecisionGraph';

type FilterMode = 'all' | 'task' | 'bp' | 'api' | 'ui_component' | 'database_object' | 'test';
type LayerMode = 'all' | 'architecture' | 'ux' | 'behavioral' | 'contradictions' | 'telemetry';

const LAYER_TYPE_MAP: Record<LayerMode, ReadonlyArray<string>> = {
  all: [],
  architecture: ['project', 'bp', 'task', 'file', 'api', 'database_object'],
  ux: ['ui_component', 'bp', 'task'],
  behavioral: ['ui_component', 'task'],
  contradictions: ['validation_result'],
  telemetry: ['validation_result', 'test', 'api', 'database_object'],
};

const TYPE_COLOR: Record<string, string> = {
  project: '#1a365d',
  bp: '#2b6cb0',
  task: '#e53e3e',
  api: '#38a169',
  ui_component: '#8b5cf6',
  database_object: '#d97706',
  validation_result: '#0ea5e9',
  test: '#16a34a',
  file: '#718096',
};

const TYPE_ORDER: ReadonlyArray<string> = [
  'project', 'bp', 'task', 'api', 'ui_component', 'database_object', 'test', 'validation_result', 'file',
];

const COLUMN_WIDTH = 200;
const NODE_HEIGHT = 32;
const NODE_GAP = 8;

export const DecisionGraphView: React.FC<{ height?: number }> = ({ height = 480 }) => {
  const { data, loading, error, refresh } = useDecisionGraph();
  const [filter, setFilter] = useState<FilterMode>('all');
  const [layer, setLayer] = useState<LayerMode>('all');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const layout = useMemo(() => {
    if (!data) return null;
    // Layer filter narrows the type set first; the type filter narrows further.
    let nodes = data.graph.nodes;
    if (layer !== 'all') {
      const allowed = new Set(LAYER_TYPE_MAP[layer]);
      nodes = nodes.filter(n => allowed.has(n.type));
    }
    return computeLayout(nodes, data.graph.edges, filter);
  }, [data, filter, layer]);

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header d-flex justify-content-between align-items-center bg-white">
        <span className="fw-semibold"><i className="bi bi-diagram-3 me-2"></i>Decision graph</span>
        <div className="d-flex gap-2 align-items-center">
          <select
            className="form-select form-select-sm"
            value={layer}
            onChange={e => setLayer(e.target.value as LayerMode)}
            aria-label="Graph layer"
            style={{ width: 'auto' }}
            title="Layer"
          >
            <option value="all">All layers</option>
            <option value="architecture">Architecture</option>
            <option value="ux">UX</option>
            <option value="behavioral">Behavioral</option>
            <option value="contradictions">Contradictions</option>
            <option value="telemetry">Telemetry</option>
          </select>
          <select
            className="form-select form-select-sm"
            value={filter}
            onChange={e => setFilter(e.target.value as FilterMode)}
            aria-label="Filter graph by node type"
            style={{ width: 'auto' }}
          >
            <option value="all">All types</option>
            <option value="task">Tasks only</option>
            <option value="bp">BPs only</option>
            <option value="api">APIs only</option>
            <option value="ui_component">UI components only</option>
            <option value="database_object">DB objects only</option>
            <option value="test">Tests only</option>
          </select>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => void refresh()} aria-label="Refresh graph">
            <i className="bi bi-arrow-clockwise"></i>
          </button>
        </div>
      </div>

      <div className="card-body p-0" style={{ minHeight: height }}>
        {loading && (
          <div className="d-flex justify-content-center align-items-center" style={{ height }} role="status" aria-live="polite">
            <span className="visually-hidden">Loading graph…</span>
            <div className="spinner-border" role="status"></div>
          </div>
        )}
        {error && <div className="alert alert-warning m-3">{error}</div>}
        {!loading && !error && layout && (
          <div className="d-flex">
            <div className="flex-grow-1" style={{ overflow: 'auto', maxHeight: height }}>
              <svg width={layout.width} height={layout.height} role="img" aria-label="State graph">
                {/* Edges first so nodes draw on top */}
                {layout.edgePaths.map((p, i) => (
                  <path
                    key={i}
                    d={p.d}
                    stroke="#cbd5e0"
                    strokeWidth={1.2}
                    fill="none"
                    opacity={hoveredId && (p.from !== hoveredId && p.to !== hoveredId) ? 0.15 : 0.6}
                  />
                ))}
                {layout.placedNodes.map(pn => {
                  const dim = pn.node.type as keyof typeof TYPE_COLOR;
                  const color = TYPE_COLOR[dim] || '#4a5568';
                  return (
                    <g
                      key={pn.node.id}
                      transform={`translate(${pn.x},${pn.y})`}
                      onMouseEnter={() => setHoveredId(pn.node.id)}
                      onMouseLeave={() => setHoveredId(prev => (prev === pn.node.id ? null : prev))}
                      style={{ cursor: 'pointer' }}
                    >
                      <rect
                        width={COLUMN_WIDTH - 12}
                        height={NODE_HEIGHT}
                        rx={6}
                        fill={hoveredId === pn.node.id ? color : 'white'}
                        stroke={color}
                        strokeWidth={hoveredId === pn.node.id ? 2 : 1}
                      />
                      <text
                        x={10}
                        y={NODE_HEIGHT / 2 + 4}
                        fontSize={11}
                        fill={hoveredId === pn.node.id ? 'white' : '#2d3748'}
                        style={{ pointerEvents: 'none' }}
                      >
                        {truncate(pn.node.label, 26)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="border-start p-3" style={{ width: 320, maxHeight: height, overflowY: 'auto' }}>
              <NodeDetail node={hoveredId ? layout.nodeById.get(hoveredId) ?? null : null} />
            </div>
          </div>
        )}
      </div>
      {data && (
        <div className="card-footer text-muted small bg-white">
          {data.node_count} nodes · {data.edge_count} edges · generated {new Date(data.generated_at).toLocaleString()}
        </div>
      )}
    </div>
  );
};

const NodeDetail: React.FC<{ node: GraphNode | null }> = ({ node }) => {
  if (!node) return <div className="text-muted small">Hover a node to inspect.</div>;
  return (
    <div className="small">
      <div className="text-uppercase text-muted" style={{ fontSize: 10 }}>{node.type}</div>
      <div className="fw-semibold mb-2">{node.label}</div>
      <code className="d-block text-truncate" title={node.id}>{node.id}</code>
      {node.metadata && Object.keys(node.metadata).length > 0 && (
        <div className="mt-2">
          <div className="text-muted text-uppercase" style={{ fontSize: 10 }}>Metadata</div>
          <ul className="ps-3 mb-0">
            {Object.entries(node.metadata).slice(0, 8).map(([k, v]) => (
              <li key={k}><span className="text-muted">{k}:</span> {formatMetaValue(v)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

interface PlacedNode { node: GraphNode; x: number; y: number; }

function computeLayout(nodes: ReadonlyArray<GraphNode>, edges: ReadonlyArray<GraphEdge>, filter: FilterMode) {
  const filtered = filter === 'all' ? nodes : nodes.filter(n => n.type === filter);
  const allowedIds = new Set(filtered.map(n => n.id));
  const filteredEdges = edges.filter(e => allowedIds.has(e.from) && allowedIds.has(e.to));

  // Group nodes by type, place each type in its own column.
  const byType = new Map<string, GraphNode[]>();
  for (const n of filtered) {
    const arr = byType.get(n.type) || [];
    arr.push(n);
    byType.set(n.type, arr);
  }

  const placedNodes: PlacedNode[] = [];
  const positions = new Map<string, { x: number; y: number }>();
  let columnIndex = 0;
  let maxRows = 0;

  for (const t of TYPE_ORDER) {
    const ofType = byType.get(t);
    if (!ofType || ofType.length === 0) continue;
    const x = 16 + columnIndex * COLUMN_WIDTH;
    ofType.forEach((node, i) => {
      const y = 16 + i * (NODE_HEIGHT + NODE_GAP);
      positions.set(node.id, { x, y });
      placedNodes.push({ node, x, y });
    });
    if (ofType.length > maxRows) maxRows = ofType.length;
    columnIndex++;
  }

  const width = Math.max(640, columnIndex * COLUMN_WIDTH + 32);
  const height = Math.max(320, maxRows * (NODE_HEIGHT + NODE_GAP) + 32);

  // Edges as cubic bezier curves between mid-right and mid-left of nodes.
  const edgePaths = filteredEdges.map(e => {
    const fp = positions.get(e.from);
    const tp = positions.get(e.to);
    if (!fp || !tp) return { d: '', from: e.from, to: e.to };
    const fx = fp.x + (COLUMN_WIDTH - 12);
    const fy = fp.y + NODE_HEIGHT / 2;
    const tx = tp.x;
    const ty = tp.y + NODE_HEIGHT / 2;
    const dx = (tx - fx) / 2;
    const d = `M ${fx} ${fy} C ${fx + dx} ${fy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
    return { d, from: e.from, to: e.to };
  }).filter(p => p.d);

  const nodeById = new Map<string, GraphNode>();
  for (const n of filtered) nodeById.set(n.id, n);

  return { placedNodes, edgePaths, width, height, nodeById };
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.substring(0, n - 1) + '…';
}

function formatMetaValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v.length > 40 ? v.substring(0, 40) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const j = JSON.stringify(v);
    return j.length > 40 ? j.substring(0, 40) + '…' : j;
  } catch {
    return String(v);
  }
}

export default DecisionGraphView;
