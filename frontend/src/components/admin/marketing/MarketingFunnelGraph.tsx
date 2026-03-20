import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import {
  getMarketingFunnelGraph,
  getFunnelNodeLeads,
  FunnelGraphData,
  FunnelGraphNode,
  FunnelLeadRecord,
} from '../../../services/intelligenceApi';

// ─── Layout Constants ──────────────────────────────────────────────────────────

const COLUMN_CONFIG: Record<string, number> = {
  channel: 0, campaign: 1, engagement: 2, conversion: 3, outcome: 4,
};
const COLUMN_X_PCT = [0.06, 0.26, 0.48, 0.70, 0.92];
const COLUMN_LABELS = ['Channel', 'Campaign', 'Engagement', 'Conversion', 'Outcome'];

const ZONE_RANGES: Record<string, [number, number]> = {
  channel:    [0, 0.16],
  campaign:   [0.16, 0.37],
  engagement: [0.37, 0.59],
  conversion: [0.59, 0.80],
  outcome:    [0.80, 1.0],
};

const POSITIONS_KEY = 'marketing-funnel-graph-positions-v1';

// ─── Colors ─────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  channel:    { color: '#805ad5', bg: '#faf5ff' },
  campaign:   { color: '#2b6cb0', bg: '#ebf4ff' },
  engagement: { color: '#dd6b20', bg: '#fffaf0' },
  conversion: { color: '#319795', bg: '#e6fffa' },
  outcome:    { color: '#38a169', bg: '#f0fff4' },
};

const NODE_COLORS: Record<string, { color: string; bg: string }> = {
  ch_email:       { color: '#d69e2e', bg: '#fefcbf' },
  ch_sms:         { color: '#38a169', bg: '#f0fff4' },
  ch_social:      { color: '#805ad5', bg: '#faf5ff' },
  ch_paid_search: { color: '#3182ce', bg: '#ebf8ff' },
  ch_paid_social: { color: '#6b46c1', bg: '#e9d8fd' },
  ch_referral:    { color: '#dd6b20', bg: '#fffaf0' },
  ch_organic:     { color: '#319795', bg: '#e6fffa' },
  ch_direct_mail: { color: '#4a5568', bg: '#edf2f7' },
  ch_unknown:     { color: '#a0aec0', bg: '#f7fafc' },
  eng_responded:  { color: '#38a169', bg: '#f0fff4' },
  eng_contacted:  { color: '#2b6cb0', bg: '#ebf4ff' },
  eng_pending:    { color: '#a0aec0', bg: '#f7fafc' },
  eng_bounced:    { color: '#e53e3e', bg: '#fff5f5' },
  eng_ignored:    { color: '#718096', bg: '#edf2f7' },
  conv_strategy_call: { color: '#38a169', bg: '#f0fff4' },
  conv_qualified:     { color: '#2b6cb0', bg: '#ebf4ff' },
  conv_nurturing:     { color: '#dd6b20', bg: '#fffaf0' },
  conv_no_response:   { color: '#a0aec0', bg: '#f7fafc' },
  out_enrolled:   { color: '#38a169', bg: '#f0fff4' },
  out_active:     { color: '#2b6cb0', bg: '#ebf4ff' },
  out_dropped:    { color: '#e53e3e', bg: '#fff5f5' },
  out_inactive:   { color: '#a0aec0', bg: '#f7fafc' },
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
  metrics: FunnelGraphNode['metrics'];
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

function getNodeColors(node: FunnelGraphNode): { color: string; bg: string } {
  if (NODE_COLORS[node.id]) return NODE_COLORS[node.id];
  return TYPE_COLORS[node.type] || TYPE_COLORS.campaign;
}

const PIPELINE_BADGE: Record<string, string> = {
  new_lead: 'secondary',
  contacted: 'info',
  meeting_scheduled: 'primary',
  proposal_sent: 'warning',
  negotiation: 'warning',
  enrolled: 'success',
  lost: 'danger',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function MarketingFunnelGraph() {
  const graphRef = useRef<ForceGraphMethods>();
  const containerRef = useRef<HTMLDivElement>(null);
  const savedPositions = useRef<Record<string, { fx: number; fy: number }>>({});

  const [data, setData] = useState<FunnelGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeWindow, setTimeWindow] = useState('30d');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 520 });

  // Detail panel state
  const [panelLeads, setPanelLeads] = useState<FunnelLeadRecord[]>([]);
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
    getMarketingFunnelGraph(timeWindow)
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

    const nodesByCol: Record<number, FunnelGraphNode[]> = {};
    for (const n of data.nodes) {
      const col = COLUMN_CONFIG[n.type] ?? 2;
      if (!nodesByCol[col]) nodesByCol[col] = [];
      nodesByCol[col].push(n);
    }

    const nodes: GraphNode[] = data.nodes.map(n => {
      const col = COLUMN_CONFIG[n.type] ?? 2;
      const colors = getNodeColors(n);
      const val = Math.max(1, (Math.sqrt(n.count) / sqrtMax) * 20);

      const colNodes = nodesByCol[col] || [n];
      const idx = colNodes.indexOf(n);
      const spacing = dimensions.height / (colNodes.length + 1);

      const saved = savedPositions.current[n.id];
      const fx = saved ? saved.fx : COLUMN_X_PCT[col] * dimensions.width;
      const fy = saved ? saved.fy : spacing * (idx + 1);

      return {
        id: n.id, type: n.type, label: n.label, count: n.count,
        color: colors.color, bg: colors.bg, val, col, metrics: n.metrics,
        fx, fy, x: fx, y: fy,
      };
    });

    const links: GraphLink[] = data.edges.map(e => ({
      source: e.from, target: e.to, volume: e.volume,
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
    if (dimmed) ctx.globalAlpha = 0.12;
    if (isZeroCount && !dimmed) ctx.globalAlpha = 0.10;

    if (isHovered && !dimmed) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius + 6, 0, 2 * Math.PI);
      ctx.fillStyle = n.bg;
      ctx.globalAlpha = (dimmed ? 0.12 : 1) * 0.3;
      ctx.fill();
      ctx.globalAlpha = dimmed ? 0.12 : 1;
    }

    if (isSelected && !dimmed) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius + 5, 0, 2 * Math.PI);
      ctx.strokeStyle = n.color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (isZeroCount && !dimmed) ctx.globalAlpha = 0.4;

    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = n.bg;
    ctx.fill();
    ctx.strokeStyle = n.color;
    ctx.lineWidth = isSelected ? 3 : 1.5;
    if (isZeroCount) ctx.setLineDash([3, 3]);
    ctx.stroke();
    if (isZeroCount) ctx.setLineDash([]);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.fillStyle = n.color;
    ctx.fillText(n.label, n.x, n.y - 2);

    ctx.font = `500 ${fontSize * 0.8}px sans-serif`;
    ctx.fillStyle = n.color;
    ctx.fillText(formatCount(n.count), n.x, n.y + fontSize * 0.8);

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
    return `${l.volume.toLocaleString()} leads`;
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
    if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'default';
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
    try { localStorage.setItem(POSITIONS_KEY, JSON.stringify(savedPositions.current)); } catch {}
  }, []);

  const resetLayout = useCallback(() => {
    savedPositions.current = {};
    try { localStorage.removeItem(POSITIONS_KEY); } catch {}
    setData(prev => prev ? { ...prev } : null);
  }, []);

  // ─── Fetch leads when node selected ────────────────────────────────────
  useEffect(() => {
    if (!selectedNode) { setPanelLeads([]); setPanelTotal(0); return; }
    setPanelLoading(true);
    setPanelPage(1);
    getFunnelNodeLeads(selectedNode.id, 1, 20, timeWindow)
      .then(res => { setPanelLeads(res.data.leads); setPanelTotal(res.data.total); })
      .catch(() => {})
      .finally(() => setPanelLoading(false));
  }, [selectedNode?.id, timeWindow]); // eslint-disable-line

  const loadMoreLeads = useCallback(() => {
    if (!selectedNode) return;
    const nextPage = panelPage + 1;
    setPanelLoading(true);
    getFunnelNodeLeads(selectedNode.id, nextPage, 20, timeWindow)
      .then(res => {
        setPanelLeads(prev => [...prev, ...res.data.leads]);
        setPanelPage(nextPage);
      })
      .catch(() => {})
      .finally(() => setPanelLoading(false));
  }, [selectedNode, panelPage, timeWindow]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading marketing funnel...</span>
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
        <p className="mb-1">No marketing funnel data available yet.</p>
        <small>Data will appear once campaigns have enrolled leads.</small>
      </div>
    );
  }

  const incomingEdges = selectedNode
    ? data.edges.filter(e => e.to === selectedNode.id).sort((a, b) => b.volume - a.volume)
    : [];
  const outgoingEdges = selectedNode
    ? data.edges.filter(e => e.from === selectedNode.id).sort((a, b) => b.volume - a.volume)
    : [];
  const nodeMap = new Map(data.nodes.map(n => [n.id, n]));

  const separatorPcts = [0.16, 0.37, 0.59, 0.80];

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white d-flex align-items-center justify-content-between py-2 px-3">
        <div className="fw-semibold" style={{ fontSize: '0.85rem' }}>
          Marketing Funnel
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="text-muted" style={{ fontSize: '0.65rem' }}>
            {data.validation.total_leads.toLocaleString()} leads &middot;{' '}
            {data.validation.total_campaigns.toLocaleString()} campaigns &middot;{' '}
            {data.validation.leads_enrolled.toLocaleString()} enrolled
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
              const w = dimensions.width * (selectedNode ? 0.65 : 1);
              separatorPcts.forEach(pct => {
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
                  <div className="fw-bold" style={{ fontSize: '1.2rem', color: selectedNode.color }}>
                    {selectedNode.count.toLocaleString()}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.6rem' }}>Leads</div>
                </div>
                <div className="text-center flex-fill p-2 rounded" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div className="fw-bold" style={{ fontSize: '1.2rem', color: '#2b6cb0' }}>
                    {selectedNode.metrics.avg_lead_score || 0}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.6rem' }}>Avg Score</div>
                </div>
                <div className="text-center flex-fill p-2 rounded" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div className="fw-bold" style={{ fontSize: '1.2rem', color: '#319795' }}>
                    {selectedNode.metrics.pct_of_total || 0}%
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.6rem' }}>of Total</div>
                </div>
              </div>

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

              {/* Leads list */}
              <div className="fw-semibold mb-2" style={{ fontSize: '0.7rem', color: '#4a5568' }}>
                Leads ({panelTotal.toLocaleString()})
              </div>

              {panelLoading && panelLeads.length === 0 && (
                <div className="text-center py-3">
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Loading leads...</span>
                  </div>
                </div>
              )}

              {panelLeads.map((lead, idx) => (
                <div
                  key={`${lead.lead_id}-${idx}`}
                  className="mb-2 p-2 rounded"
                  style={{ background: '#fff', border: '1px solid #e2e8f0', fontSize: '0.65rem' }}
                >
                  <div className="d-flex justify-content-between mb-1">
                    <span className="fw-semibold" style={{ color: '#2b6cb0' }}>
                      {lead.name}
                    </span>
                    <span className={`badge bg-${PIPELINE_BADGE[lead.pipeline_stage] || 'secondary'}`} style={{ fontSize: '0.5rem' }}>
                      {lead.pipeline_stage.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.58rem' }}>
                    {lead.email}
                  </div>
                  <div className="d-flex justify-content-between text-muted mt-1" style={{ fontSize: '0.58rem' }}>
                    <span>Score: {lead.lead_score}</span>
                    <span>{lead.touchpoint_count} touches</span>
                    <span>{lead.response_count} responses</span>
                  </div>
                  <div className="d-flex justify-content-between mt-1" style={{ fontSize: '0.55rem' }}>
                    <span className="text-muted">{lead.campaign_name}</span>
                    {lead.enrolled_at && (
                      <span className="text-muted">{new Date(lead.enrolled_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              ))}

              {panelLeads.length < panelTotal && (
                <button
                  className="btn btn-sm btn-outline-primary w-100 mt-2"
                  style={{ fontSize: '0.65rem' }}
                  onClick={loadMoreLeads}
                  disabled={panelLoading}
                >
                  {panelLoading ? 'Loading...' : `Load more (${panelLeads.length}/${panelTotal})`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
