import React, { useMemo } from 'react';
import { useIntelligenceContext } from '../../../../contexts/IntelligenceContext';
import { BusinessEntityNetwork, BusinessCategory } from '../../../../services/intelligenceApi';
import { BUSINESS_CATEGORIES, formatRowCount } from './businessEntityConfig';

interface Props {
  hierarchy: BusinessEntityNetwork | null;
  loading?: boolean;
}

// Fixed positions for a clean hierarchical layout within 260px width
const NODE_LAYOUT: Record<string, { x: number; y: number; level: number }> = {
  agents:     { x: 120, y: 30,  level: 0 },
  campaigns:  { x: 55,  y: 100, level: 1 },
  system:     { x: 190, y: 100, level: 1 },
  leads:      { x: 120, y: 175, level: 2 },
  visitors:   { x: 40,  y: 250, level: 3 },
  students:   { x: 200, y: 250, level: 3 },
  cohorts:    { x: 55,  y: 330, level: 4 },
  curriculum: { x: 190, y: 330, level: 4 },
  other:      { x: 120, y: 400, level: 5 },
};

export default function BusinessMapTab({ hierarchy, loading }: Props) {
  const { drillDown } = useIntelligenceContext();

  const categoryMap = useMemo(() => {
    if (!hierarchy) return new Map<string, BusinessCategory>();
    return new Map(hierarchy.categories.map((c) => [c.id, c]));
  }, [hierarchy]);

  if (loading || !hierarchy) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100 text-muted">
        <div className="spinner-border spinner-border-sm me-2" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <small>Loading business map...</small>
      </div>
    );
  }

  const maxRows = Math.max(...hierarchy.categories.map((c) => c.total_rows), 1);

  const handleClick = (catId: string, label: string) => {
    drillDown(catId, 'all', label);
  };

  // Filter to categories that have matched tables
  const visibleCategories = hierarchy.categories.filter((c) => c.table_count > 0);

  // Compute SVG height based on categories present
  const positions = visibleCategories.map((cat) => {
    const pos = NODE_LAYOUT[cat.id] || { x: 120, y: 400, level: 5 };
    return { ...cat, ...pos };
  });
  const maxY = Math.max(...positions.map((p) => p.y), 200);
  const svgHeight = maxY + 60;

  return (
    <div className="d-flex flex-column h-100">
      <div className="p-2 border-bottom">
        <div className="d-flex justify-content-between align-items-center">
          <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
            Business Model
          </span>
          <span className="text-muted" style={{ fontSize: '0.65rem' }}>
            {hierarchy.total_tables} tables / {formatRowCount(hierarchy.total_rows)} rows
          </span>
        </div>
      </div>

      <div className="flex-grow-1" style={{ overflowY: 'auto' }}>
        <svg
          width="100%"
          viewBox={`0 0 240 ${svgHeight}`}
          style={{ display: 'block' }}
        >
          {/* Edges */}
          {hierarchy.hierarchy_edges.map((edge, i) => {
            const fromPos = NODE_LAYOUT[edge.source];
            const toPos = NODE_LAYOUT[edge.target];
            if (!fromPos || !toPos) return null;
            const fromCat = categoryMap.get(edge.source);
            const toCat = categoryMap.get(edge.target);
            if (!fromCat?.table_count || !toCat?.table_count) return null;

            return (
              <g key={`edge-${i}`}>
                <line
                  x1={fromPos.x}
                  y1={fromPos.y + 16}
                  x2={toPos.x}
                  y2={toPos.y - 16}
                  stroke="var(--color-border)"
                  strokeWidth={1.5}
                  strokeDasharray="4,3"
                  opacity={0.6}
                />
                <text
                  x={(fromPos.x + toPos.x) / 2}
                  y={(fromPos.y + 16 + toPos.y - 16) / 2 - 4}
                  textAnchor="middle"
                  fontSize={7}
                  fill="var(--color-text-light)"
                  opacity={0.7}
                >
                  {edge.relationship}
                </text>
              </g>
            );
          })}

          {/* Nodes */}
          {positions.map((cat) => {
            const config = BUSINESS_CATEGORIES[cat.id] || BUSINESS_CATEGORIES.other;
            const isHub = cat.id === hierarchy.hub_entity;
            const nodeRadius = isHub ? 24 : 16 + (cat.total_rows / maxRows) * 8;

            return (
              <g
                key={cat.id}
                style={{ cursor: 'pointer' }}
                onClick={() => handleClick(cat.id, cat.label)}
              >
                {/* Node circle */}
                <circle
                  cx={cat.x}
                  cy={cat.y}
                  r={nodeRadius}
                  fill={config.bgLight}
                  stroke={config.color}
                  strokeWidth={isHub ? 2.5 : 1.5}
                />

                {/* Category label */}
                <text
                  x={cat.x}
                  y={cat.y - 2}
                  textAnchor="middle"
                  fontSize={isHub ? 9 : 7.5}
                  fontWeight={isHub ? 700 : 600}
                  fill={config.color}
                >
                  {cat.label}
                </text>

                {/* Row count */}
                <text
                  x={cat.x}
                  y={cat.y + 9}
                  textAnchor="middle"
                  fontSize={7}
                  fill="var(--color-text-light)"
                >
                  {formatRowCount(cat.total_rows)}
                </text>

                {/* Table count badge */}
                <circle
                  cx={cat.x + nodeRadius - 2}
                  cy={cat.y - nodeRadius + 2}
                  r={7}
                  fill={config.color}
                />
                <text
                  x={cat.x + nodeRadius - 2}
                  y={cat.y - nodeRadius + 5}
                  textAnchor="middle"
                  fontSize={7}
                  fill="white"
                  fontWeight={600}
                >
                  {cat.table_count}
                </text>

                <title>{`${cat.label}: ${cat.table_count} tables, ${cat.total_rows.toLocaleString()} rows\nTables: ${cat.matched_tables.join(', ')}`}</title>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
