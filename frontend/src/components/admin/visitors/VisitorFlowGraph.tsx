import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import {
  getVisitorFlowGraph,
  getFlowNodeSessions,
  FlowGraphData,
  FlowGraphNode,
  FlowGraphEdge,
  FlowSessionRecord,
} from '../../../services/intelligenceApi';

// ─── Layout Constants ──────────────────────────────────────────────────────────

const COLUMN_CONFIG: Record<string, number> = {
  referrer: 0, landing: 1, browse: 2, intent: 3, exit: 4,
};
const COLUMN_X_PCT = [0.08, 0.28, 0.48, 0.68, 0.92];
const COLUMN_LABELS = ['Referrer', 'Landing Page', 'Browse', 'High Intent', 'Exit'];

const ZONE_RANGES: Record<string, [number, number]> = {
  referrer: [0, 0.18],
  landing:  [0.18, 0.38],
  browse:   [0.38, 0.58],
  intent:   [0.58, 0.78],
  exit:     [0.78, 1.0],
};

const POSITIONS_KEY = 'visitor-flow-graph-positions-v1';

// ─── Colors ─────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  referrer: { color: '#805ad5', bg: '#faf5ff' },
  landing:  { color: '#2b6cb0', bg: '#ebf4ff' },
  browse:   { color: '#319795', bg: '#e6fffa' },
  intent:   { color: '#dd6b20', bg: '#fffaf0' },
  exit:     { color: '#718096', bg: '#f7fafc' },
};

const NODE_COLORS: Record<string, { color: string; bg: string }> = {
  ref_direct:  { color: '#4a5568', bg: '#edf2f7' },
  ref_search:  { color: '#3182ce', bg: '#ebf8ff' },
  ref_social:  { color: '#805ad5', bg: '#faf5ff' },
  ref_email:   { color: '#d69e2e', bg: '#fefcbf' },
  ref_other:   { color: '#a0aec0', bg: '#f7fafc' },
  exit_bounced:   { color: '#a0aec0', bg: '#f7fafc' },
  exit_exited:    { color: '#e53e3e', bg: '#fff5f5' },
  exit_converted: { color: '#38a169', bg: '#f0fff4' },
};

// ─── Internal Types ─────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  type: string;
  label: string;
  count: number;
  color: string;
  bg: string;
  val: number;
  col: number;
  metrics: FlowGraphNode['metrics'];
  fx?: number;
  fy?: number;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  volume: number;
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function getNodeColors(node: FlowGraphNode): { color: string; bg: string } {
  if (NODE_COLORS[node.id]) return NODE_COLORS[node.id];
  return TYPE_COLORS[node.type] || TYPE_COLORS.browse;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function VisitorFlowGraph() {
  const graphRef = useRef<ForceGraphMethods>();
  const containerRef = useRef<HTMLDivElement>(null);
  const savedPositions = useRef<Record<string, { fx: number; fy: number }>>({});

  const [data, setData] = useState<FlowGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeWindow, setTimeWindow] = useState('30d');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 520 });

  // Detail panel state
  const [panelSessions, setPanelSessions] = useState<FlowSessionRecord[]>([]);
  const [panelTotal, setPanelTotal] = useState(0);
  const [panelPage, setPanelPage] = useState(1);
  const [panelLoading, setPanelLoading] = useState(false);

  // ─── Load positions from localStorage ──────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(POSITIONS_KEY);
      if (stored) savedPositions.current = JSON.parse(stored);
    } catch {}
  }, []);

  // ─── Fetch graph data ─────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError('');
    setSelectedNode(null);
    getVisitorFlowGraph(timeWindow)
      .then(res => setData(res.data))
      .catch(err => setError(err?.response?.data?.error || err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [timeWindow]);

  // ─── ResizeObserver ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 100 && height > 100) setDimensions({ width, height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── zoomToFit after data loads ───────────────────────────────────────────
  useEffect(() => {
    if (data && graphRef.current) {
      setTimeout(() => graphRef.current?.zoomToFit(400, 30), 200);
    }
  }, [data]);

  // ─── Build graph data for ForceGraph2D ────────────────────────────────────
  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };

    const maxCount = Math.max(...data.nodes.map(n => n.count), 1);
    const sqrtMax = Math.sqrt(maxCount);

    // Group nodes by column for vertical distribution
    const nodesByCol: Record<number, FlowGraphNode[]> = {};
    for (const n of data.nodes) {
      const col = COLUMN_CONFIG[n.type] ?? 2;
      if (!nodesByCol[col]) nodesByCol[col] = [];
      nodesByCol[col].push(n);
    }

    const nodes: GraphNode[] = data.nodes.map(n => {
      const col = COLUMN_CONFIG[n.type] ?? 2;
      const colors = getNodeColors(n);
      const val = Math.max(1, (Math.sqrt(n.count) / sqrtMax) * 20);

      // Vertical position: distribute evenly within column
      const colNodes = nodesByCol[col] || [n];
      const idx = colNodes.indexOf(n);
      const spacing = dimensions.height / (colNodes.length + 1);

      const saved = savedPositions.current[n.id];
      const fx = saved ? saved.fx : COLUMN_X_PCT[col] * dimensions.width;
      const fy = saved ? saved.fy : spacing * (idx + 1);

      return {
        id: n.id,
        type: n.type,
        label: n.label,
        count: n.count,
        color: colors.color,
        bg: colors.bg,
        val,
        col,
        metrics: n.metrics,
        fx, fy,
        x: fx, y: fy,
      };
    });

    const links: GraphLink[] = data.edges.map(e => ({
      source: e.from,
      target: e.to,
      volume: e.volume,
    }));

    return { nodes, links };
  }, [data, dimensions.width, dimensions.height]);

  // ─── Connected set for hover highlighting ─────────────────────────────────
  const connectedSet = useMemo(() => {
    const highlightId = hoveredNode?.id || selectedNode?.id;
    if (!highlightId || !graphData.links.length) return null;

    const adj = new Map<string, Set<string>>();
    for (const l of graphData.links) {
      const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
      if (!adj.has(s)) adj.set(s, new Set());
      if (!adj.has(t)) adj.set(t, new Set());
      adj.get(s)!.add(t);
      adj.get(t)!.add(s);
    }

    const visited = new Set<string>();
    const queue = [highlightId];
    visited.add(highlightId);
    while (queue.length) {
      const curr = queue.shift()!;
      for (const nb of adj.get(curr) || []) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    }
    return visited;
  }, [hoveredNode, selectedNode, graphData.links]);

  // ─── Max edge volume for scaling ──────────────────────────────────────────
  const maxVolume = useMemo(() => {
    if (!graphData.links.length) return 1;
    return Math.max(...graphData.links.map(l => l.volume), 1);
  }, [graphData.links]);

  // ─── Paint Node ───────────────────────────────────────────────────────────
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n = node as GraphNode;
    if (!n.x || !n.y) return;

    const radius = 12 + n.val * 0.7;
    const fontSize = Math.max(3, Math.min(10, 11 / globalScale));
    const isSelected = selectedNode?.id === n.id;
    const isHovered = hoveredNode?.id === n.id;
    const dimmed = connectedSet && !connectedSet.has(n.id);
    const isZeroCount = n.count === 0;

    ctx.save();

    // Dimming
    if (dimmed) ctx.globalAlpha = 0.12;
    if (isZeroCount && !dimmed) ctx.globalAlpha = 0.10;

    // Hover glow
    if (isHovered && !dimmed) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius + 6, 0, 2 * Math.PI);
      ctx.fillStyle = n.bg;
      ctx.globalAlpha = (dimmed ? 0.12 : 1) * 0.3;
      ctx.fill();
      ctx.globalAlpha = dimmed ? 0.12 : 1;
    }

    // Selection ring
    if (isSelected && !dimmed) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius + 5, 0, 2 * Math.PI);
      ctx.strokeStyle = n.color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Zero-count dashed border
    if (isZeroCount && !dimmed) ctx.globalAlpha = 0.4;

    // Main circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = n.bg;
    ctx.fill();
    ctx.strokeStyle = n.color;
    ctx.lineWidth = isSelected ? 3 : 1.5;
    if (isZeroCount) ctx.setLineDash([3, 3]);
    ctx.stroke();
    if (isZeroCount) ctx.setLineDash([]);

    // Label text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.fillStyle = n.color;
    ctx.fillText(n.label, n.x, n.y - 2);

    // Count text
    ctx.font = `500 ${fontSize * 0.8}px sans-serif`;
    ctx.fillStyle = n.color;
    ctx.fillText(formatCount(n.count), n.x, n.y + fontSize * 0.8);

    // Count badge (top right)
    if (n.count > 0 && !dimmed) {
      const badgeRadius = Math.max(5, fontSize * 0.55);
      const badgeX = n.x + radius * 0.65;
      const badgeY = n.y - radius * 0.65;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = n.color;
      ctx.fill();
      ctx.font = `700 ${badgeRadius * 1.1}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(formatCount(n.count), badgeX, badgeY + 0.5);
    }

    ctx.restore();
  }, [selectedNode, hoveredNode, connectedSet]);

  // ─── Link styling ────────────────────────────────────────────────────────
  const getLinkColor = useCallback((link: any) => {
    const l = link as GraphLink;
    const highlightId = hoveredNode?.id || selectedNode?.id;
    if (!highlightId) return 'rgba(160, 174, 192, 0.35)';
    const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
    const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
    if (s === highlightId || t === highlightId) return 'rgba(43, 108, 176, 0.6)';
    return 'rgba(160, 174, 192, 0.12)';
  }, [hoveredNode, selectedNode]);

  const getLinkWidth = useCallback((link: any) => {
    const l = link as GraphLink;
    return 1 + Math.sqrt(l.volume / maxVolume) * 5;
  }, [maxVolume]);

  const getLinkLabel = useCallback((link: any) => {
    const l = link as GraphLink;
    return `${l.volume.toLocaleString()} sessions`;
  }, []);

  const getParticleCount = useCallback((link: any) => {
    const l = link as GraphLink;
    const ratio = l.volume / maxVolume;
    if (ratio > 0.3) return 3;
    if (ratio > 0.1) return 2;
    return ratio > 0.02 ? 1 : 0;
  }, [maxVolume]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node ? (node as GraphNode) : null);
    if (containerRef.current) {
      containerRef.current.style.cursor = node ? 'pointer' : 'default';
    }
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    const n = node as GraphNode;
    setSelectedNode(prev => prev?.id === n.id ? null : n);
  }, []);

  const handleNodeDrag = useCallback((node: any) => {
    const n = node as GraphNode;
    const zone = ZONE_RANGES[n.type];
    if (zone) {
      const minX = zone[0] * dimensions.width;
      const maxX = zone[1] * dimensions.width;
      if (n.x! < minX) n.x = minX;
      if (n.x! > maxX) n.x = maxX;
    }
    n.fx = n.x;
    n.fy = n.y;
  }, [dimensions.width]);

  const handleNodeDragEnd = useCallback((node: any) => {
    const n = node as GraphNode;
    n.fx = n.x;
    n.fy = n.y;
    savedPositions.current[n.id] = { fx: n.x!, fy: n.y! };
    try {
      localStorage.setItem(POSITIONS_KEY, JSON.stringify(savedPositions.current));
    } catch {}
  }, []);

  const resetLayout = useCallback(() => {
    savedPositions.current = {};
    try { localStorage.removeItem(POSITIONS_KEY); } catch {}
    // Force re-render by toggling time window
    setData(prev => prev ? { ...prev } : null);
  }, []);

  // ─── Fetch sessions when node selected ────────────────────────────────────
  useEffect(() => {
    if (!selectedNode) { setPanelSessions([]); setPanelTotal(0); return; }
    setPanelLoading(true);
    setPanelPage(1);
    getFlowNodeSessions(selectedNode.id, 1, 20)
      .then(res => { setPanelSessions(res.data.sessions); setPanelTotal(res.data.total); })
      .catch(() => {})
      .finally(() => setPanelLoading(false));
  }, [selectedNode?.id]); // eslint-disable-line

  const loadMoreSessions = useCallback(() => {
    if (!selectedNode) return;
    const nextPage = panelPage + 1;
    setPanelLoading(true);
    getFlowNodeSessions(selectedNode.id, nextPage, 20)
      .then(res => {
        setPanelSessions(prev => [...prev, ...res.data.sessions]);
        setPanelPage(nextPage);
      })
      .catch(() => {})
      .finally(() => setPanelLoading(false));
  }, [selectedNode, panelPage]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading navigation flow...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger mx-3 mt-3">
        <strong>Error:</strong> {error}
        <button className="btn btn-sm btn-outline-danger ms-3" onClick={() => setTimeWindow(prev => prev)}>
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="text-center py-5 text-muted">
        <p className="mb-1">No visitor navigation data available yet.</p>
        <small>Data will appear once visitors start browsing the site.</small>
      </div>
    );
  }

  // Incoming/outgoing edges for selected node
  const incomingEdges = selectedNode
    ? data.edges.filter(e => e.to === selectedNode.id).sort((a, b) => b.volume - a.volume)
    : [];
  const outgoingEdges = selectedNode
    ? data.edges.filter(e => e.from === selectedNode.id).sort((a, b) => b.volume - a.volume)
    : [];
  const nodeMap = new Map(data.nodes.map(n => [n.id, n]));

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white d-flex align-items-center justify-content-between py-2 px-3">
        <div className="fw-semibold" style={{ fontSize: '0.85rem' }}>
          Visitor Navigation Flow
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="text-muted" style={{ fontSize: '0.65rem' }}>
            {data.validation.total_sessions.toLocaleString()} sessions &middot;{' '}
            {data.validation.total_visitors.toLocaleString()} visitors &middot;{' '}
            {data.validation.bounce_rate}% bounce
          </span>
          <select
            className="form-select form-select-sm"
            style={{ fontSize: '0.65rem', width: 85, padding: '2px 6px' }}
            value={timeWindow}
            onChange={e => setTimeWindow(e.target.value)}
          >
            <option value="all">All Time</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="90d">90 Days</option>
          </select>
        </div>
      </div>

      <div className="d-flex" style={{ height: 540 }}>
        {/* Graph area */}
        <div
          ref={containerRef}
          style={{ flex: selectedNode ? '1 1 65%' : '1 1 100%', position: 'relative', overflow: 'hidden', transition: 'flex 0.3s' }}
        >
          {/* Column headers */}
          <div style={{ position: 'absolute', top: 4, left: 0, right: 0, zIndex: 5, pointerEvents: 'none' }}>
            {COLUMN_LABELS.map((label, i) => (
              <span
                key={label}
                style={{
                  position: 'absolute',
                  left: `${COLUMN_X_PCT[i] * 100}%`,
                  transform: 'translateX(-50%)',
                  fontSize: '0.6rem',
                  color: '#718096',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                }}
              >
                {label}
              </span>
            ))}
          </div>

          <ForceGraph2D
            ref={graphRef}
            width={dimensions.width * (selectedNode ? 0.65 : 1)}
            height={dimensions.height}
            graphData={graphData}
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              const n = node as GraphNode;
              const radius = 12 + n.val * 0.7;
              ctx.beginPath();
              ctx.arc(n.x!, n.y!, radius + 4, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            linkColor={getLinkColor}
            linkWidth={getLinkWidth}
            linkLabel={getLinkLabel}
            linkDirectionalArrowLength={6}
            linkDirectionalArrowRelPos={0.7}
            linkDirectionalArrowColor={() => 'rgba(160, 174, 192, 0.7)'}
            linkDirectionalParticles={getParticleCount}
            linkDirectionalParticleSpeed={() => 0.006}
            linkDirectionalParticleWidth={() => 2.5}
            linkDirectionalParticleColor={() => 'rgba(43, 108, 176, 0.5)'}
            onNodeHover={handleNodeHover}
            onNodeClick={handleNodeClick}
            onNodeDrag={handleNodeDrag}
            onNodeDragEnd={handleNodeDragEnd}
            cooldownTicks={0}
            enableNodeDrag={true}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            backgroundColor="transparent"
            minZoom={0.3}
            maxZoom={8}
            onRenderFramePre={(ctx: CanvasRenderingContext2D, globalScale: number) => {
              ctx.save();
              ctx.setLineDash([4, 6]);
              ctx.strokeStyle = 'rgba(226, 232, 240, 0.6)';
              ctx.lineWidth = 1 / globalScale;
              const separators = [0.18, 0.38, 0.58, 0.78];
              const w = dimensions.width * (selectedNode ? 0.65 : 1);
              separators.forEach(pct => {
                const x = pct * w;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, dimensions.height);
                ctx.stroke();
              });
              ctx.setLineDash([]);
              ctx.restore();
            }}
          />

          {/* Zoom controls */}
          <div className="d-flex flex-column gap-1" style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 10 }}>
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ width: 26, height: 26, padding: 0, fontSize: '0.85rem', background: 'rgba(255,255,255,0.9)' }}
              onClick={() => graphRef.current?.zoom(Math.min((graphRef.current?.zoom() || 1) * 1.4, 6), 300)}
              title="Zoom in" aria-label="Zoom in"
            >+</button>
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ width: 26, height: 26, padding: 0, fontSize: '0.85rem', background: 'rgba(255,255,255,0.9)' }}
              onClick={() => graphRef.current?.zoom(Math.max((graphRef.current?.zoom() || 1) * 0.7, 0.3), 300)}
              title="Zoom out" aria-label="Zoom out"
            >&minus;</button>
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ width: 26, height: 26, padding: 0, fontSize: '0.6rem', background: 'rgba(255,255,255,0.9)' }}
              onClick={() => graphRef.current?.zoomToFit(400, 30)}
              title="Fit to view" aria-label="Fit to view"
            >&#x27F3;</button>
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ width: 26, height: 26, padding: 0, fontSize: '0.55rem', background: 'rgba(255,255,255,0.9)' }}
              onClick={resetLayout}
              title="Reset node positions" aria-label="Reset node positions"
            >&#x21BA;</button>
          </div>

          {/* Legend */}
          <div className="d-flex gap-3 flex-wrap" style={{ position: 'absolute', bottom: 8, left: 12, zIndex: 5, fontSize: '0.55rem' }}>
            {Object.entries(TYPE_COLORS).map(([type, colors]) => (
              <span key={type} className="d-flex align-items-center gap-1">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.color, display: 'inline-block' }} />
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </span>
            ))}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedNode && (
          <div
            style={{
              flex: '0 0 35%',
              borderLeft: '1px solid #e2e8f0',
              overflow: 'auto',
              background: '#fafbfc',
            }}
          >
            <div className="p-2 border-bottom d-flex align-items-center justify-content-between" style={{ background: '#f7fafc' }}>
              <div>
                <div className="fw-semibold small" style={{ lineHeight: 1.2, color: selectedNode.color }}>
                  {selectedNode.label}
                </div>
                <div className="text-muted" style={{ fontSize: '0.6rem', textTransform: 'capitalize' }}>
                  {selectedNode.type} node
                </div>
              </div>
              <button
                className="btn btn-sm btn-outline-secondary"
                style={{ width: 24, height: 24, padding: 0, fontSize: '0.7rem', lineHeight: 1 }}
                onClick={() => setSelectedNode(null)}
                aria-label="Close details"
              >&times;</button>
            </div>

            <div className="p-3">
              {/* KPI strip */}
              <div className="d-flex gap-2 mb-3">
                <div className="text-center flex-fill p-2 rounded" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div className="fw-bold" style={{ fontSize: '1.2rem', color: selectedNode.color }}>{selectedNode.count.toLocaleString()}</div>
                  <div className="text-muted" style={{ fontSize: '0.6rem' }}>Sessions</div>
                </div>
                <div className="text-center flex-fill p-2 rounded" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div className="fw-bold" style={{ fontSize: '1.2rem', color: '#2b6cb0' }}>
                    {selectedNode.metrics.unique_visitors?.toLocaleString() || 0}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.6rem' }}>Visitors</div>
                </div>
                <div className="text-center flex-fill p-2 rounded" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div className="fw-bold" style={{ fontSize: '1.2rem', color: '#319795' }}>
                    {formatDuration(selectedNode.metrics.avg_duration || 0)}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.6rem' }}>Avg Duration</div>
                </div>
              </div>

              {selectedNode.metrics.bounce_rate !== undefined && (
                <div className="mb-3 p-2 rounded" style={{ background: '#fff', border: '1px solid #e2e8f0', fontSize: '0.7rem' }}>
                  <span className="text-muted">Bounce Rate:</span>{' '}
                  <strong>{selectedNode.metrics.bounce_rate}%</strong>
                </div>
              )}

              {/* Flow edges */}
              {incomingEdges.length > 0 && (
                <div className="mb-3">
                  <div className="fw-semibold mb-1" style={{ fontSize: '0.7rem', color: '#4a5568' }}>
                    Incoming ({incomingEdges.length})
                  </div>
                  {incomingEdges.slice(0, 8).map(e => {
                    const srcNode = nodeMap.get(e.from);
                    return (
                      <div key={e.from} className="d-flex justify-content-between mb-1" style={{ fontSize: '0.65rem' }}>
                        <span className="text-muted">{srcNode?.label || e.from}</span>
                        <span className="fw-semibold">{e.volume.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {outgoingEdges.length > 0 && (
                <div className="mb-3">
                  <div className="fw-semibold mb-1" style={{ fontSize: '0.7rem', color: '#4a5568' }}>
                    Outgoing ({outgoingEdges.length})
                  </div>
                  {outgoingEdges.slice(0, 8).map(e => {
                    const tgtNode = nodeMap.get(e.to);
                    return (
                      <div key={e.to} className="d-flex justify-content-between mb-1" style={{ fontSize: '0.65rem' }}>
                        <span className="text-muted">{tgtNode?.label || e.to}</span>
                        <span className="fw-semibold">{e.volume.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Sessions list */}
              <div className="fw-semibold mb-2" style={{ fontSize: '0.7rem', color: '#4a5568' }}>
                Sessions ({panelTotal.toLocaleString()})
              </div>

              {panelLoading && panelSessions.length === 0 && (
                <div className="text-center py-3">
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Loading sessions...</span>
                  </div>
                </div>
              )}

              {panelSessions.map(s => (
                <div
                  key={s.session_id}
                  className="mb-2 p-2 rounded"
                  style={{ background: '#fff', border: '1px solid #e2e8f0', fontSize: '0.65rem' }}
                >
                  <div className="d-flex justify-content-between mb-1">
                    <span className="fw-semibold" style={{ color: '#2b6cb0' }}>
                      {s.lead_name || `Visitor ${s.visitor_fingerprint.slice(0, 8)}`}
                    </span>
                    <span className="text-muted">{formatDuration(s.duration_seconds)}</span>
                  </div>
                  <div className="d-flex justify-content-between text-muted" style={{ fontSize: '0.58rem' }}>
                    <span>{s.pageview_count} pages</span>
                    <span>{s.device_type || 'unknown'}</span>
                    <span>{new Date(s.started_at).toLocaleDateString()}</span>
                  </div>
                  {s.pages.length > 0 && (
                    <div className="mt-1" style={{ fontSize: '0.55rem', color: '#718096' }}>
                      {s.pages.slice(0, 6).join(' → ')}
                      {s.pages.length > 6 && ` → +${s.pages.length - 6} more`}
                    </div>
                  )}
                  {s.is_bounce && (
                    <span className="badge bg-secondary mt-1" style={{ fontSize: '0.5rem' }}>Bounce</span>
                  )}
                </div>
              ))}

              {panelSessions.length < panelTotal && (
                <button
                  className="btn btn-sm btn-outline-primary w-100 mt-2"
                  style={{ fontSize: '0.65rem' }}
                  onClick={loadMoreSessions}
                  disabled={panelLoading}
                >
                  {panelLoading ? 'Loading...' : `Load more (${panelSessions.length}/${panelTotal})`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
