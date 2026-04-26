/**
 * AgentNetworkGraph — Interactive SVG force-directed agent visualization
 *
 * Draggable nodes with Cory as center hub. Agents color-coded by department.
 * Lines show connections between agents and their department hub.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

interface Agent { name: string; role: string; type: string }
interface Department { name: string; description: string; color: string; agents: Agent[] }

interface Node {
  id: string;
  label: string;
  abbr: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  type: 'hub' | 'dept' | 'agent';
  role?: string;
  department?: string;
}

interface Link { source: string; target: string; color: string }

interface Props {
  departments: Department[];
  width?: number;
  height?: number;
  onAgentClick?: (agent: { name: string; role: string; department: string }) => void;
}

function abbreviate(name: string): string {
  const words = name.split(/\s+/).filter(w => w.length > 1);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default function AgentNetworkGraph({ departments, width = 600, height = 450, onAgentClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const animRef = useRef<number>(0);

  // Build graph from departments
  useEffect(() => {
    if (departments.length === 0) return;

    const cx = width / 2;
    const cy = height / 2;
    const newNodes: Node[] = [];
    const newLinks: Link[] = [];

    // Cory hub (center)
    newNodes.push({ id: 'cory', label: 'Cory AI', abbr: 'AI', color: '#1a365d', x: cx, y: cy, vx: 0, vy: 0, fx: cx, fy: cy, type: 'hub', role: 'AI Control Tower' });

    // Department nodes (ring around center)
    const deptRadius = Math.min(width, height) * 0.28;
    departments.forEach((dept, di) => {
      const angle = (di / departments.length) * Math.PI * 2 - Math.PI / 2;
      const dx = cx + Math.cos(angle) * deptRadius;
      const dy = cy + Math.sin(angle) * deptRadius;
      const deptId = `dept-${di}`;

      newNodes.push({ id: deptId, label: dept.name, abbr: abbreviate(dept.name), color: dept.color, x: dx, y: dy, vx: 0, vy: 0, fx: null, fy: null, type: 'dept', department: dept.name });
      newLinks.push({ source: 'cory', target: deptId, color: dept.color + '40' });

      // Agent nodes (around department)
      const agentRadius = Math.min(width, height) * 0.15;
      dept.agents.forEach((agent, ai) => {
        const aAngle = angle + ((ai - (dept.agents.length - 1) / 2) * 0.4);
        const ax = dx + Math.cos(aAngle) * agentRadius + (Math.random() - 0.5) * 20;
        const ay = dy + Math.sin(aAngle) * agentRadius + (Math.random() - 0.5) * 20;
        const agentId = `agent-${di}-${ai}`;

        newNodes.push({ id: agentId, label: agent.name, abbr: abbreviate(agent.name), color: dept.color, x: ax, y: ay, vx: 0, vy: 0, fx: null, fy: null, type: 'agent', role: agent.role, department: dept.name });
        newLinks.push({ source: deptId, target: agentId, color: dept.color + '30' });
      });
    });

    setNodes(newNodes);
    setLinks(newLinks);
  }, [departments, width, height]);

  // Simple force simulation
  useEffect(() => {
    if (nodes.length === 0) return;

    const simulate = () => {
      setNodes(prev => {
        const updated = prev.map(n => ({ ...n }));

        // Repulsion between all nodes
        for (let i = 0; i < updated.length; i++) {
          for (let j = i + 1; j < updated.length; j++) {
            const dx = updated[j].x - updated[i].x;
            const dy = updated[j].y - updated[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const minDist = updated[i].type === 'hub' || updated[j].type === 'hub' ? 60 : 35;
            if (dist < minDist * 2) {
              const force = (minDist * 2 - dist) * 0.02;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              if (!updated[i].fx) { updated[i].vx -= fx; updated[i].vy -= fy; }
              if (!updated[j].fx) { updated[j].vx += fx; updated[j].vy += fy; }
            }
          }
        }

        // Apply velocity + damping
        for (const n of updated) {
          if (n.fx !== null) { n.x = n.fx; n.y = n.fy!; continue; }
          n.vx *= 0.85;
          n.vy *= 0.85;
          n.x += n.vx;
          n.y += n.vy;
          // Keep in bounds
          n.x = Math.max(20, Math.min(width - 20, n.x));
          n.y = Math.max(20, Math.min(height - 20, n.y));
        }

        return updated;
      });

      animRef.current = requestAnimationFrame(simulate);
    };

    animRef.current = requestAnimationFrame(simulate);
    // Stop after 3 seconds
    const stopTimer = setTimeout(() => cancelAnimationFrame(animRef.current), 3000);
    return () => { cancelAnimationFrame(animRef.current); clearTimeout(stopTimer); };
  }, [nodes.length > 0]);

  // Drag handling
  const handleMouseDown = useCallback((nodeId: string) => {
    setDragNode(nodeId);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragNode || !svgRef.current) return;
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setNodes(prev => prev.map(n => n.id === dragNode ? { ...n, x, y, fx: x, fy: y } : n));
  }, [dragNode]);

  const handleMouseUp = useCallback(() => {
    if (dragNode) {
      setNodes(prev => prev.map(n => n.id === dragNode ? { ...n, fx: n.type === 'hub' ? n.x : null, fy: n.type === 'hub' ? n.y : null } : n));
    }
    setDragNode(null);
  }, [dragNode]);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const hoveredInfo = hoveredNode ? nodeMap.get(hoveredNode) : null;

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} width={width} height={height} style={{ cursor: dragNode ? 'grabbing' : 'default' }}
        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>

        {/* Links */}
        {links.map((link, i) => {
          const s = nodeMap.get(link.source);
          const t = nodeMap.get(link.target);
          if (!s || !t) return null;
          return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={link.color} strokeWidth={1.5} strokeDasharray={s.type === 'hub' ? '4,3' : 'none'} />;
        })}

        {/* Nodes */}
        {nodes.map(node => {
          const r = node.type === 'hub' ? 24 : node.type === 'dept' ? 18 : 14;
          const isHovered = hoveredNode === node.id;
          return (
            <g key={node.id}
              onMouseDown={() => handleMouseDown(node.id)}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() => onAgentClick && node.type === 'agent' && onAgentClick({ name: node.label, role: node.role || '', department: node.department || '' })}
              style={{ cursor: 'pointer' }}>
              {/* Glow on hover */}
              {isHovered && <circle cx={node.x} cy={node.y} r={r + 6} fill={node.color} opacity={0.15} />}
              {/* Node circle */}
              <circle cx={node.x} cy={node.y} r={r}
                fill={node.type === 'hub' ? node.color : '#fff'}
                stroke={node.color}
                strokeWidth={node.type === 'hub' ? 0 : 2.5}
                style={{ transition: 'r 0.2s' }} />
              {/* Status dot */}
              {node.type === 'agent' && <circle cx={node.x + r * 0.6} cy={node.y - r * 0.6} r={3} fill="#10b981" />}
              {/* Label */}
              <text x={node.x} y={node.y + (node.type === 'hub' ? 1 : 1)} textAnchor="middle" dominantBaseline="central"
                fill={node.type === 'hub' ? '#fff' : node.color}
                fontSize={node.type === 'hub' ? 11 : node.type === 'dept' ? 9 : 8}
                fontWeight={node.type === 'hub' ? 700 : 600}>
                {node.abbr}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredInfo && (
        <div style={{
          position: 'absolute', bottom: 8, left: 8, right: 8,
          background: '#fff', borderRadius: 8, padding: '8px 12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0',
          fontSize: 11, zIndex: 10,
        }}>
          <div className="fw-bold" style={{ color: hoveredInfo.color }}>{hoveredInfo.label}</div>
          {hoveredInfo.role && <div className="text-muted" style={{ fontSize: 10 }}>{hoveredInfo.role}</div>}
          {hoveredInfo.department && hoveredInfo.type === 'agent' && <div style={{ fontSize: 9, color: '#94a3b8' }}>{hoveredInfo.department}</div>}
        </div>
      )}
    </div>
  );
}
