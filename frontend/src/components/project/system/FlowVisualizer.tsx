import React from 'react';

interface Props {
  hasBackend: boolean;
  hasFrontend: boolean;
  hasAgents: boolean;
  hasDatabase: boolean;
}

export default function FlowVisualizer({ hasBackend, hasFrontend, hasAgents, hasDatabase }: Props) {
  const nodes = [
    { id: 'trigger', label: 'User Action', shape: 'rounded' as const, x: 120, y: 25, color: '#10b981', active: hasFrontend },
    { id: 'api', label: 'API Request', shape: 'hexagon' as const, x: 120, y: 80, color: '#3b82f6', active: hasBackend },
    { id: 'validate', label: 'Validate?', shape: 'diamond' as const, x: 120, y: 140, color: '#f59e0b', active: hasBackend },
    { id: 'service', label: 'Process', shape: 'rect' as const, x: 65, y: 200, color: '#6366f1', active: hasBackend },
    { id: 'error', label: 'Error', shape: 'rect' as const, x: 190, y: 200, color: '#ef4444', active: hasBackend },
    { id: 'agent', label: 'AI Agent', shape: 'circle' as const, x: 65, y: 260, color: '#8b5cf6', active: hasAgents },
    { id: 'db', label: 'Save', shape: 'cylinder' as const, x: 65, y: 320, color: '#f59e0b', active: hasDatabase },
    { id: 'response', label: 'Response', shape: 'rounded' as const, x: 120, y: 375, color: '#10b981', active: true },
  ];

  const sc = (active: boolean) => active ? { fill: '#f0f9f4', stroke: '#10b981' } : { fill: '#fafafa', stroke: '#e2e8f0' };
  const w = 90, h = 30;

  return (
    <svg viewBox="0 0 240 400" style={{ width: '100%', height: 400 }}>
      <defs>
        <marker id="fa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Arrows */}
      <line x1={120} y1={40} x2={120} y2={65} stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#fa)" />
      <line x1={120} y1={95} x2={120} y2={120} stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#fa)" />
      {/* Diamond branches */}
      <line x1={95} y1={155} x2={65} y2={185} stroke="#10b981" strokeWidth={1.5} markerEnd="url(#fa)" />
      <line x1={145} y1={155} x2={190} y2={185} stroke="#ef4444" strokeWidth={1.5} markerEnd="url(#fa)" />
      {/* Success path */}
      <line x1={65} y1={215} x2={65} y2={245} stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#fa)" />
      <line x1={65} y1={275} x2={65} y2={305} stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#fa)" />
      <line x1={65} y1={340} x2={120} y2={360} stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#fa)" />
      {/* Error path to response */}
      <line x1={190} y1={215} x2={190} y2={360} stroke="#ef4444" strokeWidth={1} strokeDasharray="4,3" />
      <line x1={190} y1={360} x2={145} y2={375} stroke="#ef4444" strokeWidth={1} strokeDasharray="4,3" markerEnd="url(#fa)" />

      {/* Yes/No labels on diamond */}
      <text x={75} y={168} fontSize={8} fill="#10b981" fontWeight={600}>Yes</text>
      <text x={155} y={168} fontSize={8} fill="#ef4444" fontWeight={600}>No</text>

      {/* Nodes */}
      {nodes.map(n => {
        const s = sc(n.active);
        const dash = n.active ? 'none' : '4,3';
        return (
          <g key={n.id}>
            {n.shape === 'rounded' && <rect x={n.x - w/2} y={n.y - h/2} width={w} height={h} rx={10} fill={s.fill} stroke={s.stroke} strokeWidth={1.5} strokeDasharray={dash} />}
            {n.shape === 'hexagon' && <polygon points={`${n.x-w/2},${n.y} ${n.x-w/2+10},${n.y-h/2} ${n.x+w/2-10},${n.y-h/2} ${n.x+w/2},${n.y} ${n.x+w/2-10},${n.y+h/2} ${n.x-w/2+10},${n.y+h/2}`} fill={s.fill} stroke={s.stroke} strokeWidth={1.5} strokeDasharray={dash} />}
            {n.shape === 'rect' && <rect x={n.x - w/2} y={n.y - h/2} width={w} height={h} rx={3} fill={s.fill} stroke={s.stroke} strokeWidth={1.5} strokeDasharray={dash} />}
            {n.shape === 'circle' && <ellipse cx={n.x} cy={n.y} rx={w/2} ry={h/2} fill={s.fill} stroke={s.stroke} strokeWidth={1.5} strokeDasharray={dash} />}
            {n.shape === 'diamond' && <polygon points={`${n.x},${n.y-h/2-5} ${n.x+w/2-10},${n.y} ${n.x},${n.y+h/2+5} ${n.x-w/2+10},${n.y}`} fill={s.fill} stroke={s.stroke} strokeWidth={1.5} strokeDasharray={dash} />}
            {n.shape === 'cylinder' && (
              <>
                <rect x={n.x - w/2} y={n.y - h/2 + 5} width={w} height={h - 5} rx={3} fill={s.fill} stroke={s.stroke} strokeWidth={1.5} strokeDasharray={dash} />
                <ellipse cx={n.x} cy={n.y - h/2 + 5} rx={w/2} ry={5} fill={s.fill} stroke={s.stroke} strokeWidth={1.5} strokeDasharray={dash} />
              </>
            )}
            <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={9} fontWeight={600} fill={n.active ? n.color : '#9ca3af'}>{n.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
