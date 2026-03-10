import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { forceX, forceY } from 'd3-force';
import { BusinessEntityNetwork } from '../../../services/intelligenceApi';
import { BUSINESS_CATEGORIES, formatRowCount } from './entityPanel/businessEntityConfig';
import { useIntelligenceContext } from '../../../contexts/IntelligenceContext';
import GraphTooltip from './GraphTooltip';

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
  // Force-graph adds x, y at runtime
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  relationship: string;
}

interface Props {
  hierarchy: BusinessEntityNetwork;
  onNodeClick: (categoryId: string, label: string) => void;
}

export default function InteractiveBusinessGraph({ hierarchy, onNodeClick }: Props) {
  const { drillDown } = useIntelligenceContext();
  const graphRef = useRef<ForceGraphMethods>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width: Math.max(width, 300), height: Math.max(height, 300) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Build graph data from hierarchy
  const graphData = useMemo(() => {
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
          val: 4 + (cat.total_rows / maxRows) * 16,
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
      .map((e) => ({
        source: e.source,
        target: e.target,
        relationship: e.relationship,
      }));

    return { nodes, links };
  }, [hierarchy]);

  // Configure forces after graph mounts
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;

    // Vertical stratification by hierarchy level
    fg.d3Force('charge')?.strength(-300);
    fg.d3Force('link')?.distance(80);

    // Custom Y force to stratify nodes by level
    const maxLevel = Math.max(...graphData.nodes.map((n) => n.level));
    fg.d3Force(
      'y',
      forceY((node: any) => {
        const normalizedLevel = (node.level ?? 0) / Math.max(maxLevel, 1);
        return -dimensions.height * 0.35 + normalizedLevel * dimensions.height * 0.7;
      }).strength(0.3)
    );

    fg.d3Force('x', forceX(0).strength(0.05));

    // Reheat
    fg.d3ReheatSimulation();
  }, [graphData, dimensions.height]);

  // Zoom to fit after initial stabilization
  useEffect(() => {
    const timer = setTimeout(() => {
      graphRef.current?.zoomToFit(400, 60);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Custom node rendering
  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const radius = n.isHub ? 22 : 14 + n.val * 0.5;
      const isHovered = hoveredNode?.id === n.id;
      const fontSize = Math.max(11 / globalScale, 3);

      // Glow on hover
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, radius + 6, 0, 2 * Math.PI);
        ctx.fillStyle = n.bgLight;
        ctx.fill();
      }

      // Main circle
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, radius, 0, 2 * Math.PI);
      ctx.fillStyle = n.bgLight;
      ctx.fill();
      ctx.strokeStyle = n.color;
      ctx.lineWidth = n.isHub ? 3 : 1.5;
      ctx.stroke();

      // Label
      ctx.font = `${n.isHub ? 'bold' : '600'} ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = n.color;
      ctx.fillText(n.label, n.x!, n.y! - 2);

      // Row count below label
      const smallFont = Math.max(9 / globalScale, 2.5);
      ctx.font = `${smallFont}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillStyle = '#718096';
      ctx.fillText(formatRowCount(n.total_rows), n.x!, n.y! + fontSize * 0.8);

      // Table count badge
      const badgeRadius = Math.max(7 / globalScale, 3);
      const badgeX = n.x! + radius * 0.7;
      const badgeY = n.y! - radius * 0.7;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = n.color;
      ctx.fill();
      ctx.font = `bold ${Math.max(7 / globalScale, 2.5)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(String(n.table_count), badgeX, badgeY + 0.5);
    },
    [hoveredNode]
  );

  // Custom link rendering with relationship labels
  const paintLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const src = link.source as GraphNode;
      const tgt = link.target as GraphNode;
      if (!src.x || !tgt.x) return;

      // Dashed line
      ctx.beginPath();
      ctx.setLineDash([4, 3]);
      ctx.moveTo(src.x!, src.y!);
      ctx.lineTo(tgt.x!, tgt.y!);
      ctx.strokeStyle = 'rgba(160, 174, 192, 0.5)';
      ctx.lineWidth = 1.2 / globalScale;
      ctx.stroke();
      ctx.setLineDash([]);

      // Relationship label at midpoint
      const midX = (src.x! + tgt.x!) / 2;
      const midY = (src.y! + tgt.y!) / 2;
      const labelSize = Math.max(8 / globalScale, 2.5);
      ctx.font = `${labelSize}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(113, 128, 150, 0.7)';
      ctx.fillText((link as GraphLink).relationship, midX, midY - 3 / globalScale);
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
      onNodeClick(n.id, n.label);
    },
    [drillDown, onNodeClick]
  );

  const handleZoomIn = useCallback(() => {
    const fg = graphRef.current;
    if (fg) {
      const currentZoom = fg.zoom();
      fg.zoom(Math.min(currentZoom * 1.4, 10), 300);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    const fg = graphRef.current;
    if (fg) {
      const currentZoom = fg.zoom();
      fg.zoom(Math.max(currentZoom * 0.7, 0.3), 300);
    }
  }, []);

  const handleReset = useCallback(() => {
    graphRef.current?.zoomToFit(400, 60);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onMouseMove={handleMouseMove}
      aria-label="Business entity relationship graph — interactive. Use the entity browser tab for an accessible alternative."
    >
      <ForceGraph2D
        ref={graphRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          const n = node as GraphNode;
          const radius = n.isHub ? 22 : 14 + n.val * 0.5;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, radius + 4, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkCanvasObject={paintLink}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        cooldownTicks={120}
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
        style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 10 }}
      >
        <button
          className="btn btn-sm btn-outline-secondary intel-card-float"
          style={{ width: 34, height: 34, padding: 0, fontSize: '1rem' }}
          onClick={handleZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          className="btn btn-sm btn-outline-secondary intel-card-float"
          style={{ width: 34, height: 34, padding: 0, fontSize: '1rem' }}
          onClick={handleZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          className="btn btn-sm btn-outline-secondary intel-card-float"
          style={{ width: 34, height: 34, padding: 0, fontSize: '0.7rem' }}
          onClick={handleReset}
          title="Reset view"
          aria-label="Reset view"
        >
          ⟳
        </button>
      </div>

      {/* Legend */}
      <div
        className="d-flex gap-3 align-items-center intel-card-float px-3 py-2"
        style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 10, fontSize: '0.68rem' }}
      >
        <span className="d-flex align-items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2.5px solid var(--color-primary)', display: 'inline-block' }} />
          Hub Entity
        </span>
        <span className="d-flex align-items-center gap-1">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a0aec0', display: 'inline-block' }} />
          Category
        </span>
        <span className="text-muted">{graphData.links.length} relationships</span>
      </div>

      {/* Hover tooltip */}
      {hoveredNode && (
        <GraphTooltip
          node={hoveredNode}
          position={mousePos}
        />
      )}
    </div>
  );
}
