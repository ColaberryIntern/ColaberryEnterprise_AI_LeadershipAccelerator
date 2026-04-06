import React, { useEffect, useRef, useState, useCallback } from 'react';

interface DbNode { id: string; label: string; type: 'model' | 'service'; x: number; y: number; connections: number; }
interface DbEdge { from: string; to: string; }

interface Props {
  models: string[];
  services: string[];
  repoUrl?: string | null;
}

// Simple spring layout
function layoutNodes(nodes: DbNode[], edges: DbEdge[], width: number, height: number): void {
  // Initialize positions in a circle
  const cx = width / 2, cy = height / 2, r = Math.min(width, height) * 0.35;
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    n.x = cx + r * Math.cos(angle);
    n.y = cy + r * Math.sin(angle);
  });

  // Simple force simulation (50 iterations)
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  for (let iter = 0; iter < 50; iter++) {
    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = 800 / (dist * dist);
        nodes[i].x -= (dx / dist) * force;
        nodes[i].y -= (dy / dist) * force;
        nodes[j].x += (dx / dist) * force;
        nodes[j].y += (dy / dist) * force;
      }
    }
    // Attraction along edges
    for (const edge of edges) {
      const a = nodeMap.get(edge.from);
      const b = nodeMap.get(edge.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (dist - 120) * 0.05;
      a.x += (dx / dist) * force;
      a.y += (dy / dist) * force;
      b.x -= (dx / dist) * force;
      b.y -= (dy / dist) * force;
    }
    // Center gravity
    nodes.forEach(n => { n.x += (cx - n.x) * 0.02; n.y += (cy - n.y) * 0.02; });
  }
}

function stemMatch(a: string, b: string): boolean {
  const sa = a.replace(/\.(ts|tsx|js)$/, '').replace(/(Service|Model|Log|Schema)s?$/i, '').toLowerCase().replace(/[^a-z]/g, '');
  const sb = b.replace(/\.(ts|tsx|js)$/, '').replace(/(Service|Model|Log|Schema)s?$/i, '').toLowerCase().replace(/[^a-z]/g, '');
  return sa.length > 2 && sb.length > 2 && (sa === sb || sa.includes(sb) || sb.includes(sa));
}

export default function ProcessDatabaseGraph({ models, services, repoUrl }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<DbNode | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [nodes, setNodes] = useState<DbNode[]>([]);
  const [edges, setEdges] = useState<DbEdge[]>([]);

  useEffect(() => {
    const dbNodes: DbNode[] = models.map(m => ({ id: `model:${m}`, label: m, type: 'model' as const, x: 0, y: 0, connections: 0 }));
    const svcNodes: DbNode[] = services.map(s => ({ id: `svc:${s}`, label: s, type: 'service' as const, x: 0, y: 0, connections: 0 }));
    const allNodes = [...dbNodes, ...svcNodes];
    const allEdges: DbEdge[] = [];

    // Build edges: service → model (stem matching)
    for (const svc of svcNodes) {
      for (const model of dbNodes) {
        if (stemMatch(svc.label, model.label)) {
          allEdges.push({ from: svc.id, to: model.id });
          svc.connections++;
          model.connections++;
        }
      }
    }

    layoutNodes(allNodes, allEdges, 500, 400);
    setNodes(allNodes);
    setEdges(allEdges);
  }, [models, services]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(t => ({ ...t, scale: Math.max(0.3, Math.min(3, t.scale * delta)) }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'rect') {
      setDragging(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  }, [transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) setTransform(t => ({ ...t, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }));
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  if (models.length === 0 && services.length === 0) {
    return <div className="text-muted small text-center py-4"><i className="bi bi-database me-1"></i>No database models detected</div>;
  }

  const isConnected = (nodeId: string) => edges.some(e => (e.from === nodeId && e.to === hovered) || (e.to === nodeId && e.from === hovered) || e.from === hovered || e.to === hovered);
  const connectedServices = selected ? edges.filter(e => e.from.startsWith('svc:') && e.to === selected.id).map(e => nodes.find(n => n.id === e.from)?.label).filter(Boolean) : [];
  const connectedModels = selected ? edges.filter(e => e.to.startsWith('model:') && e.from === selected.id).map(e => nodes.find(n => n.id === e.to)?.label).filter(Boolean) : [];
  const repoBase = repoUrl ? repoUrl.replace(/\.git$/, '') : null;

  return (
    <div className="d-flex" style={{ height: 350 }}>
      {/* Graph */}
      <div className="flex-grow-1 position-relative" style={{ overflow: 'hidden', background: '#fafbfc', borderRadius: 8 }}>
        <svg ref={svgRef} width="100%" height="100%" onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} style={{ cursor: dragging ? 'grabbing' : 'grab' }}>
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
            {/* Edges */}
            {edges.map((e, i) => {
              const from = nodes.find(n => n.id === e.from);
              const to = nodes.find(n => n.id === e.to);
              if (!from || !to) return null;
              const isHighlighted = hovered && (e.from === hovered || e.to === hovered);
              return <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={isHighlighted ? '#3b82f6' : '#d1d5db'} strokeWidth={isHighlighted ? 2.5 : 1.5} strokeDasharray={isHighlighted ? '' : '4,2'} />;
            })}
            {/* Nodes */}
            {nodes.map(n => {
              const isModel = n.type === 'model';
              const isHovered = hovered === n.id;
              const isSelectedNode = selected?.id === n.id;
              const isRelated = hovered ? isConnected(n.id) : false;
              const size = isModel ? 28 + n.connections * 4 : 22 + n.connections * 3;
              const fill = isModel ? (n.connections > 0 ? '#10b981' : '#f59e0b') : '#3b82f6';
              const opacity = hovered && !isHovered && !isRelated ? 0.3 : 1;
              return (
                <g key={n.id} style={{ cursor: 'pointer', opacity, transition: 'opacity 0.2s' }}
                  onClick={() => setSelected(isSelectedNode ? null : n)}
                  onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)}>
                  {isModel ? (
                    <>{/* Cylinder shape for DB */}
                      <ellipse cx={n.x} cy={n.y - size * 0.3} rx={size * 0.7} ry={size * 0.25} fill={fill} stroke={isSelectedNode ? '#1a365d' : '#fff'} strokeWidth={isSelectedNode ? 3 : 1.5} />
                      <rect x={n.x - size * 0.7} y={n.y - size * 0.3} width={size * 1.4} height={size * 0.6} fill={fill} stroke="none" />
                      <ellipse cx={n.x} cy={n.y + size * 0.3} rx={size * 0.7} ry={size * 0.25} fill={fill} stroke={isSelectedNode ? '#1a365d' : '#fff'} strokeWidth={isSelectedNode ? 3 : 1.5} />
                      <line x1={n.x - size * 0.7} y1={n.y - size * 0.3} x2={n.x - size * 0.7} y2={n.y + size * 0.3} stroke={isSelectedNode ? '#1a365d' : '#fff'} strokeWidth={isSelectedNode ? 3 : 1.5} />
                      <line x1={n.x + size * 0.7} y1={n.y - size * 0.3} x2={n.x + size * 0.7} y2={n.y + size * 0.3} stroke={isSelectedNode ? '#1a365d' : '#fff'} strokeWidth={isSelectedNode ? 3 : 1.5} />
                    </>
                  ) : (
                    <rect x={n.x - size * 0.8} y={n.y - size * 0.5} width={size * 1.6} height={size} rx={4} fill={fill} stroke={isSelectedNode ? '#1a365d' : '#fff'} strokeWidth={isSelectedNode ? 3 : 1.5} />
                  )}
                  <text x={n.x} y={n.y + size + 12} textAnchor="middle" fontSize={9} fill="#374151" fontWeight={isHovered ? 700 : 400}>{n.label.replace(/\.(ts|tsx)$/, '')}</text>
                </g>
              );
            })}
          </g>
        </svg>
        {/* Legend */}
        <div style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 9, color: '#9ca3af', display: 'flex', gap: 10 }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#10b981', borderRadius: '50%', marginRight: 3 }}></span>Model</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#3b82f6', borderRadius: 2, marginRight: 3 }}></span>Service</span>
          <span style={{ color: '#d1d5db' }}>Scroll to zoom · Drag to pan</span>
        </div>
      </div>

      {/* Side Panel */}
      {selected && (
        <div style={{ width: 200, borderLeft: '1px solid var(--color-border)', padding: 10, fontSize: 11, overflowY: 'auto' }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong style={{ color: 'var(--color-primary)' }}>{selected.label.replace(/\.(ts|tsx)$/, '')}</strong>
            <button className="btn btn-link btn-sm p-0 text-muted" onClick={() => setSelected(null)}><i className="bi bi-x"></i></button>
          </div>
          <div className="text-muted mb-2" style={{ fontSize: 9 }}>{selected.type === 'model' ? 'Database Model' : 'Backend Service'}</div>
          {repoBase && <a href={`${repoBase}/blob/main/${selected.label}`} target="_blank" rel="noopener noreferrer" className="d-block mb-2" style={{ fontSize: 9 }}><i className="bi bi-github me-1"></i>View on GitHub</a>}
          <div className="mb-1 fw-medium">Connections ({selected.connections})</div>
          {selected.type === 'model' && connectedServices.length > 0 && (
            <div className="mb-2">{connectedServices.map((s, i) => <div key={i} className="d-flex align-items-center gap-1 mb-1"><i className="bi bi-gear" style={{ color: '#3b82f6', fontSize: 9 }}></i><span>{s}</span></div>)}</div>
          )}
          {selected.type === 'service' && connectedModels.length > 0 && (
            <div className="mb-2">{connectedModels.map((m, i) => <div key={i} className="d-flex align-items-center gap-1 mb-1"><i className="bi bi-database" style={{ color: '#10b981', fontSize: 9 }}></i><span>{m}</span></div>)}</div>
          )}
          {selected.connections === 0 && <div className="text-muted" style={{ fontSize: 9 }}>No connections detected</div>}
        </div>
      )}
    </div>
  );
}
