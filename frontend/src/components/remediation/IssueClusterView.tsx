import React from 'react';
import type { RemediationCluster } from '../../hooks/useRemediationIntelligence';

const TYPE_LABELS: Record<string, string> = {
  hierarchy: 'Hierarchy',
  cta: 'Call-to-action',
  spacing: 'Spacing',
  accessibility: 'Accessibility',
  workflow: 'Workflow',
  navigation: 'Navigation',
  cognition_overload: 'Cognition overload',
};

const SEVERITY_BG: Record<string, string> = {
  high: '#fef2f2',
  medium: '#fffbeb',
  low: '#f0fdf4',
};

const SEVERITY_BORDER: Record<string, string> = {
  high: '#fecaca',
  medium: '#fde68a',
  low: '#bbf7d0',
};

const SEVERITY_COLOR: Record<string, string> = {
  high: '#b91c1c',
  medium: '#92400e',
  low: '#15803d',
};

export interface IssueClusterViewProps {
  clusters: RemediationCluster[];
  onClusterClick?: (cluster: RemediationCluster) => void;
}

export function IssueClusterView({ clusters, onClusterClick }: IssueClusterViewProps) {
  if (clusters.length === 0) {
    return (
      <div className="p-2" style={{ fontSize: 11, color: '#64748b' }}>
        No active clusters — UX remediation surface is clear.
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-2 mb-3">
      <div className="d-flex align-items-center gap-2" style={{ fontSize: 11, color: '#64748b' }}>
        <i className="bi bi-diagram-3" style={{ fontSize: 12 }}></i>
        <span>Issue clusters ({clusters.length})</span>
      </div>
      {clusters.map(c => (
        <button
          key={c.cluster.cluster_signature}
          type="button"
          className="text-start p-2 border-0"
          onClick={() => onClusterClick?.(c)}
          style={{
            background: SEVERITY_BG[c.cluster.severity] || '#f8fafc',
            borderRadius: 6,
            border: `1px solid ${SEVERITY_BORDER[c.cluster.severity] || '#e2e8f0'}`,
            cursor: onClusterClick ? 'pointer' : 'default',
          }}
        >
          <div className="d-flex justify-content-between align-items-start gap-2">
            <div className="flex-grow-1">
              <div className="d-flex align-items-center gap-2 mb-1">
                <span className="badge" style={{ fontSize: 9, background: SEVERITY_COLOR[c.cluster.severity], color: '#fff' }}>
                  {c.cluster.severity}
                </span>
                <span className="fw-medium" style={{ fontSize: 11 }}>{TYPE_LABELS[c.cluster.cluster_type] || c.cluster.cluster_type}</span>
                <span className="text-muted" style={{ fontSize: 10 }}>· {c.cluster.issue_count} issue{c.cluster.issue_count === 1 ? '' : 's'}</span>
                {c.is_regression_prone && (
                  <span className="badge" style={{ fontSize: 8, background: '#fee2e2', color: '#b91c1c' }}>
                    <i className="bi bi-arrow-repeat me-1"></i>regression-prone
                  </span>
                )}
              </div>
              <div className="text-muted" style={{ fontSize: 10 }}>{c.cluster.likely_root_cause}</div>
              {c.cluster.affected_regions.length > 0 && (
                <div className="text-muted mt-1" style={{ fontSize: 9, fontFamily: 'monospace' }}>
                  {c.cluster.affected_regions.slice(0, 3).join(' · ')}
                  {c.cluster.affected_regions.length > 3 ? ` (+${c.cluster.affected_regions.length - 3} more)` : ''}
                </div>
              )}
            </div>
            <div className="d-flex flex-column align-items-end" style={{ minWidth: 70 }}>
              <span className="text-muted" style={{ fontSize: 9 }}>Confidence</span>
              <span className="fw-bold" style={{ fontSize: 13, color: c.confidence.tier === 'high' ? '#15803d' : c.confidence.tier === 'low' ? '#b91c1c' : '#92400e' }}>
                {c.confidence.confidence}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
