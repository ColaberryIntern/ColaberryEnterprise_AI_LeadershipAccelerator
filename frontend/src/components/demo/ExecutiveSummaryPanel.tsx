import React from 'react';

interface ExecutiveSummaryPanelProps {
  summary: string;
}

export default function ExecutiveSummaryPanel({ summary }: ExecutiveSummaryPanelProps) {
  return (
    <div
      className="card border-0 shadow-sm mb-4"
      style={{ borderLeft: '4px solid var(--color-primary)' }}
    >
      <div className="card-body p-3">
        <h4 className="h6 fw-semibold mb-2" style={{ color: 'var(--color-primary)' }}>
          Executive Summary
        </h4>
        <p className="text-muted small mb-0">{summary}</p>
      </div>
    </div>
  );
}
