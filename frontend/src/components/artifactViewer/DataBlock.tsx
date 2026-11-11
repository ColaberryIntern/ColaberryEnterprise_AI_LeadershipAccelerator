import React from 'react';

/**
 * Structured content of a piece that no specific viewer renders, shown as labelled text. Everything goes
 * through React, which escapes it. Shared by the admin artifact viewer and the learner's work page (C128).
 */
export function DataBlock({ value, depth = 0 }: { value: unknown; depth?: number }): React.ReactElement | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <p className="mb-2" style={{ whiteSpace: 'pre-wrap' }}>{String(value)}</p>;
  }
  if (Array.isArray(value)) {
    return <ul className="mb-2">{value.map((v, i) => <li key={i}><DataBlock value={v} depth={depth + 1} /></li>)}</ul>;
  }
  if (typeof value === 'object') {
    return (
      <div className={depth ? 'ps-3 border-start' : ''}>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="mb-2">
            <div className="small text-uppercase text-muted fw-semibold">{k.replace(/_/g, ' ')}</div>
            <DataBlock value={v} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  return null;
}
