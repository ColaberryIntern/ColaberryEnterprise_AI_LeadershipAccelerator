import React, { useMemo } from 'react';
import { FUNNEL_NODES, FUNNEL_EDGES, COLUMN_LABELS, COLUMN_X, CATEGORY_COLORS, type FunnelNode } from './demoData';

// ─── SVG Dimensions ──────────────────────────────────────────────────────────

const VB_W = 750;
const VB_H = 420;
const NODE_W = 100;
const NODE_H = 56;
const NODE_RX = 14;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildCurvePath(from: FunnelNode, to: FunnelNode): string {
  const x1 = from.x + NODE_W / 2;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x + NODE_W / 2;
  const y2 = to.y + NODE_H / 2;
  const dx = (x2 - x1) * 0.45;
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

function edgeOpacity(volume: number, maxVolume: number): number {
  return 0.12 + 0.38 * (volume / maxVolume);
}

function edgeWidth(volume: number, maxVolume: number): number {
  return 1 + 3 * (volume / maxVolume);
}

// ─── Unique animation ID (avoid SVG filter collisions) ──────────────────────

const FILTER_ID = 'intel-demo-glow';
const PULSE_ID = 'intel-demo-pulse';

// ─── CSS for animations (injected as <style> inside SVG) ────────────────────

const svgStyles = `
  @keyframes ${PULSE_ID} {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  @keyframes idFlowDot {
    0% { offset-distance: 0%; opacity: 0; }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { offset-distance: 100%; opacity: 0; }
  }
  .id-node-group { cursor: pointer; }
  .id-node-group:hover .id-node-rect {
    filter: url(#${FILTER_ID});
  }
  .id-node-group:hover .id-node-rect-inner {
    transform-origin: center;
    transform: scale(1.03);
  }
  .id-node-group:focus-visible { outline: none; }
  .id-node-group:focus-visible .id-node-rect {
    stroke-width: 3;
    filter: url(#${FILTER_ID});
  }
  .id-node-active .id-node-rect {
    stroke-width: 2.5;
    filter: url(#${FILTER_ID});
  }
  .id-node-active .id-pulse-ring {
    animation: ${PULSE_ID} 1.8s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .id-flow-dot, .id-node-active .id-pulse-ring { animation: none !important; }
  }
`;

// ─── Mobile Stage Pills ─────────────────────────────────────────────────────

function MobileStagePills({
  selectedId,
  onNodeClick,
}: {
  selectedId: string | null;
  onNodeClick: (id: string) => void;
}) {
  const categories = ['source', 'outreach', 'visitor', 'engagement', 'conversion'] as const;

  return (
    <div className="d-md-none">
      {categories.map((cat, ci) => {
        const nodesInCat = FUNNEL_NODES.filter(n => n.category === cat);
        return (
          <div key={cat} className={ci > 0 ? 'mt-3' : ''}>
            <div
              className="text-uppercase small fw-semibold mb-2"
              style={{ color: CATEGORY_COLORS[cat], letterSpacing: '0.08em', fontSize: '0.7rem' }}
            >
              {COLUMN_LABELS[ci]}
            </div>
            <div className="d-flex gap-2 flex-wrap">
              {nodesInCat.map(node => {
                const isActive = selectedId === node.id;
                return (
                  <button
                    key={node.id}
                    className="btn btn-sm border-0"
                    onClick={() => onNodeClick(node.id)}
                    aria-pressed={isActive}
                    style={{
                      background: isActive ? node.color : `${node.color}15`,
                      color: isActive ? '#fff' : node.color,
                      borderRadius: 20,
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      padding: '6px 14px',
                      transition: 'all 0.2s ease',
                      boxShadow: isActive ? `0 2px 8px ${node.color}40` : 'none',
                    }}
                  >
                    {node.icon} {node.label}
                    <span
                      className="ms-1 badge rounded-pill"
                      style={{
                        background: isActive ? 'rgba(255,255,255,0.25)' : `${node.color}20`,
                        color: isActive ? '#fff' : node.color,
                        fontSize: '0.7rem',
                      }}
                    >
                      {node.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main SVG Component ─────────────────────────────────────────────────────

interface Props {
  selectedId: string | null;
  onNodeClick: (id: string) => void;
}

export default function FunnelFlowVisualization({ selectedId, onNodeClick }: Props) {
  const nodeMap = useMemo(() => new Map(FUNNEL_NODES.map(n => [n.id, n])), []);
  const maxVolume = useMemo(() => Math.max(...FUNNEL_EDGES.map(e => e.volume)), []);

  // Pre-compute paths
  const edgePaths = useMemo(() =>
    FUNNEL_EDGES.map((edge, i) => {
      const from = nodeMap.get(edge.from)!;
      const to = nodeMap.get(edge.to)!;
      return { ...edge, path: buildCurvePath(from, to), idx: i };
    }),
  [nodeMap]);

  return (
    <>
      {/* Desktop SVG */}
      <div className="d-none d-md-block" style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Customer intelligence funnel showing how leads flow from sources through outreach, visiting, engagement, to conversion"
          style={{ overflow: 'visible' }}
        >
          <style>{svgStyles}</style>

          {/* Defs: glow filter */}
          <defs>
            <filter id={FILTER_ID} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Column labels */}
          {COLUMN_LABELS.map((label, i) => (
            <text
              key={label}
              x={COLUMN_X[i] + NODE_W / 2}
              y={24}
              textAnchor="middle"
              fill={CATEGORY_COLORS[['source', 'outreach', 'visitor', 'engagement', 'conversion'][i]]}
              fontSize={11}
              fontWeight={700}
              letterSpacing="0.08em"
              style={{ textTransform: 'uppercase' } as React.CSSProperties}
            >
              {label}
            </text>
          ))}

          {/* Edge paths */}
          {edgePaths.map(ep => (
            <path
              key={`edge-${ep.idx}`}
              d={ep.path}
              fill="none"
              stroke={nodeMap.get(ep.from)!.color}
              strokeWidth={edgeWidth(ep.volume, maxVolume)}
              strokeOpacity={edgeOpacity(ep.volume, maxVolume)}
              strokeLinecap="round"
            />
          ))}

          {/* Animated flowing dots */}
          {edgePaths.map(ep =>
            [0, 1, 2].map(dotIdx => (
              <circle
                key={`dot-${ep.idx}-${dotIdx}`}
                className="id-flow-dot"
                r={2.5}
                fill={nodeMap.get(ep.from)!.color}
                aria-hidden="true"
                style={{
                  offsetPath: `path("${ep.path}")`,
                  animation: `idFlowDot ${2.2 + ep.idx * 0.1}s linear infinite`,
                  animationDelay: `${dotIdx * 0.73}s`,
                } as React.CSSProperties}
              />
            ))
          )}

          {/* Nodes */}
          {FUNNEL_NODES.map(node => {
            const isActive = selectedId === node.id;
            return (
              <g
                key={node.id}
                className={`id-node-group${isActive ? ' id-node-active' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`${node.label}: ${node.count} leads`}
                aria-pressed={isActive}
                onClick={() => onNodeClick(node.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNodeClick(node.id); } }}
              >
                {/* Pulse ring (active only) */}
                {isActive && (
                  <rect
                    className="id-pulse-ring"
                    x={node.x - 4}
                    y={node.y - 4}
                    width={NODE_W + 8}
                    height={NODE_H + 8}
                    rx={NODE_RX + 2}
                    fill="none"
                    stroke={node.color}
                    strokeWidth={1.5}
                    strokeOpacity={0.4}
                  />
                )}

                {/* Background rect */}
                <rect
                  className="id-node-rect"
                  x={node.x}
                  y={node.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={NODE_RX}
                  fill={`${node.color}12`}
                  stroke={node.color}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  strokeOpacity={isActive ? 1 : 0.6}
                />

                {/* Icon */}
                <text
                  x={node.x + 16}
                  y={node.y + NODE_H / 2 + 1}
                  fontSize={16}
                  textAnchor="middle"
                  dominantBaseline="central"
                  aria-hidden="true"
                >
                  {node.icon}
                </text>

                {/* Label */}
                <text
                  x={node.x + 34}
                  y={node.y + NODE_H / 2 - 6}
                  fontSize={10}
                  fontWeight={600}
                  fill={node.color}
                  dominantBaseline="central"
                >
                  {node.label}
                </text>

                {/* Count */}
                <text
                  x={node.x + 34}
                  y={node.y + NODE_H / 2 + 8}
                  fontSize={9}
                  fill="#718096"
                  dominantBaseline="central"
                >
                  {node.count.toLocaleString()}
                </text>

                {/* Activity dot (top-right) */}
                <circle
                  cx={node.x + NODE_W - 8}
                  cy={node.y + 8}
                  r={4}
                  fill={node.color}
                  fillOpacity={0.8}
                >
                  {!isActive && (
                    <animate
                      attributeName="fillOpacity"
                      values="0.4;0.9;0.4"
                      dur="2.5s"
                      repeatCount="indefinite"
                    />
                  )}
                </circle>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Mobile pills */}
      <MobileStagePills selectedId={selectedId} onNodeClick={onNodeClick} />
    </>
  );
}
