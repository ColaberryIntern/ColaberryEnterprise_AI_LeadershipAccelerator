import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { useIntelligenceContext } from '../../../../contexts/IntelligenceContext';
import { getDepartmentsApi, DepartmentSummary } from '../../../../services/intelligenceApi';
import { DEPARTMENT_CATEGORIES } from './departmentConfig';

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
  { source: 'intelligence', target: 'operations', relationship: 'monitors' },
  { source: 'intelligence', target: 'growth', relationship: 'informs' },
  { source: 'intelligence', target: 'marketing', relationship: 'informs' },
  { source: 'intelligence', target: 'finance', relationship: 'reports' },
  { source: 'orchestration', target: 'intelligence', relationship: 'orchestrates' },
  { source: 'orchestration', target: 'operations', relationship: 'orchestrates' },
  { source: 'growth', target: 'marketing', relationship: 'aligns' },
  { source: 'growth', target: 'education', relationship: 'feeds' },
  { source: 'infrastructure', target: 'operations', relationship: 'supports' },
  { source: 'education', target: 'finance', relationship: 'drives revenue' },
];

const TREND_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  up: { icon: '▲', color: 'var(--color-accent)', label: 'Trending up' },
  down: { icon: '▼', color: 'var(--color-secondary)', label: 'Trending down' },
  stable: { icon: '→', color: 'var(--color-text-light)', label: 'Stable' },
};

// Some KPIs are "lower is better" — a down trend is good
const LOWER_IS_BETTER = ['error rate', 'cac', 'mttr', 'avg response time'];

function isTrendGood(trend: string, kpiName: string): boolean {
  const isLowerBetter = LOWER_IS_BETTER.some((k) => kpiName.toLowerCase().includes(k));
  if (trend === 'stable') return true;
  if (isLowerBetter) return trend === 'down';
  return trend === 'up';
}

function getTrendColor(trend: string, kpiName: string): string {
  if (trend === 'stable') return 'var(--color-text-light)';
  return isTrendGood(trend, kpiName) ? 'var(--color-accent)' : 'var(--color-secondary)';
}

// ─── KPI Cards for Selected Department ─────────────────────────────────────

function DeptKPICards({ dept }: { dept: DepartmentSummary }) {
  const kpis = dept.kpis || [];
  const objectives = dept.strategic_objectives || [];

  return (
    <div className="p-2" style={{ overflowY: 'auto' }}>
      {/* Dept header */}
      <div className="d-flex align-items-center gap-2 mb-2 px-1">
        <div
          className="rounded-circle"
          style={{ width: 10, height: 10, background: dept.color, flexShrink: 0 }}
        />
        <span className="fw-semibold" style={{ fontSize: '0.8rem', color: dept.color }}>{dept.name}</span>
        <span className="text-muted ms-auto" style={{ fontSize: '0.6rem' }}>{dept.team_size} members</span>
      </div>

      {/* Health / Innovation mini-bar */}
      <div className="d-flex gap-2 mb-2 px-1">
        <div className="flex-grow-1 rounded-2 p-1 text-center" style={{ background: dept.bg_light }}>
          <div className="fw-bold" style={{ fontSize: '0.85rem', color: dept.color }}>{Math.round(dept.health_score)}</div>
          <div className="text-muted" style={{ fontSize: '0.55rem' }}>Health</div>
        </div>
        <div className="flex-grow-1 rounded-2 p-1 text-center" style={{ background: dept.bg_light }}>
          <div className="fw-bold" style={{ fontSize: '0.85rem', color: dept.color }}>{Math.round(dept.innovation_score)}</div>
          <div className="text-muted" style={{ fontSize: '0.55rem' }}>Innovation</div>
        </div>
        <div className="flex-grow-1 rounded-2 p-1 text-center" style={{ background: dept.bg_light }}>
          <div className="fw-bold" style={{ fontSize: '0.85rem', color: dept.color }}>{dept.active_initiatives}</div>
          <div className="text-muted" style={{ fontSize: '0.55rem' }}>Active</div>
        </div>
      </div>

      {/* KPI Cards */}
      {kpis.length > 0 && (
        <>
          <div className="px-1 mb-1">
            <span className="fw-semibold" style={{ fontSize: '0.7rem', color: 'var(--color-primary)' }}>KPIs</span>
          </div>
          <div className="d-flex flex-column gap-1 mb-2">
            {kpis.map((kpi) => {
              const trend = TREND_ICONS[kpi.trend] || TREND_ICONS.stable;
              const trendColor = getTrendColor(kpi.trend, kpi.name);
              const good = isTrendGood(kpi.trend, kpi.name);
              return (
                <div
                  key={kpi.name}
                  className="d-flex align-items-center justify-content-between rounded-2 px-2 py-1"
                  style={{ background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)' }}
                >
                  <div className="d-flex align-items-center gap-1">
                    <span className="text-muted" style={{ fontSize: '0.7rem' }}>{kpi.name}</span>
                  </div>
                  <div className="d-flex align-items-center gap-1">
                    <span className="fw-bold" style={{ fontSize: '0.8rem', color: 'var(--color-text)' }}>
                      {typeof kpi.value === 'number' && kpi.value >= 1000
                        ? `${(kpi.value / 1000).toFixed(1)}K`
                        : kpi.value}
                      {kpi.unit && <span style={{ fontSize: '0.6rem', fontWeight: 400 }}> {kpi.unit}</span>}
                    </span>
                    <span
                      style={{ fontSize: '0.6rem', color: trendColor, fontWeight: 600 }}
                      title={`${trend.label} — ${good ? 'Positive' : kpi.trend === 'stable' ? 'Neutral' : 'Needs attention'}`}
                    >
                      {trend.icon}
                    </span>
                    <span
                      className="rounded-circle d-inline-block"
                      style={{
                        width: 6,
                        height: 6,
                        background: good ? 'var(--color-accent)' : kpi.trend === 'stable' ? '#d69e2e' : 'var(--color-secondary)',
                      }}
                      title={good ? 'Good' : kpi.trend === 'stable' ? 'Stable' : 'Needs attention'}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Strategic Objectives */}
      {objectives.length > 0 && (
        <>
          <div className="px-1 mb-1">
            <span className="fw-semibold" style={{ fontSize: '0.7rem', color: 'var(--color-primary)' }}>Objectives</span>
          </div>
          <div className="d-flex flex-column gap-1">
            {objectives.map((obj, i) => (
              <div key={i} className="px-2 py-1 rounded-2" style={{ background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)' }}>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="text-muted" style={{ fontSize: '0.65rem' }}>{obj.title}</span>
                  <span className="fw-bold" style={{ fontSize: '0.65rem', color: obj.progress >= 80 ? 'var(--color-accent)' : obj.progress >= 50 ? 'var(--color-primary-light)' : '#d69e2e' }}>
                    {obj.progress}%
                  </span>
                </div>
                <div className="progress" style={{ height: 4 }}>
                  <div
                    className={`progress-bar bg-${obj.progress >= 80 ? 'success' : obj.progress >= 50 ? 'primary' : 'warning'}`}
                    style={{ width: `${obj.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── All Departments Overview Cards ────────────────────────────────────────

function AllDeptsOverview({ departments, onSelect }: { departments: DepartmentSummary[]; onSelect: (dept: DepartmentSummary) => void }) {
  return (
    <div className="p-2" style={{ overflowY: 'auto' }}>
      <div className="px-1 mb-1">
        <span className="fw-semibold" style={{ fontSize: '0.7rem', color: 'var(--color-primary)' }}>All Departments</span>
      </div>
      <div className="d-flex flex-column gap-1">
        {departments.map((dept) => {
          const topKpi = dept.kpis?.[0];
          return (
            <div
              key={dept.id}
              className="d-flex align-items-center gap-2 px-2 py-1 rounded-2"
              style={{ background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)', cursor: 'pointer' }}
              onClick={() => onSelect(dept)}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = dept.bg_light; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-alt)'; }}
            >
              <div className="rounded-circle" style={{ width: 8, height: 8, background: dept.color, flexShrink: 0 }} />
              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                <div className="fw-medium" style={{ fontSize: '0.72rem', color: dept.color }}>{dept.name}</div>
                <div className="text-muted" style={{ fontSize: '0.58rem' }}>
                  {Math.round(dept.health_score)}hp · {dept.active_initiatives} active
                  {topKpi && ` · ${topKpi.name}: ${topKpi.value}${topKpi.unit}`}
                </div>
              </div>
              <span style={{ fontSize: '0.6rem', color: 'var(--color-text-light)' }}>▸</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function DeptMapTab() {
  const { drillDown, selectedEntity } = useIntelligenceContext();
  const graphRef = useRef<ForceGraphMethods>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 380, height: 300 });
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

  const selectedDept = useMemo(() => {
    if (!selectedEntity || selectedEntity.type !== 'department') return null;
    return departments.find((d) => d.id === selectedEntity.id) || null;
  }, [selectedEntity, departments]);

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
    fg.d3Force('charge')?.strength(-400);
    fg.d3Force('link')?.distance(90);
    (fg as any).d3AlphaDecay?.(0.015);
    (fg as any).d3VelocityDecay?.(0.25);
    fg.d3ReheatSimulation();
  }, [graphData]);

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
      ctx.setLineDash([3, 2]);
      ctx.moveTo(src.x!, src.y!);
      ctx.lineTo(tgt.x!, tgt.y!);
      ctx.strokeStyle = 'rgba(160, 174, 192, 0.5)';
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();
      ctx.setLineDash([]);

      if (globalScale > 1.2) {
        const midX = (src.x! + tgt.x!) / 2;
        const midY = (src.y! + tgt.y!) / 2;
        const labelSize = Math.max(6 / globalScale, 2);
        ctx.font = `${labelSize}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(113, 128, 150, 0.6)';
        ctx.fillText((link as GraphLink).relationship, midX, midY - 2 / globalScale);
      }
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

  const handleDeptCardClick = useCallback(
    (dept: DepartmentSummary) => {
      const config = DEPARTMENT_CATEGORIES[dept.slug];
      drillDown('department', dept.id, config?.label || dept.name);
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

      {/* Graph - takes about 45% of height */}
      <div
        ref={containerRef}
        style={{ position: 'relative', minHeight: 0, flex: '0 0 45%' }}
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

      {/* Bottom section - KPI detail or overview list */}
      <div className="border-top flex-grow-1" style={{ minHeight: 0, overflowY: 'auto' }}>
        {selectedDept ? (
          <DeptKPICards dept={selectedDept} />
        ) : (
          <AllDeptsOverview departments={departments} onSelect={handleDeptCardClick} />
        )}
      </div>
    </div>
  );
}
