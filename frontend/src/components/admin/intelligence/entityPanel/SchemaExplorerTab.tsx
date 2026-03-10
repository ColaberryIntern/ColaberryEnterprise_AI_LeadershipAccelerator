import React, { useState, useMemo, useCallback } from 'react';
import { useIntelligenceContext } from '../../../../contexts/IntelligenceContext';
import {
  triggerDiscovery,
  EntityNetwork,
  EntityNode,
} from '../../../../services/intelligenceApi';

const MAX_GRAPH_NODES = 50;

function EntityGraph({
  nodes,
  edges,
  onNodeClick,
}: {
  nodes: EntityNode[];
  edges: { source: string; target: string }[];
  onNodeClick: (node: EntityNode) => void;
}) {
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;

  const hubNodes = nodes.filter((n) => n.is_hub);
  const regularNodes = nodes.filter((n) => !n.is_hub);

  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const innerRadius = size * 0.15;
    const outerRadius = size * 0.38;

    hubNodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(hubNodes.length, 1) - Math.PI / 2;
      positions[node.id] = {
        x: cx + innerRadius * Math.cos(angle),
        y: cy + innerRadius * Math.sin(angle),
      };
    });

    regularNodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(regularNodes.length, 1) - Math.PI / 2;
      positions[node.id] = {
        x: cx + outerRadius * Math.cos(angle),
        y: cy + outerRadius * Math.sin(angle),
      };
    });

    return positions;
  }, [nodes, hubNodes, regularNodes, cx, cy, size]);

  const maxRows = Math.max(...nodes.map((n) => n.row_count), 1);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', margin: '0 auto' }}>
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
            strokeWidth={0.8}
            opacity={0.5}
          />
        );
      })}
      {nodes.map((node) => {
        const pos = nodePositions[node.id];
        if (!pos) return null;
        const r = node.is_hub ? 10 : 3 + (node.row_count / maxRows) * 6;
        return (
          <g key={node.id} style={{ cursor: 'pointer' }} onClick={() => onNodeClick(node)}>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={r}
              fill={node.is_hub ? 'var(--color-primary)' : '#a0aec0'}
              stroke="white"
              strokeWidth={1}
            />
            {node.is_hub && (
              <text
                x={pos.x}
                y={pos.y + r + 10}
                textAnchor="middle"
                fontSize={8}
                fill="var(--color-text)"
                fontWeight={600}
              >
                {node.label}
              </text>
            )}
            <title>{`${node.label} — ${node.row_count.toLocaleString()} rows, ${node.column_count} cols`}</title>
          </g>
        );
      })}
    </svg>
  );
}

interface Props {
  network: EntityNetwork | null;
  onRefresh: () => void;
}

export default function SchemaExplorerTab({ network, onRefresh }: Props) {
  const { drillDown } = useIntelligenceContext();
  const [search, setSearch] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');

  const handleDiscovery = async () => {
    setDiscovering(true);
    try {
      await triggerDiscovery();
      onRefresh();
    } catch {
      // silent
    } finally {
      setDiscovering(false);
    }
  };

  const handleNodeClick = useCallback(
    (node: EntityNode) => {
      drillDown(node.is_hub ? 'hub' : 'table', node.id, node.label);
    },
    [drillDown]
  );

  const filteredNodes = useMemo(() => {
    if (!network?.nodes) return [];
    if (!search.trim()) return network.nodes;
    const q = search.toLowerCase();
    return network.nodes.filter((n) => n.label.toLowerCase().includes(q));
  }, [network, search]);

  if (!network || !network.nodes.length) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted p-3">
        <small className="mb-3 text-center">Run discovery to populate the schema</small>
        <button
          className="btn btn-sm btn-primary"
          onClick={handleDiscovery}
          disabled={discovering}
        >
          {discovering ? 'Discovering...' : 'Run Discovery'}
        </button>
      </div>
    );
  }

  const useGraph = viewMode === 'graph' && network.nodes.length <= MAX_GRAPH_NODES && !search;

  return (
    <div className="d-flex flex-column h-100">
      <div className="p-2 border-bottom">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
            {filteredNodes.length} tables
          </span>
          <div className="d-flex gap-1">
            <button
              className={`btn btn-sm ${viewMode === 'graph' ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: '0.6rem', padding: '1px 6px' }}
              onClick={() => setViewMode('graph')}
              title="Graph view"
            >
              Graph
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: '0.6rem', padding: '1px 6px' }}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              List
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ fontSize: '0.6rem', padding: '1px 6px' }}
              onClick={handleDiscovery}
              disabled={discovering}
              title="Refresh"
            >
              {discovering ? '...' : '\u21BB'}
            </button>
          </div>
        </div>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Search tables..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex-grow-1" style={{ overflowY: 'auto' }}>
        {useGraph ? (
          <div className="p-2">
            <EntityGraph
              nodes={network.nodes}
              edges={network.edges}
              onNodeClick={handleNodeClick}
            />
            <div className="d-flex gap-3 justify-content-center mt-1" style={{ fontSize: '0.6rem' }}>
              <span className="d-flex align-items-center gap-1">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)', display: 'inline-block' }} />
                Hub
              </span>
              <span className="d-flex align-items-center gap-1">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a0aec0', display: 'inline-block' }} />
                Table
              </span>
              <span className="text-muted">{network.edges.length} relationships</span>
            </div>
          </div>
        ) : (
          <div className="p-2">
            {filteredNodes.map((node) => (
              <div
                key={node.id}
                className="card border-0 shadow-sm mb-2"
                style={{
                  cursor: 'pointer',
                  borderLeft: node.is_hub
                    ? '3px solid var(--color-primary)'
                    : '3px solid var(--color-border)',
                }}
                onClick={() => handleNodeClick(node)}
              >
                <div className="card-body p-2">
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="fw-medium small">{node.label}</span>
                    {node.is_hub && (
                      <span className="badge bg-warning text-dark" style={{ fontSize: '0.6rem' }}>HUB</span>
                    )}
                  </div>
                  <div className="d-flex gap-2 mt-1">
                    <small className="text-muted">{node.row_count.toLocaleString()} rows</small>
                    <small className="text-muted">{node.column_count} cols</small>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
