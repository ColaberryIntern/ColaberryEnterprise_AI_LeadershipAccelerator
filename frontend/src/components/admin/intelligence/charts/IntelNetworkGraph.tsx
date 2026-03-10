import React, { useMemo } from 'react';

interface NetworkNode {
  id: string;
  label?: string;
  value?: number;
  group?: string;
}

interface NetworkEdge {
  source: string;
  target: string;
  weight?: number;
}

interface IntelNetworkGraphProps {
  data: Record<string, any>[];
  config: Record<string, any>;
}

const GROUP_COLORS = ['#1a365d', '#2b6cb0', '#38a169', '#e53e3e', '#dd6b20', '#805ad5', '#d69e2e'];

export default function IntelNetworkGraph({ data, config }: IntelNetworkGraphProps) {
  if (!data?.length) return null;

  const { nodes, edges } = useMemo(() => {
    // Data can be nodes array with edges in config, or combined format
    const nodeList: NetworkNode[] = config.nodes || data.filter((d) => d.id && !d.source);
    const edgeList: NetworkEdge[] = config.edges || data.filter((d) => d.source && d.target);

    if (!nodeList.length && edgeList.length) {
      // Build nodes from edges
      const nodeSet = new Set<string>();
      edgeList.forEach((e) => {
        nodeSet.add(e.source);
        nodeSet.add(e.target);
      });
      return {
        nodes: Array.from(nodeSet).map((id): NetworkNode => ({ id, label: id })),
        edges: edgeList,
      };
    }

    return { nodes: nodeList, edges: edgeList };
  }, [data, config]);

  // Simple circular layout
  const width = 500;
  const height = 280;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy) - 40;

  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      positions[node.id] = {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });
    return positions;
  }, [nodes, cx, cy, radius]);

  const groups = useMemo(() => {
    const gMap: Record<string, number> = {};
    let idx = 0;
    nodes.forEach((n) => {
      const g = n.group || 'default';
      if (!(g in gMap)) gMap[g] = idx++;
    });
    return gMap;
  }, [nodes]);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ fontFamily: 'inherit' }}>
        {/* Edges */}
        {edges.map((edge, i) => {
          const from = nodePositions[edge.source];
          const to = nodePositions[edge.target];
          if (!from || !to) return null;
          return (
            <line
              key={`e-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="var(--color-border)"
              strokeWidth={edge.weight ? Math.min(edge.weight * 2, 4) : 1}
              strokeOpacity={0.6}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = nodePositions[node.id];
          if (!pos) return null;
          const gIdx = groups[node.group || 'default'] || 0;
          const nodeRadius = node.value ? Math.max(8, Math.min(20, node.value / 5)) : 12;

          return (
            <g key={node.id}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={nodeRadius}
                fill={GROUP_COLORS[gIdx % GROUP_COLORS.length]}
                stroke="#fff"
                strokeWidth={2}
                opacity={0.85}
              >
                <title>{`${node.label || node.id}${node.value ? `: ${node.value}` : ''}`}</title>
              </circle>
              <text
                x={pos.x}
                y={pos.y + nodeRadius + 12}
                textAnchor="middle"
                fontSize={9}
                fill="var(--color-text)"
              >
                {(node.label || node.id).length > 14
                  ? (node.label || node.id).slice(0, 14) + '...'
                  : node.label || node.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
