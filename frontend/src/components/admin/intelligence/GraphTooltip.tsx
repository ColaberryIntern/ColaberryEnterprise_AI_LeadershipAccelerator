import React from 'react';
import { formatRowCount } from './entityPanel/businessEntityConfig';

interface Props {
  node: {
    id: string;
    label: string;
    color: string;
    table_count: number;
    total_rows: number;
    matched_tables: string[];
  };
  position: { x: number; y: number };
}

export default function GraphTooltip({ node, position }: Props) {
  return (
    <div
      className="intel-card-float"
      style={{
        position: 'fixed',
        left: position.x + 14,
        top: position.y - 10,
        zIndex: 1050,
        pointerEvents: 'none',
        padding: '10px 14px',
        maxWidth: 260,
        fontSize: '0.75rem',
      }}
    >
      <div className="d-flex align-items-center gap-2 mb-1">
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: node.color,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        <span className="fw-semibold" style={{ color: 'var(--color-primary)' }}>
          {node.label}
        </span>
      </div>
      <div className="d-flex gap-3 text-muted mb-1">
        <span>{node.table_count} tables</span>
        <span>{formatRowCount(node.total_rows)} rows</span>
      </div>
      {node.matched_tables.length > 0 && (
        <div className="text-muted" style={{ fontSize: '0.65rem', lineHeight: 1.4 }}>
          {node.matched_tables.slice(0, 6).join(', ')}
          {node.matched_tables.length > 6 && ` +${node.matched_tables.length - 6} more`}
        </div>
      )}
    </div>
  );
}
