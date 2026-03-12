import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { forceX, forceY } from 'd3-force';
import { useIntelligenceContext } from '../../../../contexts/IntelligenceContext';
import { getDepartmentsApi, DepartmentSummary } from '../../../../services/intelligenceApi';
import { DEPARTMENT_CATEGORIES } from './departmentConfig';

// Vertical tier mapping — spread departments across 5 layers
const DEPT_TIER: Record<string, number> = {
  executive: 0, governance: 0,
  strategy: 1, finance: 1,
  intelligence: 2, orchestration: 2, operations: 2,
  growth: 3, marketing: 3, admissions: 3, partnerships: 3,
  education: 4, student_success: 4, alumni: 4, platform: 4, infrastructure: 4,
};

interface GraphNode {
  id: string;
  slug: string;
  label: string;
  color: string;
  bgLight: string;
  val: number;
  health_score: number;
  innovation_score: number;
  initiative_count: number;
  active_initiatives: number;
  team_size: number;
  tier: number;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  relationship: string;
}

// Relationships between departments
const DEPT_EDGES: { source: string; target: string; relationship: string }[] = [
  // Core intelligence & orchestration
  { source: 'intelligence', target: 'operations', relationship: 'monitors' },
  { source: 'intelligence', target: 'growth', relationship: 'informs' },
  { source: 'intelligence', target: 'marketing', relationship: 'informs' },
  { source: 'intelligence', target: 'finance', relationship: 'reports' },
  { source: 'intelligence', target: 'strategy', relationship: 'feeds' },
  { source: 'orchestration', target: 'intelligence', relationship: 'orchestrates' },
  { source: 'orchestration', target: 'operations', relationship: 'orchestrates' },
  { source: 'orchestration', target: 'admissions', relationship: 'automates' },
  // Growth & revenue pipeline
  { source: 'growth', target: 'marketing', relationship: 'aligns' },
  { source: 'growth', target: 'education', relationship: 'feeds' },
  { source: 'growth', target: 'partnerships', relationship: 'develops' },
  { source: 'growth', target: 'admissions', relationship: 'drives' },
  { source: 'marketing', target: 'admissions', relationship: 'generates leads' },
  { source: 'marketing', target: 'alumni', relationship: 'engages' },
  // Education & student lifecycle
  { source: 'education', target: 'finance', relationship: 'drives revenue' },
  { source: 'education', target: 'student_success', relationship: 'supports' },
  { source: 'admissions', target: 'education', relationship: 'enrolls into' },
  { source: 'student_success', target: 'alumni', relationship: 'graduates' },
  { source: 'alumni', target: 'partnerships', relationship: 'refers' },
  // Infrastructure & platform
  { source: 'infrastructure', target: 'operations', relationship: 'supports' },
  { source: 'infrastructure', target: 'platform', relationship: 'powers' },
  { source: 'platform', target: 'education', relationship: 'delivers' },
  { source: 'platform', target: 'intelligence', relationship: 'provides data' },
  // Executive & governance
  { source: 'executive', target: 'strategy', relationship: 'directs' },
  { source: 'executive', target: 'finance', relationship: 'oversees' },
  { source: 'executive', target: 'governance', relationship: 'mandates' },
  { source: 'governance', target: 'operations', relationship: 'audits' },
  { source: 'governance', target: 'finance', relationship: 'compliance' },
  // Strategy cross-links
  { source: 'strategy', target: 'growth', relationship: 'plans' },
  { source: 'strategy', target: 'partnerships', relationship: 'evaluates' },
];

export default function DeptMapTab() {
  const { drillDown, selectedEntity } = useIntelligenceContext();
  const graphRef = useRef<ForceGraphMethods>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 380, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDepartmentsApi()
      .then((res) => setDepartments(res.data.departments))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
    if (!departments.length) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };

    const maxInits = Math.max(...departments.map((d) => d.initiative_count), 1);
    const nodes: GraphNode[] = departments.map((d) => {
      const config = DEPARTMENT_CATEGORIES[d.slug] || { label: d.name, color: '#718096', bgLight: '#f7fafc' };
      return {
        id: d.id,
        slug: d.slug,
        label: config.label,
        color: config.color,
        bgLight: config.bgLight,
        val: 10 + (d.initiative_count / maxInits) * 20,
        health_score: d.health_score,
        innovation_score: d.innovation_score,
        initiative_count: d.initiative_count,
        active_initiatives: d.active_initiatives,
        team_size: d.team_size,
        tier: DEPT_TIER[d.slug] ?? 2,
      };
    });

    const slugToId: Record<string, string> = {};
    departments.forEach((d) => { slugToId[d.slug] = d.id; });

    const links: GraphLink[] = DEPT_EDGES
      .filter((e) => slugToId[e.source] && slugToId[e.target])
      .map((e) => ({ source: slugToId[e.source], target: slugToId[e.target], relationship: e.relationship }));

    return { nodes, links };
  }, [departments]);

  useEffect(() => {
    const fg = graphRef.current;
    if (!fg || !graphData.nodes.length) return;
    fg.d3Force('charge')?.strength(-200);
    fg.d3Force('link')?.distance(55);

    // Spread vertically across the full canvas using tier levels
    const maxTier = Math.max(...graphData.nodes.map((n) => n.tier), 1);
    fg.d3Force(
      'y',
      forceY((node: any) => {
        const t = (node as GraphNode).tier / maxTier;
        return -dimensions.height * 0.38 + t * dimensions.height * 0.76;
      }).strength(0.45)
    );
    fg.d3Force('x', forceX(0).strength(0.06));

    (fg as any).d3AlphaDecay?.(0.02);
    (fg as any).d3VelocityDecay?.(0.3);
    fg.d3ReheatSimulation();
  }, [graphData, dimensions.height]);

  useEffect(() => {
    const timer = setTimeout(() => {
      graphRef.current?.zoomToFit(400, 20);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      graphRef.current?.zoomToFit(400, 20);
    }, 300);
    return () => clearTimeout(timer);
  }, [dimensions]);

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const radius = 18 + n.val * 0.5;
      const isHovered = hoveredNode?.id === n.id;
      const isSelected = selectedEntity?.id === n.id;
      const fontSize = Math.max(10 / globalScale, 3);

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
      ctx.fillStyle = n.bgLight;
      ctx.fill();
      ctx.strokeStyle = n.color;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      // Label
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = n.color;
      ctx.fillText(n.label, n.x!, n.y! - 3);

      // Score
      const smallFont = Math.max(7 / globalScale, 2);
      ctx.font = `${smallFont}px -apple-system, sans-serif`;
      ctx.fillStyle = '#718096';
      ctx.fillText(`${Math.round(n.health_score)}hp / ${Math.round(n.innovation_score)}in`, n.x!, n.y! + fontSize * 0.7);

      // Initiative count badge
      const badgeRadius = Math.max(6 / globalScale, 2.5);
      const badgeX = n.x! + radius * 0.7;
      const badgeY = n.y! - radius * 0.7;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = n.color;
      ctx.fill();
      ctx.font = `bold ${Math.max(6 / globalScale, 2)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(String(n.active_initiatives), badgeX, badgeY + 0.5);
    },
    [hoveredNode, selectedEntity]
  );

  const paintLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const src = link.source as GraphNode;
      const tgt = link.target as GraphNode;
      if (!src.x || !tgt.x) return;

      ctx.beginPath();
      ctx.moveTo(src.x!, src.y!);
      ctx.lineTo(tgt.x!, tgt.y!);
      ctx.strokeStyle = 'rgba(160, 174, 192, 0.7)';
      ctx.lineWidth = 1.2 / globalScale;
      ctx.stroke();

      const midX = (src.x! + tgt.x!) / 2;
      const midY = (src.y! + tgt.y!) / 2;
      const labelSize = Math.max(6 / globalScale, 2);
      ctx.font = `${labelSize}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(113, 128, 150, 0.75)';
      ctx.fillText((link as GraphLink).relationship, midX, midY - 2 / globalScale);
    },
    []
  );

  const handleNodeClick = useCallback(
    (node: any) => {
      const n = node as GraphNode;
      drillDown('department', n.id, n.label);
    },
    [drillDown]
  );

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100 text-muted">
        <div className="spinner-border spinner-border-sm me-2" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <small>Loading departments...</small>
      </div>
    );
  }

  if (!departments.length) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100 text-muted p-3">
        <small className="text-center">No departments found. Seed data will populate on server restart.</small>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column h-100">
      <div className="p-2 border-bottom">
        <div className="d-flex justify-content-between align-items-center">
          <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
            Department Map
          </span>
          <span className="text-muted" style={{ fontSize: '0.65rem' }}>
            {departments.length} depts
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-grow-1"
        style={{ position: 'relative', minHeight: 0 }}
        aria-label="Department relationship graph — interactive."
      >
        <ForceGraph2D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node: any, color, ctx) => {
            const n = node as GraphNode;
            const radius = 18 + n.val * 0.5;
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius + 4, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          linkCanvasObject={paintLink}
          onNodeHover={(node: any) => setHoveredNode(node as GraphNode | null)}
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
            onClick={() => { const fg = graphRef.current; if (fg) fg.zoom(Math.min(fg.zoom() * 1.4, 8), 300); }}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            style={{ width: 26, height: 26, padding: 0, fontSize: '0.85rem', background: 'rgba(255,255,255,0.9)' }}
            onClick={() => { const fg = graphRef.current; if (fg) fg.zoom(Math.max(fg.zoom() * 0.7, 0.3), 300); }}
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            style={{ width: 26, height: 26, padding: 0, fontSize: '0.6rem', background: 'rgba(255,255,255,0.9)' }}
            onClick={() => graphRef.current?.zoomToFit(400, 20)}
            aria-label="Reset view"
          >
            ⟳
          </button>
        </div>

        {/* Tooltip */}
        {hoveredNode && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              zIndex: 20,
              background: 'rgba(255,255,255,0.95)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: '0.7rem',
              pointerEvents: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              maxWidth: 220,
            }}
          >
            <div className="fw-semibold" style={{ color: hoveredNode.color }}>
              {hoveredNode.label}
            </div>
            <div className="text-muted mt-1">
              Health: {Math.round(hoveredNode.health_score)} · Innovation: {Math.round(hoveredNode.innovation_score)}
            </div>
            <div className="text-muted">
              {hoveredNode.active_initiatives} active / {hoveredNode.initiative_count} initiatives
            </div>
            <div className="text-muted">{hoveredNode.team_size} team members</div>
          </div>
        )}
      </div>
    </div>
  );
}
