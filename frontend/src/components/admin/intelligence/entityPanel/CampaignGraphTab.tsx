import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { forceX, forceY } from 'd3-force';
import { getCampaignGraph, CampaignGraphData, CampaignGraphNode } from '../../../../services/intelligenceApi';
import CampaignNodeDetailsPanel from '../CampaignNodeDetailsPanel';

// Color map by node type
const NODE_COLORS: Record<string, { color: string; bg: string }> = {
  entry_point: { color: '#319795', bg: '#e6fffa' },
  campaign:    { color: '#2b6cb0', bg: '#ebf4ff' },
  lead_pool:   { color: '#1a365d', bg: '#e2e8f0' },
  conversion:  { color: '#38a169', bg: '#f0fff4' },
};

// Hierarchy level for vertical positioning
const TYPE_LEVEL: Record<string, number> = {
  entry_point: 0,
  lead_pool: 1,
  campaign: 2,
  conversion: 3,
};

interface GraphNode {
  id: string;
  type: string;
  label: string;
  count: number;
  color: string;
  bg: string;
  val: number;
  level: number;
  metrics: CampaignGraphNode['metrics'];
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
  volume: number;
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function CampaignGraphTab() {
  const graphRef = useRef<ForceGraphMethods>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 380, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [data, setData] = useState<CampaignGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch graph data once
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCampaignGraph()
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width: Math.max(width, 200), height: Math.max(height, 200) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Build graph data
  const graphData = useMemo(() => {
    if (!data) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
    const maxCount = Math.max(...data.nodes.map((n) => n.count), 1);

    const nodes: GraphNode[] = data.nodes.map((n) => {
      const colors = NODE_COLORS[n.type] || NODE_COLORS.lead_pool;
      return {
        id: n.id,
        type: n.type,
        label: n.label,
        count: n.count,
        color: colors.color,
        bg: colors.bg,
        val: 8 + (n.count / maxCount) * 22,
        level: TYPE_LEVEL[n.type] ?? 2,
        metrics: n.metrics,
      };
    });

    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: GraphLink[] = data.edges
      .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
      .map((e) => ({
        source: e.from,
        target: e.to,
        label: e.label,
        volume: e.volume || 0,
      }));

    return { nodes, links };
  }, [data]);

  // Configure forces
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg || !graphData.nodes.length) return;

    fg.d3Force('charge')?.strength(-250);
    fg.d3Force('link')?.distance(70);

    const maxLevel = Math.max(...graphData.nodes.map((n) => n.level));
    fg.d3Force(
      'y',
      forceY((node: any) => {
        const normalizedLevel = (node.level ?? 0) / Math.max(maxLevel, 1);
        return -dimensions.height * 0.25 + normalizedLevel * dimensions.height * 0.55;
      }).strength(0.5)
    );
    fg.d3Force('x', forceX(0).strength(0.1));
    fg.d3ReheatSimulation();
  }, [graphData, dimensions.height]);

  // Zoom to fit
  useEffect(() => {
    const timer = setTimeout(() => { graphRef.current?.zoomToFit(400, 15); }, 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { graphRef.current?.zoomToFit(400, 20); }, 300);
    return () => clearTimeout(timer);
  }, [dimensions]);

  // Node rendering
  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const radius = 16 + n.val * 0.6;
      const isHovered = hoveredNode?.id === n.id;
      const isSelected = selectedNode?.id === n.id;
      const fontSize = Math.max(11 / globalScale, 3);
      const isHighActivity = n.count > 50;

      // High-activity glow
      if (isHighActivity && !isHovered) {
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, radius + 5, 0, 2 * Math.PI);
        ctx.fillStyle = n.bg;
        ctx.globalAlpha = 0.4;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, radius + 6, 0, 2 * Math.PI);
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Hover glow
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, radius + 4, 0, 2 * Math.PI);
        ctx.fillStyle = n.bg;
        ctx.fill();
      }

      // Main circle
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, radius, 0, 2 * Math.PI);
      ctx.fillStyle = n.bg;
      ctx.fill();
      ctx.strokeStyle = n.color;
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.stroke();

      // Label
      ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = n.color;
      ctx.fillText(n.label, n.x!, n.y! - 2);

      // Count below label
      const smallFont = Math.max(7 / globalScale, 2);
      ctx.font = `${smallFont}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillStyle = '#718096';
      ctx.fillText(formatCount(n.count), n.x!, n.y! + fontSize * 0.8);

      // Count badge
      const badgeRadius = Math.max(6 / globalScale, 2.5);
      const badgeX = n.x! + radius * 0.7;
      const badgeY = n.y! - radius * 0.7;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = n.color;
      ctx.fill();
      ctx.font = `bold ${Math.max(6 / globalScale, 2)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(formatCount(n.count), badgeX, badgeY + 0.5);
    },
    [hoveredNode, selectedNode]
  );

  // Link rendering — thickness by volume, with arrow
  const maxVolume = useMemo(() => Math.max(...graphData.links.map((l) => l.volume), 1), [graphData.links]);

  const paintLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const src = link.source as GraphNode;
      const tgt = link.target as GraphNode;
      if (!src.x || !tgt.x) return;

      const volume = (link as GraphLink).volume || 0;
      const thickness = 0.8 + (volume / maxVolume) * 3;

      // Line
      ctx.beginPath();
      ctx.moveTo(src.x!, src.y!);
      ctx.lineTo(tgt.x!, tgt.y!);
      ctx.strokeStyle = `rgba(160, 174, 192, ${0.3 + (volume / maxVolume) * 0.5})`;
      ctx.lineWidth = thickness / globalScale;
      ctx.stroke();

      // Arrow at 70% of the way
      const arrowPos = 0.7;
      const ax = src.x! + (tgt.x! - src.x!) * arrowPos;
      const ay = src.y! + (tgt.y! - src.y!) * arrowPos;
      const angle = Math.atan2(tgt.y! - src.y!, tgt.x! - src.x!);
      const arrowLen = Math.max(5 / globalScale, 2);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - arrowLen * Math.cos(angle - 0.4), ay - arrowLen * Math.sin(angle - 0.4));
      ctx.lineTo(ax - arrowLen * Math.cos(angle + 0.4), ay - arrowLen * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = 'rgba(160, 174, 192, 0.7)';
      ctx.fill();

      // Volume label at midpoint
      if (volume > 0) {
        const midX = (src.x! + tgt.x!) / 2;
        const midY = (src.y! + tgt.y!) / 2;
        const labelSize = Math.max(7 / globalScale, 2);
        ctx.font = `${labelSize}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(113, 128, 150, 0.75)';
        ctx.fillText((link as GraphLink).label, midX, midY - 3 / globalScale);
      }
    },
    [maxVolume]
  );

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node as GraphNode | null);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node as GraphNode);
  }, []);

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100 text-muted">
        <div className="spinner-border spinner-border-sm me-2" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <small>Loading campaign graph...</small>
      </div>
    );
  }

  if (error) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100 text-muted">
        <small className="text-danger">{error}</small>
      </div>
    );
  }

  // If a node is selected, show drill-down panel
  if (selectedNode) {
    return (
      <CampaignNodeDetailsPanel
        node={{
          id: selectedNode.id,
          type: selectedNode.type as CampaignGraphNode['type'],
          label: selectedNode.label,
          count: selectedNode.count,
          metrics: selectedNode.metrics,
        }}
        onClose={() => setSelectedNode(null)}
      />
    );
  }

  return (
    <div className="d-flex flex-column h-100">
      <div className="p-2 border-bottom">
        <div className="d-flex justify-content-between align-items-center">
          <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
            Campaign Intelligence
          </span>
          <span className="text-muted" style={{ fontSize: '0.65rem' }}>
            {graphData.nodes.length} nodes / {graphData.links.length} edges
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-grow-1"
        style={{ position: 'relative', minHeight: 0 }}
        onMouseMove={handleMouseMove}
        aria-label="Campaign intelligence graph — interactive. Click nodes for details."
      >
        <ForceGraph2D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node: any, color, ctx) => {
            const n = node as GraphNode;
            const radius = 16 + n.val * 0.6;
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius + 4, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          linkCanvasObject={paintLink}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
          cooldownTicks={150}
          warmupTicks={30}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePanInteraction={true}
          backgroundColor="transparent"
          minZoom={0.3}
          maxZoom={8}
        />

        {/* Zoom controls */}
        <div
          className="d-flex flex-column gap-1"
          style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 10 }}
        >
          <button
            className="btn btn-sm btn-outline-secondary"
            style={{ width: 26, height: 26, padding: 0, fontSize: '0.85rem', background: 'rgba(255,255,255,0.9)' }}
            onClick={() => { const fg = graphRef.current; if (fg) fg.zoom(Math.min(fg.zoom() * 1.4, 6), 300); }}
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            style={{ width: 26, height: 26, padding: 0, fontSize: '0.85rem', background: 'rgba(255,255,255,0.9)' }}
            onClick={() => { const fg = graphRef.current; if (fg) fg.zoom(Math.max(fg.zoom() * 0.7, 0.3), 300); }}
            title="Zoom out"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            style={{ width: 26, height: 26, padding: 0, fontSize: '0.6rem', background: 'rgba(255,255,255,0.9)' }}
            onClick={() => graphRef.current?.zoomToFit(400, 10)}
            title="Reset view"
            aria-label="Reset view"
          >
            ⟳
          </button>
        </div>

        {/* Legend */}
        <div
          className="d-flex gap-2 flex-wrap align-items-center px-2 py-1"
          style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 10, fontSize: '0.6rem', background: 'rgba(255,255,255,0.9)', borderRadius: 4 }}
        >
          {Object.entries(NODE_COLORS).map(([type, c]) => (
            <span key={type} className="d-flex align-items-center gap-1">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, display: 'inline-block' }} />
              {type.replace('_', ' ')}
            </span>
          ))}
        </div>

        {/* Hover tooltip */}
        {hoveredNode && !selectedNode && (
          <div
            style={{
              position: 'fixed',
              left: mousePos.x + 12,
              top: mousePos.y - 10,
              zIndex: 1000,
              pointerEvents: 'none',
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: '8px 12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              fontSize: '0.72rem',
              maxWidth: 220,
            }}
          >
            <div className="d-flex align-items-center gap-2 mb-1">
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: hoveredNode.color, display: 'inline-block' }} />
              <strong>{hoveredNode.label}</strong>
            </div>
            <div className="text-muted">Count: {hoveredNode.count.toLocaleString()}</div>
            {hoveredNode.metrics.conversion_rate !== undefined && (
              <div className="text-muted">Conversion: {hoveredNode.metrics.conversion_rate}%</div>
            )}
            {hoveredNode.metrics.messages_sent !== undefined && (
              <div className="text-muted">Messages: {hoveredNode.metrics.messages_sent.toLocaleString()}</div>
            )}
            {hoveredNode.metrics.active_users !== undefined && (
              <div className="text-muted">Active: {hoveredNode.metrics.active_users.toLocaleString()}</div>
            )}
            <div className="text-muted mt-1" style={{ fontSize: '0.6rem' }}>Click for details</div>
          </div>
        )}
      </div>
    </div>
  );
}
