import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { useIntelligenceContext } from '../../../../contexts/IntelligenceContext';
import {
  triggerDiscovery,
  EntityNetwork,
  EntityNode,
} from '../../../../services/intelligenceApi';

const MAX_GRAPH_NODES = 120;

interface SchemaGraphNode {
  id: string;
  label: string;
  row_count: number;
  column_count: number;
  is_hub: boolean;
  x?: number;
  y?: number;
}

function SchemaForceGraph({
  nodes,
  edges,
  onNodeClick,
}: {
  nodes: EntityNode[];
  edges: { source: string; target: string; type?: string; confidence?: number }[];
  onNodeClick: (node: EntityNode) => void;
}) {
  const graphRef = useRef<ForceGraphMethods>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 500 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width: Math.max(width, 200), height: Math.max(height, 200) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const graphNodes: SchemaGraphNode[] = nodes.map((n) => ({
      id: n.id,
      label: n.label,
      row_count: n.row_count,
      column_count: n.column_count,
      is_hub: n.is_hub,
    }));
    const nodeIds = new Set(graphNodes.map((n) => n.id));
    const graphEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
    return { nodes: graphNodes, links: graphEdges };
  }, [nodes, edges]);

  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength(-120);
    fg.d3Force('link')?.distance(55);
    (fg as any).d3AlphaDecay?.(0.02);
    (fg as any).d3VelocityDecay?.(0.3);
  }, [graphData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      graphRef.current?.zoomToFit(400, 20);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  const maxRows = Math.max(...nodes.map((n) => n.row_count), 1);

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as SchemaGraphNode;
      const baseR = n.is_hub ? 12 : 4 + (n.row_count / maxRows) * 8;
      const isHovered = hoveredId === n.id;

      if (isHovered) {
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, baseR + 3, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(26, 54, 93, 0.1)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x!, n.y!, baseR, 0, 2 * Math.PI);
      ctx.fillStyle = n.is_hub ? 'var(--color-primary)' : '#a0aec0';
      ctx.fill();
      ctx.strokeStyle = n.is_hub ? 'var(--color-primary)' : '#cbd5e0';
      ctx.lineWidth = n.is_hub ? 1.5 : 0.5;
      ctx.stroke();

      if (n.is_hub || globalScale > 2) {
        const fontSize = Math.max(7 / globalScale, 2);
        ctx.font = `${n.is_hub ? 'bold' : ''} ${fontSize}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = n.is_hub ? '#1a365d' : '#2d3748';
        ctx.fillText(n.label, n.x!, n.y! + baseR + 2 / globalScale);
      }
    },
    [hoveredId, maxRows]
  );

  const paintLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const src = link.source as SchemaGraphNode;
      const tgt = link.target as SchemaGraphNode;
      if (!src.x || !tgt.x) return;

      ctx.beginPath();
      ctx.moveTo(src.x!, src.y!);
      ctx.lineTo(tgt.x!, tgt.y!);
      ctx.strokeStyle = 'rgba(160, 174, 192, 0.4)';
      ctx.lineWidth = 0.8 / globalScale;
      ctx.stroke();

      // Show relationship type label at midpoint when zoomed in
      if (globalScale > 1.5 && link.type) {
        const midX = (src.x! + tgt.x!) / 2;
        const midY = (src.y! + tgt.y!) / 2;
        const fontSize = Math.max(6 / globalScale, 2);
        ctx.font = `${fontSize}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(113, 128, 150, 0.7)';
        ctx.fillText(link.type, midX, midY - 2 / globalScale);
      }
    },
    []
  );

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ForceGraph2D
        ref={graphRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          const n = node as SchemaGraphNode;
          const r = n.is_hub ? 12 : 5 + (n.row_count / maxRows) * 6;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r + 3, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkCanvasObject={paintLink}
        onNodeHover={(node: any) => setHoveredId(node?.id ?? null)}
        onNodeClick={(node: any) => {
          const n = nodes.find((nd) => nd.id === (node as SchemaGraphNode).id);
          if (n) onNodeClick(n);
        }}
        cooldownTicks={120}
        warmupTicks={20}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        backgroundColor="transparent"
        minZoom={0.3}
        maxZoom={10}
      />

      {/* Zoom controls */}
      <div
        className="d-flex flex-column gap-1"
        style={{ position: 'absolute', bottom: 6, right: 6, zIndex: 10 }}
      >
        <button
          className="btn btn-sm btn-outline-secondary"
          style={{ width: 24, height: 24, padding: 0, fontSize: '0.8rem', background: 'rgba(255,255,255,0.9)' }}
          onClick={() => { const fg = graphRef.current; if (fg) fg.zoom(Math.min(fg.zoom() * 1.4, 10), 300); }}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          className="btn btn-sm btn-outline-secondary"
          style={{ width: 24, height: 24, padding: 0, fontSize: '0.8rem', background: 'rgba(255,255,255,0.9)' }}
          onClick={() => { const fg = graphRef.current; if (fg) fg.zoom(Math.max(fg.zoom() * 0.7, 0.3), 300); }}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          className="btn btn-sm btn-outline-secondary"
          style={{ width: 24, height: 24, padding: 0, fontSize: '0.55rem', background: 'rgba(255,255,255,0.9)' }}
          onClick={() => graphRef.current?.zoomToFit(400, 20)}
          aria-label="Reset view"
        >
          ⟳
        </button>
      </div>

      {/* Tooltip */}
      {hoveredId && (() => {
        const n = nodes.find((nd) => nd.id === hoveredId);
        if (!n) return null;
        return (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              zIndex: 20,
              background: 'rgba(255,255,255,0.95)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: '0.68rem',
              pointerEvents: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              maxWidth: 200,
            }}
          >
            <div className="fw-semibold" style={{ color: n.is_hub ? '#1a365d' : '#2d3748' }}>
              {n.label}
              {n.is_hub && <span className="badge bg-warning text-dark ms-1" style={{ fontSize: '0.55rem' }}>HUB</span>}
            </div>
            <div className="text-muted">{n.row_count.toLocaleString()} rows &middot; {n.column_count} cols</div>
          </div>
        );
      })()}
    </div>
  );
}

interface Props {
  network: EntityNetwork | null;
  onRefresh: () => void;
}

export default function SchemaExplorerTab({ network, onRefresh }: Props) {
  const { drillDown } = useIntelligenceContext();
  const [search, setSearch] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');

  const handleDiscovery = async () => {
    setDiscovering(true);
    try {
      await triggerDiscovery();
      onRefresh();
    } catch {
      // silent
    } finally {
      setDiscovering(false);
    }
  };

  const handleNodeClick = useCallback(
    (node: EntityNode) => {
      drillDown(node.is_hub ? 'hub' : 'table', node.id, node.label);
    },
    [drillDown]
  );

  const filteredNodes = useMemo(() => {
    if (!network?.nodes) return [];
    if (!search.trim()) return network.nodes;
    const q = search.toLowerCase();
    return network.nodes.filter((n) => n.label.toLowerCase().includes(q));
  }, [network, search]);

  if (!network || !network.nodes.length) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted p-3">
        <small className="mb-3 text-center">Run discovery to populate the schema</small>
        <button
          className="btn btn-sm btn-primary"
          onClick={handleDiscovery}
          disabled={discovering}
        >
          {discovering ? 'Discovering...' : 'Run Discovery'}
        </button>
      </div>
    );
  }

  const useGraph = viewMode === 'graph' && network.nodes.length <= MAX_GRAPH_NODES && !search;

  return (
    <div className="d-flex flex-column h-100">
      <div className="p-2 border-bottom">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
            {filteredNodes.length} tables
          </span>
          <div className="d-flex gap-1">
            <button
              className={`btn btn-sm ${viewMode === 'graph' ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: '0.6rem', padding: '1px 6px' }}
              onClick={() => setViewMode('graph')}
              title="Graph view"
            >
              Graph
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: '0.6rem', padding: '1px 6px' }}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              List
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ fontSize: '0.6rem', padding: '1px 6px' }}
              onClick={handleDiscovery}
              disabled={discovering}
              title="Refresh"
            >
              {discovering ? '...' : '\u21BB'}
            </button>
          </div>
        </div>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Search tables..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex-grow-1" style={{ overflowY: useGraph ? 'hidden' : 'auto', minHeight: 0 }}>
        {useGraph ? (
          <SchemaForceGraph
            nodes={network.nodes}
            edges={network.edges}
            onNodeClick={handleNodeClick}
          />
        ) : (
          <div className="p-2">
            {filteredNodes.map((node) => (
              <div
                key={node.id}
                className="intel-card-float mb-2"
                style={{
                  cursor: 'pointer',
                  borderLeft: node.is_hub
                    ? '3px solid var(--color-primary)'
                    : '3px solid var(--color-border)',
                }}
                onClick={() => handleNodeClick(node)}
              >
                <div className="card-body p-2">
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="fw-medium small">{node.label}</span>
                    {node.is_hub && (
                      <span className="badge bg-warning text-dark" style={{ fontSize: '0.6rem' }}>HUB</span>
                    )}
                  </div>
                  <div className="d-flex gap-2 mt-1">
                    <small className="text-muted">{node.row_count.toLocaleString()} rows</small>
                    <small className="text-muted">{node.column_count} cols</small>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
