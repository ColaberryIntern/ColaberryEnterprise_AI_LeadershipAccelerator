import React, { useState } from 'react';
import { useRemediationHealth } from '../../hooks/useRemediationHealth';
import type { RemediationIntelligenceReport } from '../../hooks/useRemediationIntelligence';

const TIER_COLOR: Record<string, string> = {
  healthy: '#15803d',
  cautious: '#0284c7',
  degraded: '#92400e',
  critical: '#b91c1c',
};

export interface RemediationImpactPanelProps {
  report: RemediationIntelligenceReport | null;
  /** Pull project-wide health when true; defaults to true. */
  showProjectHealth?: boolean;
  defaultCollapsed?: boolean;
}

export function RemediationImpactPanel({ report, showProjectHealth = true, defaultCollapsed = false }: RemediationImpactPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const { data: health } = useRemediationHealth({ autoFetch: showProjectHealth });

  return (
    <div className="card border-0 shadow-sm mb-3" style={{ background: '#f8fafc' }}>
      <div
        className="card-header bg-white d-flex align-items-center justify-content-between"
        style={{ cursor: 'pointer', padding: '8px 12px' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-graph-up-arrow" style={{ color: '#0f172a', fontSize: 13 }}></i>
          <span className="fw-semibold" style={{ fontSize: 12 }}>Remediation impact</span>
          {health && (
            <span className="badge ms-2" style={{ background: TIER_COLOR[health.tier], color: '#fff', fontSize: 9 }}>
              {health.score}/100 · {health.tier}
            </span>
          )}
        </div>
        <i className={`bi ${collapsed ? 'bi-chevron-down' : 'bi-chevron-up'}`} style={{ fontSize: 11, color: '#64748b' }}></i>
      </div>
      {!collapsed && (
        <div className="card-body" style={{ padding: '10px 12px', fontSize: 11 }}>
          {report && (
            <div className="mb-2">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>Per-BP summary</div>
              <div>{report.summary}</div>
              {report.regression_prone.length > 0 && (
                <div className="mt-1" style={{ color: '#b91c1c' }}>
                  <i className="bi bi-exclamation-triangle me-1"></i>
                  {report.regression_prone.length} regression-prone signature{report.regression_prone.length === 1 ? '' : 's'}
                </div>
              )}
            </div>
          )}
          {health && (
            <div>
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>Project-wide health</div>
              <div>{health.explanation}</div>
              <div className="row mt-2 g-2">
                <DimCell label="Effectiveness" value={health.inputs.effectiveness} />
                <DimCell label="Stability" value={health.inputs.stability} />
                <DimCell label="UX velocity" value={health.inputs.ux_velocity} />
                <DimCell label="Confidence" value={health.inputs.confidence} />
                <DimCell label="Regression risk" value={health.inputs.regression_risk} inverted />
                <DimCell label="Debt pressure" value={health.inputs.unresolved_debt_pressure} inverted />
              </div>
            </div>
          )}
          {!report && !health && (
            <div className="text-muted">No remediation activity yet — run the UI Advisor to start the cycle.</div>
          )}
        </div>
      )}
    </div>
  );
}

function DimCell({ label, value, inverted = false }: { label: string; value: number; inverted?: boolean }) {
  // For inverted dims, lower=better; render as 100-value so the bar still
  // grows on "good."
  const display = inverted ? 100 - value : value;
  const color = display >= 70 ? '#15803d' : display >= 40 ? '#92400e' : '#b91c1c';
  return (
    <div className="col-6">
      <div className="d-flex justify-content-between" style={{ fontSize: 10 }}>
        <span className="text-muted">{label}</span>
        <span className="fw-semibold" style={{ color }}>{Math.round(value)}</span>
      </div>
    </div>
  );
}
