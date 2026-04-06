import React, { useState } from 'react';

interface Props {
  links: { backend?: string[]; frontend?: string[]; agents?: string[]; models?: string[] };
  usability: { backend?: string; frontend?: string; agent?: string };
  onNodeClick?: (layer: string, files: string[]) => void;
  previewLayer?: string | null; // layer being previewed (shows ghosted)
}

interface LayerDef {
  id: string;
  label: string;
  files: string[];
  status: string;
  x: number;
  y: number;
  shape: 'rounded' | 'hexagon' | 'rect' | 'circle' | 'cylinder';
  color: string;
}

const STATUS_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  ready: { fill: '#10b98110', stroke: '#10b981', text: '#10b981' },
  partial: { fill: '#f59e0b10', stroke: '#f59e0b', text: '#f59e0b' },
  missing: { fill: '#fafafa', stroke: '#e2e8f0', text: '#9ca3af' },
  preview: { fill: '#3b82f610', stroke: '#3b82f6', text: '#3b82f6' },
};

function NodeShape({ layer, hovered, onClick }: { layer: LayerDef; hovered: boolean; onClick: () => void }) {
  const isPreview = layer.status === 'preview';
  const sc = STATUS_COLORS[layer.status] || STATUS_COLORS.missing;
  const w = 140, h = 50;
  const cx = layer.x, cy = layer.y;

  const commonStyle = {
    fill: sc.fill,
    stroke: hovered ? 'var(--color-primary)' : sc.stroke,
    strokeWidth: hovered ? 2.5 : isPreview ? 1.5 : 2,
    strokeDasharray: layer.status === 'missing' ? '6,3' : isPreview ? '4,4' : 'none',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  };

  const pulseClass = layer.status === 'ready' && layer.files.length > 0 ? 'node-pulse' : '';

  return (
    <g onClick={onClick} className={pulseClass}>
      {/* Shape by type */}
      {layer.shape === 'rounded' && <rect x={cx - w/2} y={cy - h/2} width={w} height={h} rx={12} {...commonStyle} />}
      {layer.shape === 'hexagon' && <polygon points={`${cx-w/2},${cy} ${cx-w/2+15},${cy-h/2} ${cx+w/2-15},${cy-h/2} ${cx+w/2},${cy} ${cx+w/2-15},${cy+h/2} ${cx-w/2+15},${cy+h/2}`} {...commonStyle} />}
      {layer.shape === 'rect' && <rect x={cx - w/2} y={cy - h/2} width={w} height={h} rx={4} {...commonStyle} />}
      {layer.shape === 'circle' && <ellipse cx={cx} cy={cy} rx={w/2} ry={h/2} {...commonStyle} />}
      {layer.shape === 'cylinder' && (
        <>
          <rect x={cx - w/2} y={cy - h/2 + 8} width={w} height={h - 8} rx={4} {...commonStyle} />
          <ellipse cx={cx} cy={cy - h/2 + 8} rx={w/2} ry={8} {...commonStyle} />
          <ellipse cx={cx} cy={cy + h/2} rx={w/2} ry={8} fill={sc.fill} stroke={sc.stroke} strokeWidth={commonStyle.strokeWidth} strokeDasharray={commonStyle.strokeDasharray} />
        </>
      )}

      {/* Status dot */}
      <circle cx={cx + w/2 - 5} cy={cy - h/2 + 5} r={5} fill={sc.stroke} />

      {/* Label */}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={sc.text}>{layer.label}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={9} fill="#9ca3af">
        {layer.files.length} {layer.files.length === 1 ? 'file' : 'files'}{layer.status === 'missing' ? ' — missing' : ''}
      </text>
    </g>
  );
}

export default function ArchitectureGraph({ links, usability, onNodeClick, previewLayer }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const be = links.backend || [];
  const fe = links.frontend || [];
  const ag = links.agents || [];
  const db = links.models || [];

  const layers: LayerDef[] = [
    { id: 'frontend', label: 'Frontend', files: fe, status: previewLayer === 'frontend' ? 'preview' : usability.frontend || 'missing', x: 120, y: 40, shape: 'rounded', color: '#10b981' },
    { id: 'api', label: 'API Routes', files: be.filter(f => f.includes('route')), status: previewLayer === 'api' ? 'preview' : usability.backend || 'missing', x: 120, y: 110, shape: 'hexagon', color: '#3b82f6' },
    { id: 'services', label: 'Services', files: be.filter(f => f.includes('service') || f.includes('Service')), status: previewLayer === 'services' ? 'preview' : usability.backend || 'missing', x: 120, y: 180, shape: 'rect', color: '#6366f1' },
    { id: 'agents', label: 'Agents', files: ag, status: previewLayer === 'agents' ? 'preview' : usability.agent || 'missing', x: 120, y: 250, shape: 'circle', color: '#8b5cf6' },
    { id: 'database', label: 'Database', files: db, status: previewLayer === 'database' ? 'preview' : db.length > 0 ? 'ready' : 'missing', x: 120, y: 320, shape: 'cylinder', color: '#f59e0b' },
  ];

  return (
    <div>
      <style>{`
        .node-pulse { animation: nodePulse 2s infinite; }
        @keyframes nodePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.85; } }
      `}</style>
      <svg viewBox="0 0 240 360" style={{ width: '100%', height: 360 }}>
        <defs>
          <marker id="arrowG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
          </marker>
          <marker id="arrowD" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#e2e8f0" />
          </marker>
        </defs>

        {/* Connection arrows */}
        {layers.slice(0, -1).map((layer, i) => {
          const next = layers[i + 1];
          const active = layer.status !== 'missing' && next.status !== 'missing';
          return (
            <line key={`a-${i}`} x1={120} y1={layer.y + 28} x2={120} y2={next.y - 28}
              stroke={active ? '#3b82f6' : '#e2e8f0'}
              strokeWidth={active ? 2 : 1}
              strokeDasharray={active ? 'none' : '4,4'}
              markerEnd={`url(#${active ? 'arrowG' : 'arrowD'})`} />
          );
        })}

        {/* Nodes */}
        {layers.map(layer => (
          <g key={layer.id} onMouseEnter={() => setHovered(layer.id)} onMouseLeave={() => setHovered(null)}>
            <NodeShape layer={layer} hovered={hovered === layer.id} onClick={() => onNodeClick?.(layer.id, layer.files)} />
          </g>
        ))}
      </svg>
    </div>
  );
}
