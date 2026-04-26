/**
 * AgentNetworkGraph — Interactive SVG force-directed agent visualization
 *
 * Spring physics with draggable nodes. Cory as center hub.
 * Agents color-coded by department. Human agents shown distinctly.
 * Active agents can glow during simulation.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

interface Agent { name: string; role: string; type: string; hitl_required?: boolean }
interface Department { name: string; description: string; color: string; agents: Agent[] }

interface Node {
  id: string; label: string; abbr: string; color: string;
  x: number; y: number; vx: number; vy: number;
  fx: number | null; fy: number | null;
  targetX: number; targetY: number;
  type: 'hub' | 'dept' | 'agent';
  role?: string; department?: string; hitl?: boolean;
}

interface Link { source: string; target: string; color: string }

interface Props {
  departments: Department[];
  width?: number;
  height?: number;
  activeAgents?: string[]; // agent names that should glow
  onAgentClick?: (agent: { name: string; role: string; department: string }) => void;
}

function abbreviate(name: string): string {
  const words = name.split(/\s+/).filter(w => w.length > 1);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default function AgentNetworkGraph({ departments, width = 600, height = 450, activeAgents = [], onAgentClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const animRef = useRef<number>(0);
  const frameCount = useRef(0);

  // Build graph from departments
  useEffect(() => {
    if (departments.length === 0) return;
    const cx = width / 2; const cy = height / 2;
    const newNodes: Node[] = [];
    const newLinks: Link[] = [];

    newNodes.push({ id: 'cory', label: 'Cory AI', abbr: 'AI', color: '#1a365d', x: cx, y: cy, vx: 0, vy: 0, fx: cx, fy: cy, targetX: cx, targetY: cy, type: 'hub', role: 'AI Control Tower' });

    const deptRadius = Math.min(width, height) * 0.28;
    departments.forEach((dept, di) => {
      const angle = (di / departments.length) * Math.PI * 2 - Math.PI / 2;
      const dx = cx + Math.cos(angle) * deptRadius;
      const dy = cy + Math.sin(angle) * deptRadius;
      const deptId = `dept-${di}`;

      newNodes.push({ id: deptId, label: dept.name, abbr: abbreviate(dept.name), color: dept.color, x: dx + (Math.random() - 0.5) * 30, y: dy + (Math.random() - 0.5) * 30, vx: 0, vy: 0, fx: null, fy: null, targetX: dx, targetY: dy, type: 'dept', department: dept.name });
      newLinks.push({ source: 'cory', target: deptId, color: dept.color + '40' });

      const agentRadius = Math.min(width, height) * 0.14;
      dept.agents.forEach((agent, ai) => {
        const aAngle = angle + ((ai - (dept.agents.length - 1) / 2) * 0.45);
        const ax = dx + Math.cos(aAngle) * agentRadius;
        const ay = dy + Math.sin(aAngle) * agentRadius;
        const agentId = `agent-${di}-${ai}`;

        newNodes.push({
          id: agentId, label: agent.name, abbr: abbreviate(agent.name), color: dept.color,
          x: ax + (Math.random() - 0.5) * 40, y: ay + (Math.random() - 0.5) * 40,
          vx: 0, vy: 0, fx: null, fy: null, targetX: ax, targetY: ay,
          type: 'agent', role: agent.role, department: dept.name, hitl: agent.hitl_required,
        });
        newLinks.push({ source: deptId, target: agentId, color: dept.color + '25' });
      });
    });

    setNodes(newNodes);
    setLinks(newLinks);
  }, [departments, width, height]);

  // Spring physics simulation
  useEffect(() => {
    if (nodes.length === 0) return;

    const simulate = () => {
      frameCount.current++;
      setNodes(prev => {
        const updated = prev.map(n => ({ ...n }));
        const springK = 0.03; // spring constant
        const damping = 0.88;
        const repulsion = 800;

        for (const n of updated) {
          if (n.fx !== null) { n.x = n.fx; n.y = n.fy!; continue; }

          // Spring force toward target position
          const sdx = n.targetX - n.x;
          const sdy = n.targetY - n.y;
          n.vx += sdx * springK;
          n.vy += sdy * springK;

          // Repulsion from other nodes
          for (const other of updated) {
            if (other.id === n.id) continue;
            const dx = n.x - other.x;
            const dy = n.y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const minDist = 30;
            if (dist < minDist * 3) {
              const force = repulsion / (dist * dist);
              n.vx += (dx / dist) * force * 0.01;
              n.vy += (dy / dist) * force * 0.01;
            }
          }

          // Damping
          n.vx *= damping;
          n.vy *= damping;
          n.x += n.vx;
          n.y += n.vy;

          // Bounds
          n.x = Math.max(18, Math.min(width - 18, n.x));
          n.y = Math.max(18, Math.min(height - 18, n.y));
        }

        return updated;
      });

      // Keep running for spring effect
      if (frameCount.current < 300) {
        animRef.current = requestAnimationFrame(simulate);
      }
    };

    frameCount.current = 0;
    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes.length > 0]);

  // Drag handling with spring release
  const handleMouseDown = useCallback((nodeId: string) => { setDragNode(nodeId); }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragNode || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setNodes(prev => prev.map(n => n.id === dragNode ? { ...n, x, y, fx: x, fy: y } : n));
  }, [dragNode]);

  const handleMouseUp = useCallback(() => {
    if (dragNode) {
      // Release: remove fixed position, let spring pull back
      setNodes(prev => prev.map(n => n.id === dragNode ? { ...n, fx: n.type === 'hub' ? n.x : null, fy: n.type === 'hub' ? n.y : null, vx: 0, vy: 0 } : n));
      // Restart simulation for spring-back
      frameCount.current = 0;
    }
    setDragNode(null);
  }, [dragNode]);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const hoveredInfo = hoveredNode ? nodeMap.get(hoveredNode) : null;
  const activeSet = new Set(activeAgents.map(a => a.toLowerCase()));

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} width={width} height={height} style={{ cursor: dragNode ? 'grabbing' : 'default' }}
        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>

        {/* Links */}
        {links.map((link, i) => {
          const s = nodeMap.get(link.source);
          const t = nodeMap.get(link.target);
          if (!s || !t) return null;
          const isActive = activeSet.has(s.label.toLowerCase()) || activeSet.has(t.label.toLowerCase());
          return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
            stroke={isActive ? '#10b981' : link.color}
            strokeWidth={isActive ? 2.5 : 1.5}
            strokeDasharray={s.type === 'hub' ? '4,3' : 'none'}
            style={{ transition: 'stroke 0.3s, stroke-width 0.3s' }} />;
        })}

        {/* Nodes */}
        {nodes.map(node => {
          const r = node.type === 'hub' ? 24 : node.type === 'dept' ? 18 : 14;
          const isHovered = hoveredNode === node.id;
          const isActive = activeSet.has(node.label.toLowerCase());
          const isHuman = node.hitl;
          return (
            <g key={node.id}
              onMouseDown={() => handleMouseDown(node.id)}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() => onAgentClick && node.type === 'agent' && onAgentClick({ name: node.label, role: node.role || '', department: node.department || '' })}
              style={{ cursor: 'grab' }}>
              {/* Active glow */}
              {isActive && <circle cx={node.x} cy={node.y} r={r + 8} fill="#10b981" opacity={0.25} style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />}
              {/* Hover glow */}
              {isHovered && !isActive && <circle cx={node.x} cy={node.y} r={r + 6} fill={node.color} opacity={0.12} />}
              {/* Node circle */}
              <circle cx={node.x} cy={node.y} r={r}
                fill={node.type === 'hub' ? node.color : isActive ? '#10b981' : '#fff'}
                stroke={isActive ? '#10b981' : node.color}
                strokeWidth={node.type === 'hub' ? 0 : isHuman ? 3 : 2}
                strokeDasharray={isHuman ? '4,2' : 'none'}
                style={{ transition: 'fill 0.3s, stroke 0.3s' }} />
              {/* Human badge */}
              {isHuman && node.type === 'agent' && (
                <g>
                  <circle cx={node.x + r * 0.7} cy={node.y - r * 0.7} r={6} fill="#f59e0b" />
                  <text x={node.x + r * 0.7} y={node.y - r * 0.7 + 1} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={7} fontWeight={700}>H</text>
                </g>
              )}
              {/* Status dot (non-human) */}
              {!isHuman && node.type === 'agent' && <circle cx={node.x + r * 0.6} cy={node.y - r * 0.6} r={3} fill={isActive ? '#10b981' : '#94a3b8'} />}
              {/* Label */}
              <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="central"
                fill={node.type === 'hub' ? '#fff' : isActive ? '#fff' : node.color}
                fontSize={node.type === 'hub' ? 11 : node.type === 'dept' ? 9 : 8}
                fontWeight={node.type === 'hub' ? 700 : 600}>
                {node.abbr}
              </text>
            </g>
          );
        })}

        <style>{`@keyframes pulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.4; } }`}</style>
      </svg>

      {/* Tooltip */}
      {hoveredInfo && (
        <div style={{
          position: 'absolute', bottom: 8, left: 8, right: 8,
          background: '#fff', borderRadius: 8, padding: '8px 12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0',
          fontSize: 11, zIndex: 10,
        }}>
          <div className="d-flex align-items-center gap-2">
            <span className="fw-bold" style={{ color: hoveredInfo.color }}>{hoveredInfo.label}</span>
            {hoveredInfo.hitl && <span className="badge" style={{ background: '#f59e0b20', color: '#92400e', fontSize: 8 }}>Human Required</span>}
          </div>
          {hoveredInfo.role && <div className="text-muted" style={{ fontSize: 10 }}>{hoveredInfo.role}</div>}
          {hoveredInfo.department && hoveredInfo.type === 'agent' && <div style={{ fontSize: 9, color: '#94a3b8' }}>{hoveredInfo.department}</div>}
        </div>
      )}
    </div>
  );
}
