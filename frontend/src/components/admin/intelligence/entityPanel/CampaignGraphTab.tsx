import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import {
  getCampaignGraph,
  CampaignGraphData,
  CampaignGraphNode,
  CampaignGraphValidation,
  GraphUserRecord,
  getGraphEdgeUsers,
} from '../../../../services/intelligenceApi';
import CampaignNodeDetailsPanel from '../CampaignNodeDetailsPanel';

// ─── System Map 4-Layer Config ──────────────────────────────────────────────

const COLUMN_CONFIG: Record<string, number> = {
  source: 0, entry: 1, campaign: 2, outcome: 3,
};
const COLUMN_X_PCT = [0.10, 0.36, 0.62, 0.90];
const COLUMN_LABELS = ['Sources', 'Entry Points', 'Campaigns', 'Outcomes'];

// Zone boundaries for column-constrained dragging (percentage of width)
const ZONE_RANGES: Record<string, [number, number]> = {
  source:   [0, 0.23],
  entry:    [0.23, 0.49],
  campaign: [0.49, 0.76],
  outcome:  [0.76, 1.0],
};

const POSITIONS_KEY = 'campaign-graph-positions';

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  source:   { color: '#805ad5', bg: '#faf5ff' },
  entry:    { color: '#319795', bg: '#e6fffa' },
  campaign: { color: '#2b6cb0', bg: '#ebf4ff' },
  outcome:  { color: '#38a169', bg: '#f0fff4' },
};

// Per-source-node colors for visual differentiation
const SOURCE_NODE_COLORS: Record<string, { color: string; bg: string }> = {
  src_marketing:     { color: '#d69e2e', bg: '#fefcbf' },
  src_cold_outbound: { color: '#3182ce', bg: '#ebf4ff' },
  src_alumni:        { color: '#38a169', bg: '#f0fff4' },
  src_anonymous:     { color: '#a0aec0', bg: '#f7fafc' },
};

const SOURCE_FILTER_OPTIONS = [
  { value: null, label: 'All Sources' },
  { value: 'src_marketing', label: 'Marketing' },
  { value: 'src_cold_outbound', label: 'Cold Outbound' },
  { value: 'src_alumni', label: 'Alumni' },
  { value: 'src_anonymous', label: 'Anonymous' },
];

interface GraphNode {
  id: string;
  type: string;
  label: string;
  count: number;
  color: string;
  bg: string;
  val: number;
  col: number;
  metrics: CampaignGraphNode['metrics'];
  source_breakdown?: Record<string, number>;
  fx?: number;
  fy?: number;
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

function getNodeColors(node: CampaignGraphNode): { color: string; bg: string } {
  if (node.type === 'source' && SOURCE_NODE_COLORS[node.id]) {
    return SOURCE_NODE_COLORS[node.id];
  }
  return TYPE_COLORS[node.type] || TYPE_COLORS.entry;
}

// ─── Edge Details Panel (for edge click drilldown) ──────────────────────────

interface SelectedEdge {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  volume: number;
  label: string;
}

const TOUCH_LABELS: Record<string, string> = {
  cory_chat: 'Cory Chat',
  blueprint: 'Blueprint',
  sponsorship: 'Sponsorship',
  strategy_call: 'Strategy Call',
};

function EdgeDetailsPanel({ edge, onClose }: { edge: SelectedEdge; onClose: () => void }) {
  const [users, setUsers] = useState<GraphUserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    setUsers([]);
    setPage(1);
    getGraphEdgeUsers(edge.from, edge.to, 1, limit)
      .then(({ data }) => { setUsers(data.users); setTotal(data.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [edge.from, edge.to]);

  const loadMore = () => {
    const nextPage = page + 1;
    setLoading(true);
    getGraphEdgeUsers(edge.from, edge.to, nextPage, limit)
      .then(({ data }) => { setUsers(prev => [...prev, ...data.users]); setPage(nextPage); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  return (
    <div className="d-flex flex-column h-100">
      <div className="p-2 border-bottom d-flex align-items-center justify-content-between" style={{ background: '#f7fafc' }}>
        <div>
          <div className="fw-semibold small" style={{ lineHeight: 1.2 }}>
            {edge.fromLabel} → {edge.toLabel}
          </div>
          <div className="text-muted" style={{ fontSize: '0.6rem' }}>Edge: {edge.label}</div>
        </div>
        <button
          className="btn btn-sm btn-outline-secondary"
          style={{ width: 24, height: 24, padding: 0, fontSize: '0.7rem', lineHeight: 1 }}
          onClick={onClose}
          aria-label="Close edge details"
        >×</button>
      </div>

      <div className="flex-grow-1 overflow-auto p-3">
        <div className="text-center mb-3">
          <div className="fw-bold" style={{ fontSize: '1.6rem', color: '#2b6cb0', lineHeight: 1 }}>
            {edge.volume.toLocaleString()}
          </div>
          <div className="text-muted" style={{ fontSize: '0.65rem' }}>users on this path</div>
        </div>

        {loading && users.length === 0 && (
          <div className="text-center py-3 text-muted">
            <span className="spinner-border spinner-border-sm me-1" role="status" />
            Loading users...
          </div>
        )}

        {users.length > 0 && (
          <div className="border rounded" style={{ maxHeight: 350, overflowY: 'auto' }}>
            <table className="table table-sm table-hover mb-0" style={{ fontSize: '0.68rem' }}>
              <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '4px 6px' }}>Name</th>
                  <th style={{ padding: '4px 6px' }}>Source</th>
                  <th style={{ padding: '4px 6px' }}>First Touch</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ padding: '3px 6px' }}>
                      <div className="fw-medium" style={{ lineHeight: 1.2 }}>{u.name || '—'}</div>
                      <div className="text-muted" style={{ fontSize: '0.6rem' }}>{u.email}</div>
                    </td>
                    <td style={{ padding: '3px 6px' }}>
                      <span className="badge bg-light text-dark" style={{ fontSize: '0.6rem' }}>
                        {u.source_category?.replace('_', ' ') || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '3px 6px' }}>
                      {u.first_touch ? (
                        <span className="badge bg-info text-white" style={{ fontSize: '0.6rem' }}>
                          {TOUCH_LABELS[u.first_touch] || u.first_touch}
                        </span>
                      ) : (
                        <span className="text-muted">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {users.length < total && !loading && (
          <button className="btn btn-sm btn-link w-100 mt-1" style={{ fontSize: '0.65rem' }} onClick={loadMore}>
            Load more ({users.length} of {total})
          </button>
        )}

        {loading && users.length > 0 && (
          <div className="text-center py-1 text-muted" style={{ fontSize: '0.65rem' }}>
            <span className="spinner-border spinner-border-sm me-1" role="status" />
          </div>
        )}

        {!loading && users.length === 0 && (
          <div className="text-center text-muted py-3" style={{ fontSize: '0.7rem' }}>No users found on this path</div>
        )}
      </div>

      <div className="p-2 border-top">
        <button className="btn btn-sm btn-outline-secondary w-100" onClick={onClose} style={{ fontSize: '0.7rem' }}>
          ← Back to Graph
        </button>
      </div>
    </div>
  );
}

// ─── Validation summary bar ─────────────────────────────────────────────────

function ValidationBar({ validation, warnings }: { validation?: CampaignGraphValidation; warnings: string[] }) {
  const [showDetails, setShowDetails] = useState(false);
  const allWarnings = [...(validation?.warnings || []), ...warnings];
  const isClean = allWarnings.length === 0;

  return (
    <div style={{ position: 'absolute', top: 6, left: 8, zIndex: 12 }}>
      <button
        className={`btn btn-sm ${isClean ? 'btn-outline-success' : 'btn-outline-warning'} d-flex align-items-center gap-1`}
        style={{ fontSize: '0.6rem', padding: '2px 8px', background: 'rgba(255,255,255,0.95)' }}
        onClick={() => setShowDetails(!showDetails)}
        title={isClean ? 'All checks pass' : `${allWarnings.length} warning(s)`}
      >
        {isClean ? '✓' : '⚠'} {validation?.total_leads?.toLocaleString() || '—'} leads
      </button>
      {showDetails && validation && (
        <div style={{
          position: 'absolute', top: 28, left: 0, width: 260,
          background: 'white', border: '1px solid #e2e8f0', borderRadius: 6,
          padding: '8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          fontSize: '0.65rem', zIndex: 20,
        }}>
          <div className="fw-semibold mb-1">Data Integrity</div>
          <div className="d-flex justify-content-between py-1 border-bottom">
            <span className="text-muted">Total Leads</span>
            <span className="fw-semibold">{validation.total_leads.toLocaleString()}</span>
          </div>
          <div className="d-flex justify-content-between py-1 border-bottom">
            <span className="text-muted">Engaged</span>
            <span className="fw-semibold">{validation.leads_with_first_touch.toLocaleString()}</span>
          </div>
          <div className="d-flex justify-content-between py-1 border-bottom">
            <span className="text-muted">Unengaged</span>
            <span className="fw-semibold">{validation.leads_unengaged.toLocaleString()}</span>
          </div>
          <div className="d-flex justify-content-between py-1 border-bottom">
            <span className="text-muted">In Campaigns</span>
            <span className="fw-semibold">{validation.leads_in_campaigns.toLocaleString()}</span>
          </div>
          <div className="d-flex justify-content-between py-1 border-bottom">
            <span className="text-muted">Enrolled</span>
            <span className="fw-semibold">{validation.leads_enrolled.toLocaleString()}</span>
          </div>
          <div className="d-flex justify-content-between py-1">
            <span className="text-muted">Paid</span>
            <span className="fw-semibold">{validation.leads_paid.toLocaleString()}</span>
          </div>
          {allWarnings.length > 0 && (
            <div className="mt-2 pt-2 border-top">
              <div className="fw-semibold text-warning mb-1">Warnings</div>
              {allWarnings.map((w, i) => (
                <div key={i} className="text-muted mb-1">• {w}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface CampaignGraphTabProps {
  fullWidth?: boolean;
}

export default function CampaignGraphTab({ fullWidth = false }: CampaignGraphTabProps) {
  const graphRef = useRef<ForceGraphMethods>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: fullWidth ? 900 : 380, height: fullWidth ? 520 : 600 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [data, setData] = useState<CampaignGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [layoutVersion, setLayoutVersion] = useState(0);

  // Position persistence refs
  const savedPositions = useRef<Record<string, { fx: number; fy: number }>>(
    (() => { try { return JSON.parse(localStorage.getItem(POSITIONS_KEY) || '{}'); } catch { return {}; } })()
  );
  const isDragging = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

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

  // Pause particles when not visible
  useEffect(() => {
    if (!containerRef.current) return;
    const io = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    io.observe(containerRef.current);
    return () => io.disconnect();
  }, []);

  // Build graph data with sqrt-scaled sizes and position persistence
  const graphData = useMemo(() => {
    if (!data) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
    const maxCount = Math.max(...data.nodes.map((n) => n.count), 1);
    const sqrtMax = Math.sqrt(maxCount);

    const nodes: GraphNode[] = data.nodes.map((n) => {
      const colors = getNodeColors(n);
      const minR = fullWidth ? 12 : 8;
      const maxR = fullWidth ? 42 : 30;
      return {
        id: n.id,
        type: n.type,
        label: n.label,
        count: n.count,
        color: colors.color,
        bg: colors.bg,
        val: minR + (Math.sqrt(n.count) / sqrtMax) * (maxR - minR),
        col: COLUMN_CONFIG[n.type] ?? 2,
        metrics: n.metrics,
        source_breakdown: n.source_breakdown,
      };
    });

    // Assign positions: use saved positions if available, else compute by column
    const columns = new Map<number, GraphNode[]>();
    nodes.forEach((n) => {
      if (!columns.has(n.col)) columns.set(n.col, []);
      columns.get(n.col)!.push(n);
    });

    const paddingY = fullWidth ? 50 : 40;
    columns.forEach((colNodes, colIdx) => {
      const x = COLUMN_X_PCT[colIdx] * dimensions.width;
      const usableHeight = dimensions.height - paddingY * 2;
      const spacing = usableHeight / (colNodes.length + 1);
      colNodes.forEach((n, i) => {
        const saved = savedPositions.current[n.id];
        if (saved) {
          // Validate saved position is still within zone
          const zone = ZONE_RANGES[n.type];
          if (zone) {
            n.fx = Math.max(zone[0] * dimensions.width, Math.min(zone[1] * dimensions.width, saved.fx));
          } else {
            n.fx = saved.fx;
          }
          n.fy = saved.fy;
        } else {
          n.fx = x;
          n.fy = paddingY + spacing * (i + 1);
        }
      });
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

    // Data validation
    const warnings: string[] = [];
    const totalSources = nodes.filter(n => n.type === 'source').reduce((s, n) => s + n.count, 0);
    const totalEntries = nodes.filter(n => n.type === 'entry').reduce((s, n) => s + n.count, 0);
    if (totalSources > 0 && Math.abs(totalSources - totalEntries) / totalSources > 0.2) {
      warnings.push(`Source total (${totalSources}) vs Entry total (${totalEntries}) mismatch >20%`);
    }
    links.forEach(link => {
      const srcNode = nodes.find(n => n.id === link.source);
      if (srcNode && link.volume > srcNode.count) {
        warnings.push(`Edge ${link.source}\u2192${link.target}: volume (${link.volume}) > source count (${srcNode.count})`);
      }
    });

    // Edge direction validation
    const nodeTypeMap = new Map(nodes.map(n => [n.id, n.type]));
    links.forEach(link => {
      const srcCol = COLUMN_CONFIG[nodeTypeMap.get(link.source) || ''] ?? -1;
      const tgtCol = COLUMN_CONFIG[nodeTypeMap.get(link.target) || ''] ?? -1;
      if (srcCol >= tgtCol) {
        warnings.push(`Invalid edge direction: ${link.source} (col ${srcCol}) \u2192 ${link.target} (col ${tgtCol})`);
      }
    });

    // Update warnings state (deferred to avoid render-during-render)
    setTimeout(() => setValidationWarnings(warnings), 0);

    return { nodes, links };
    // eslint-disable-next-line
  }, [data, dimensions.width, dimensions.height, fullWidth, layoutVersion]);

  // Max volume for scaling
  const maxVolume = useMemo(
    () => Math.max(...graphData.links.map((l) => l.volume), 1),
    [graphData.links]
  );

  // Connected set for path highlighting (from selected node, edge, OR source filter)
  const highlightNodeId = sourceFilter || (selectedNode ? selectedNode.id : null) || (selectedEdge ? selectedEdge.from : null);
  const connectedSet = useMemo(() => {
    if (!highlightNodeId) return new Set<string>();
    const set = new Set<string>();
    const adj = new Map<string, string[]>();
    graphData.links.forEach((l) => {
      const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
      if (!adj.has(s)) adj.set(s, []);
      if (!adj.has(t)) adj.set(t, []);
      adj.get(s)!.push(t);
      adj.get(t)!.push(s);
    });
    const queue = [highlightNodeId];
    set.add(highlightNodeId);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nb of adj.get(cur) || []) {
        if (!set.has(nb)) { set.add(nb); queue.push(nb); }
      }
    }
    return set;
  }, [highlightNodeId, graphData.links]);

  // Zoom to fit — fast since layout is deterministic
  useEffect(() => {
    const timer = setTimeout(() => { graphRef.current?.zoomToFit(400, 30); }, 200);
    return () => clearTimeout(timer);
  }, [graphData]);

  useEffect(() => {
    const timer = setTimeout(() => { graphRef.current?.zoomToFit(400, 30); }, 100);
    return () => clearTimeout(timer);
  }, [dimensions]);

  // Node rendering
  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const radius = fullWidth ? (18 + n.val * 0.7) : (14 + n.val * 0.5);
      const isHovered = hoveredNode?.id === n.id;
      const isSelected = selectedNode?.id === n.id;
      const fontSize = fullWidth ? Math.max(13 / globalScale, 4) : Math.max(11 / globalScale, 3);
      const isHighActivity = n.count > 50;

      // Dim if not connected to highlighted node
      const dimmed = highlightNodeId && !connectedSet.has(n.id);
      if (dimmed) ctx.globalAlpha = 0.12;

      // High-activity glow
      if (isHighActivity && !isHovered && !dimmed) {
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, radius + 5, 0, 2 * Math.PI);
        ctx.fillStyle = n.bg;
        ctx.globalAlpha = dimmed ? 0.05 : 0.4;
        ctx.fill();
        ctx.globalAlpha = dimmed ? 0.12 : 1;
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
      if (isHovered && !dimmed) {
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

      // Restore alpha
      if (dimmed) ctx.globalAlpha = 1;
    },
    [hoveredNode, selectedNode, connectedSet, fullWidth, highlightNodeId]
  );

  // Declarative link helpers
  const getLinkColor = useCallback((link: any) => {
    const src = link.source as GraphNode;
    const tgt = link.target as GraphNode;
    const volume = (link as GraphLink).volume || 0;

    // Dim if highlight active and link not connected
    if (highlightNodeId) {
      const sId = typeof src === 'object' ? src.id : src;
      const tId = typeof tgt === 'object' ? tgt.id : tgt;
      if (!connectedSet.has(sId as string) || !connectedSet.has(tId as string)) {
        return 'rgba(160, 174, 192, 0.06)';
      }
    }

    const alpha = 0.3 + (Math.sqrt(volume) / Math.sqrt(maxVolume)) * 0.5;
    return `rgba(160, 174, 192, ${alpha})`;
  }, [highlightNodeId, connectedSet, maxVolume]);

  const getLinkWidth = useCallback((link: any) => {
    const volume = (link as GraphLink).volume || 0;
    return 1 + (Math.sqrt(volume) / Math.sqrt(maxVolume)) * 4;
  }, [maxVolume]);

  const getParticleCount = useCallback((link: any) => {
    if (!isVisible || isDragging.current) return 0;
    const volume = (link as GraphLink).volume || 0;
    if (maxVolume === 0 || volume === 0) return 0;

    // If filtering, only animate highlighted edges
    if (highlightNodeId) {
      const src = link.source as GraphNode;
      const tgt = link.target as GraphNode;
      const sId = typeof src === 'object' ? src.id : src;
      const tId = typeof tgt === 'object' ? tgt.id : tgt;
      if (!connectedSet.has(sId as string) || !connectedSet.has(tId as string)) return 0;
    }

    return Math.max(1, Math.round((volume / maxVolume) * 4));
  }, [maxVolume, isVisible, highlightNodeId, connectedSet]);

  const getParticleSpeed = useCallback((link: any) => {
    const volume = (link as GraphLink).volume || 0;
    return 0.004 + (volume / maxVolume) * 0.008;
  }, [maxVolume]);

  const getParticleWidth = useCallback((link: any) => {
    const volume = (link as GraphLink).volume || 0;
    return 1.5 + (volume / maxVolume) * 3;
  }, [maxVolume]);

  const getParticleColor = useCallback((link: any) => {
    const tgt = link.target as GraphNode;
    if (typeof tgt === 'object' && tgt.type) {
      const colors = TYPE_COLORS[tgt.type];
      return colors ? colors.color + '99' : 'rgba(49, 151, 149, 0.6)';
    }
    return 'rgba(49, 151, 149, 0.6)';
  }, []);

  const getLinkLabel = useCallback((link: any) => {
    const l = link as GraphLink;
    if (l.volume <= 0) return l.label;
    const src = link.source as GraphNode;
    const srcCount = typeof src === 'object' ? src.count : 0;
    const pct = srcCount > 0 ? ((l.volume / srcCount) * 100).toFixed(1) : '—';
    return `${l.label}: ${l.volume.toLocaleString()} (${pct}%)`;
  }, []);

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node as GraphNode | null);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    setSelectedEdge(null);
    setSelectedNode(node as GraphNode);
  }, []);

  const handleLinkClick = useCallback((link: any) => {
    const src = link.source as GraphNode;
    const tgt = link.target as GraphNode;
    const srcId = typeof src === 'object' ? src.id : String(src);
    const tgtId = typeof tgt === 'object' ? tgt.id : String(tgt);
    const srcLabel = typeof src === 'object' ? src.label : srcId;
    const tgtLabel = typeof tgt === 'object' ? tgt.label : tgtId;
    setSelectedNode(null);
    setSelectedEdge({
      from: srcId,
      to: tgtId,
      fromLabel: srcLabel,
      toLabel: tgtLabel,
      volume: (link as GraphLink).volume || 0,
      label: (link as GraphLink).label || '',
    });
  }, []);

  // Drag handlers with zone constraints
  const handleNodeDrag = useCallback((node: any) => {
    isDragging.current = true;
    const n = node as GraphNode;
    const zone = ZONE_RANGES[n.type];
    if (zone) {
      const minX = zone[0] * dimensions.width;
      const maxX = zone[1] * dimensions.width;
      n.fx = Math.max(minX, Math.min(maxX, n.x!));
    } else {
      n.fx = n.x;
    }
    n.fy = n.y;
  }, [dimensions.width]);

  const handleNodeDragEnd = useCallback((node: any) => {
    isDragging.current = false;
    const n = node as GraphNode;
    savedPositions.current[n.id] = { fx: n.fx!, fy: n.fy! };
    // Debounced save to localStorage
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(POSITIONS_KEY, JSON.stringify(savedPositions.current)); } catch { /* ignore */ }
    }, 500);
  }, []);

  const resetLayout = useCallback(() => {
    savedPositions.current = {};
    try { localStorage.removeItem(POSITIONS_KEY); } catch { /* ignore */ }
    setLayoutVersion(v => v + 1);
  }, []);

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100 text-muted">
        <div className="spinner-border spinner-border-sm me-2" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <small>Loading system map...</small>
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

  // If a node is selected in compact mode, show drill-down panel
  if (selectedNode && !fullWidth) {
    return (
      <CampaignNodeDetailsPanel
        node={{
          id: selectedNode.id,
          type: selectedNode.type as CampaignGraphNode['type'],
          label: selectedNode.label,
          count: selectedNode.count,
          metrics: selectedNode.metrics,
          source_breakdown: selectedNode.source_breakdown,
        }}
        edges={data?.edges || []}
        allNodes={data?.nodes || []}
        onClose={() => setSelectedNode(null)}
      />
    );
  }

  // If an edge is selected in compact mode, show edge drill-down
  if (selectedEdge && !fullWidth) {
    return <EdgeDetailsPanel edge={selectedEdge} onClose={() => setSelectedEdge(null)} />;
  }

  return (
    <div className="d-flex flex-column h-100">
      {!fullWidth && (
        <div className="p-2 border-bottom">
          <div className="d-flex justify-content-between align-items-center">
            <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
              System Map
            </span>
            <span className="text-muted" style={{ fontSize: '0.65rem' }}>
              {graphData.nodes.length} nodes / {graphData.links.length} edges
            </span>
          </div>
        </div>
      )}

      <div className={`flex-grow-1 ${fullWidth && selectedNode ? 'd-flex' : ''}`} style={{ minHeight: 0 }}>
      <div
        ref={containerRef}
        className={fullWidth && selectedNode ? 'flex-grow-1' : 'h-100'}
        style={{ position: 'relative', minHeight: 0 }}
        onMouseMove={handleMouseMove}
        aria-label="Campaign system map — interactive. Click nodes for details."
      >
        {/* Column header labels */}
        {fullWidth && (
          <div
            className="d-flex justify-content-between px-3"
            style={{
              position: 'absolute',
              top: 6,
              left: 0,
              right: 0,
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            {COLUMN_LABELS.map((label, i) => (
              <span
                key={label}
                style={{
                  position: 'absolute',
                  left: `${COLUMN_X_PCT[i] * 100}%`,
                  transform: 'translateX(-50%)',
                  fontSize: '0.6rem',
                  color: 'var(--color-text-light)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                }}
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Source filter dropdown */}
        {fullWidth && (
          <div style={{ position: 'absolute', top: 6, right: 50, zIndex: 10 }}>
            <select
              className="form-select form-select-sm"
              style={{ fontSize: '0.65rem', width: 130, padding: '2px 6px' }}
              value={sourceFilter || ''}
              onChange={(e) => setSourceFilter(e.target.value || null)}
            >
              {SOURCE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value || ''}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <ForceGraph2D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node: any, color, ctx) => {
            const n = node as GraphNode;
            const radius = fullWidth ? (18 + n.val * 0.7) : (14 + n.val * 0.5);
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
          linkDirectionalParticleSpeed={getParticleSpeed}
          linkDirectionalParticleWidth={getParticleWidth}
          linkDirectionalParticleColor={getParticleColor}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
          onLinkClick={handleLinkClick}
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
            // Draw subtle zone separator lines
            ctx.save();
            ctx.setLineDash([4, 6]);
            ctx.strokeStyle = 'rgba(226, 232, 240, 0.6)';
            ctx.lineWidth = 1 / globalScale;
            [0.23, 0.49, 0.76].forEach(pct => {
              const x = pct * dimensions.width;
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, dimensions.height);
              ctx.stroke();
            });
            ctx.setLineDash([]);
            ctx.restore();
          }}
        />

        {/* Validation bar */}
        {fullWidth && <ValidationBar validation={data?.validation} warnings={validationWarnings} />}

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
            onClick={() => graphRef.current?.zoomToFit(400, 30)}
            title="Reset view"
            aria-label="Reset view"
          >
            ⟳
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            style={{ width: 26, height: 26, padding: 0, fontSize: '0.55rem', background: 'rgba(255,255,255,0.9)' }}
            onClick={resetLayout}
            title="Reset node positions"
            aria-label="Reset layout"
          >
            ↺
          </button>
        </div>

        {/* Legend */}
        <div
          className="d-flex gap-2 flex-wrap align-items-center px-2 py-1"
          style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 10, fontSize: '0.6rem', background: 'rgba(255,255,255,0.9)', borderRadius: 4 }}
        >
          {Object.entries(TYPE_COLORS).map(([type, c]) => (
            <span key={type} className="d-flex align-items-center gap-1">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, display: 'inline-block' }} />
              {type.charAt(0).toUpperCase() + type.slice(1)}
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

      {/* Side panel for fullWidth mode — node or edge details */}
      {fullWidth && selectedNode && (
        <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--color-border)', overflow: 'auto' }}>
          <CampaignNodeDetailsPanel
            node={{
              id: selectedNode.id,
              type: selectedNode.type as CampaignGraphNode['type'],
              label: selectedNode.label,
              count: selectedNode.count,
              metrics: selectedNode.metrics,
              source_breakdown: selectedNode.source_breakdown,
            }}
            edges={data?.edges || []}
            allNodes={data?.nodes || []}
            onClose={() => setSelectedNode(null)}
          />
        </div>
      )}
      {fullWidth && !selectedNode && selectedEdge && (
        <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--color-border)', overflow: 'auto' }}>
          <EdgeDetailsPanel edge={selectedEdge} onClose={() => setSelectedEdge(null)} />
        </div>
      )}
      </div>
    </div>
  );
}
