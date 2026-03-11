import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { forceX, forceY } from 'd3-force';
import { useIntelligenceContext } from '../../../../contexts/IntelligenceContext';
import { BusinessEntityNetwork } from '../../../../services/intelligenceApi';
import { BUSINESS_CATEGORIES, formatRowCount } from './businessEntityConfig';
import GraphTooltip from '../GraphTooltip';

// Hierarchy level mapping for vertical positioning
const LEVEL_MAP: Record<string, number> = {
  agents: 0,
  campaigns: 1,
  system: 1,
  leads: 2,
  visitors: 3,
  students: 3,
  cohorts: 4,
  curriculum: 4,
  other: 5,
};

interface GraphNode {
  id: string;
  label: string;
  color: string;
  bgLight: string;
  val: number;
  table_count: number;
  total_rows: number;
  matched_tables: string[];
  level: number;
  isHub: boolean;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  relationship: string;
}

interface Props {
  hierarchy: BusinessEntityNetwork | null;
  loading?: boolean;
}

export default function BusinessMapTab({ hierarchy, loading }: Props) {
  const { drillDown, selectedEntity } = useIntelligenceContext();
  const graphRef = useRef<ForceGraphMethods>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 240, height: 400 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

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

  // Build graph data from hierarchy
  const graphData = useMemo(() => {
    if (!hierarchy) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
    const maxRows = Math.max(...hierarchy.categories.map((c) => c.total_rows), 1);

    const nodes: GraphNode[] = hierarchy.categories
      .filter((c) => c.table_count > 0)
      .map((cat) => {
        const config = BUSINESS_CATEGORIES[cat.id] || BUSINESS_CATEGORIES.other;
        return {
          id: cat.id,
          label: config.label,
          color: config.color,
          bgLight: config.bgLight,
          val: 6 + (cat.total_rows / maxRows) * 18,
          table_count: cat.table_count,
          total_rows: cat.total_rows,
          matched_tables: cat.matched_tables,
          level: LEVEL_MAP[cat.id] ?? 5,
          isHub: cat.id === hierarchy.hub_entity,
        };
      });

    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: GraphLink[] = hierarchy.hierarchy_edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, relationship: e.relationship }));

    return { nodes, links };
  }, [hierarchy]);

  // Configure forces for compact layout
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg || !graphData.nodes.length) return;

    fg.d3Force('charge')?.strength(-400);
    fg.d3Force('link')?.distance(80);

    const maxLevel = Math.max(...graphData.nodes.map((n) => n.level));
    fg.d3Force(
      'y',
      forceY((node: any) => {
        const normalizedLevel = (node.level ?? 0) / Math.max(maxLevel, 1);
        return -dimensions.height * 0.3 + normalizedLevel * dimensions.height * 0.6;
      }).strength(0.35)
    );
    fg.d3Force('x', forceX(0).strength(0.06));

    // Smoother physics (cast to access d3 simulation methods)
    (fg as any).d3AlphaDecay?.(0.015);
    (fg as any).d3VelocityDecay?.(0.25);

    fg.d3ReheatSimulation();
  }, [graphData, dimensions.height]);

  // Zoom to fit after stabilization
  useEffect(() => {
    const timer = setTimeout(() => {
      graphRef.current?.zoomToFit(400, 10);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  // Re-fit when container dimensions change (e.g., after ResizeObserver fires)
  useEffect(() => {
    const timer = setTimeout(() => {
      graphRef.current?.zoomToFit(400, 20);
    }, 300);
    return () => clearTimeout(timer);
  }, [dimensions]);

  // Custom node rendering (compact for sidebar)
  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const radius = n.isHub ? 28 : 16 + n.val * 0.6;
      const isHovered = hoveredNode?.id === n.id;
      const isSelected = selectedEntity?.type === n.id;
      const fontSize = Math.max(11 / globalScale, 3);

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

      if (isHovered) {
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, radius + 4, 0, 2 * Math.PI);
        ctx.fillStyle = n.bgLight;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x!, n.y!, radius, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? n.bgLight : n.bgLight;
      ctx.fill();
      ctx.strokeStyle = n.color;
      ctx.lineWidth = isSelected ? 3 : n.isHub ? 2.5 : 1.5;
      ctx.stroke();

      ctx.font = `${n.isHub ? 'bold' : '600'} ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = n.color;
      ctx.fillText(n.label, n.x!, n.y! - 2);

      const smallFont = Math.max(7 / globalScale, 2);
      ctx.font = `${smallFont}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillStyle = '#718096';
      ctx.fillText(formatRowCount(n.total_rows), n.x!, n.y! + fontSize * 0.8);

      // Table count badge
      const badgeRadius = Math.max(6 / globalScale, 2.5);
      const badgeX = n.x! + radius * 0.7;
      const badgeY = n.y! - radius * 0.7;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = n.color;
      ctx.fill();
      ctx.font = `bold ${Math.max(6 / globalScale, 2)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(String(n.table_count), badgeX, badgeY + 0.5);
    },
    [hoveredNode, selectedEntity]
  );

  // Custom link rendering
  const paintLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const src = link.source as GraphNode;
      const tgt = link.target as GraphNode;
      if (!src.x || !tgt.x) return;

      ctx.beginPath();
      ctx.setLineDash([3, 2]);
      ctx.moveTo(src.x!, src.y!);
      ctx.lineTo(tgt.x!, tgt.y!);
      ctx.strokeStyle = 'rgba(160, 174, 192, 0.5)';
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();
      ctx.setLineDash([]);

      const midX = (src.x! + tgt.x!) / 2;
      const midY = (src.y! + tgt.y!) / 2;
      const labelSize = Math.max(7 / globalScale, 2);
      ctx.font = `${labelSize}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(113, 128, 150, 0.6)';
      ctx.fillText((link as GraphLink).relationship, midX, midY - 2 / globalScale);
    },
    []
  );

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node as GraphNode | null);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleNodeClick = useCallback(
    (node: any) => {
      const n = node as GraphNode;
      drillDown(n.id, 'all', n.label);
    },
    [drillDown]
  );

  if (loading || !hierarchy) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100 text-muted">
        <div className="spinner-border spinner-border-sm me-2" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <small>Loading business map...</small>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column h-100">
      <div className="p-2 border-bottom">
        <div className="d-flex justify-content-between align-items-center">
          <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
            Business Model
          </span>
          <span className="text-muted" style={{ fontSize: '0.65rem' }}>
            {hierarchy.total_tables} tables / {formatRowCount(hierarchy.total_rows)} rows
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-grow-1"
        style={{ position: 'relative', minHeight: 0 }}
        onMouseMove={handleMouseMove}
        aria-label="Business entity relationship graph — interactive. Use the Entities tab for an accessible list."
      >
        <ForceGraph2D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node: any, color, ctx) => {
            const n = node as GraphNode;
            const radius = n.isHub ? 28 : 16 + n.val * 0.6;
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

        {/* Compact zoom controls */}
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

        {/* Hover tooltip */}
        {hoveredNode && (
          <GraphTooltip node={hoveredNode} position={mousePos} />
        )}
      </div>
    </div>
  );
}
