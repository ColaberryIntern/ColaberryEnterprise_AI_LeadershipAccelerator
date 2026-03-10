import React from 'react';

interface AnomalyData {
  id: string;
  entity: string;
  entity_type: string;
  metric: string;
  severity: string;
  description: string;
  detected_at: string;
  factors?: Record<string, any>;
}

interface Props {
  anomaly: AnomalyData | null;
  onClose: () => void;
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-danger',
  error: 'bg-warning text-dark',
  warning: 'bg-info text-dark',
  info: 'bg-secondary',
};

const RECOMMENDATIONS: Record<string, { action: string; urgency: string }> = {
  critical: {
    action: 'Immediate investigation required. Check system logs and disable affected component.',
    urgency: 'Act now',
  },
  error: {
    action: 'Review error logs and recent changes. Consider rollback if recent deployment.',
    urgency: 'Within 1 hour',
  },
  warning: {
    action: 'Monitor closely. Schedule review within 24 hours.',
    urgency: 'Within 24 hours',
  },
  info: {
    action: 'No action required. Continue monitoring.',
    urgency: 'Routine',
  },
};

function getSeverityBadgeClass(severity: string): string {
  return SEVERITY_BADGE[severity?.toLowerCase()] || 'bg-secondary';
}

function getRecommendation(severity: string) {
  return RECOMMENDATIONS[severity?.toLowerCase()] || RECOMMENDATIONS.info;
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

export default function InvestigationPanel({ anomaly, onClose }: Props) {
  if (!anomaly) return null;

  const rec = getRecommendation(anomaly.severity);
  const factors = anomaly.factors || {};
  const factorEntries = Object.entries(factors);

  return (
    <div
      className="card border-0 shadow-sm mb-3"
      style={{
        animation: 'slideDown 0.25s ease-out',
        borderLeft: `4px solid ${anomaly.severity === 'critical' ? '#e53e3e' : anomaly.severity === 'error' ? '#dd6b20' : '#2b6cb0'}`,
      }}
    >
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .card { animation: none !important; }
        }
      `}</style>

      {/* Header */}
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center gap-2">
          <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
            Investigation: {anomaly.entity}
          </span>
          <span className={`badge ${getSeverityBadgeClass(anomaly.severity)}`} style={{ fontSize: '0.6rem' }}>
            {anomaly.severity.toUpperCase()}
          </span>
        </div>
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={onClose}
          aria-label="Close investigation panel"
          style={{ lineHeight: 1, padding: '0.2rem 0.5rem' }}
        >
          &times;
        </button>
      </div>

      {/* Body: 2x2 grid */}
      <div className="card-body p-3">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {/* Contributing Factors */}
          <div className="bg-light rounded p-3">
            <small className="fw-semibold text-uppercase d-block mb-2" style={{ fontSize: '0.65rem', letterSpacing: '0.5px', color: 'var(--color-text-light)' }}>
              Contributing Factors
            </small>
            {factorEntries.length > 0 ? (
              factorEntries.map(([key, value]) => {
                const numVal = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
                const pct = Math.min(Math.max(numVal, 0), 100);
                return (
                  <div key={key} className="mb-2">
                    <div className="d-flex justify-content-between">
                      <small style={{ fontSize: '0.72rem', color: 'var(--color-text)' }}>{key}</small>
                      <small className="fw-semibold" style={{ fontSize: '0.72rem' }}>{typeof value === 'number' ? value.toFixed(1) : String(value)}</small>
                    </div>
                    <div className="progress" style={{ height: 5 }}>
                      <div
                        className="progress-bar"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: pct >= 70 ? '#e53e3e' : pct >= 40 ? '#d69e2e' : '#38a169',
                        }}
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <small className="text-muted" style={{ fontSize: '0.72rem' }}>No factor data available</small>
            )}
          </div>

          {/* Event Timeline */}
          <div className="bg-light rounded p-3">
            <small className="fw-semibold text-uppercase d-block mb-2" style={{ fontSize: '0.65rem', letterSpacing: '0.5px', color: 'var(--color-text-light)' }}>
              Event Timeline
            </small>
            <div className="d-flex align-items-start gap-2 mb-2">
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-primary-light)',
                  marginTop: 4,
                  flexShrink: 0,
                }}
              />
              <div>
                <small className="fw-semibold d-block" style={{ fontSize: '0.72rem', color: 'var(--color-primary)' }}>
                  Detected
                </small>
                <small className="text-muted" style={{ fontSize: '0.68rem' }}>
                  {formatTimestamp(anomaly.detected_at)}
                </small>
              </div>
            </div>
            <p className="mb-0" style={{ fontSize: '0.72rem', color: 'var(--color-text)', lineHeight: 1.5 }}>
              {anomaly.description}
            </p>
          </div>

          {/* Risk Assessment */}
          <div className="bg-light rounded p-3">
            <small className="fw-semibold text-uppercase d-block mb-2" style={{ fontSize: '0.65rem', letterSpacing: '0.5px', color: 'var(--color-text-light)' }}>
              Risk Assessment
            </small>
            <div className="d-flex flex-column gap-2">
              <div>
                <small className="text-muted" style={{ fontSize: '0.65rem' }}>Severity</small>
                <div>
                  <span className={`badge ${getSeverityBadgeClass(anomaly.severity)}`} style={{ fontSize: '0.65rem' }}>
                    {anomaly.severity.toUpperCase()}
                  </span>
                </div>
              </div>
              <div>
                <small className="text-muted" style={{ fontSize: '0.65rem' }}>Metric Affected</small>
                <div>
                  <span className="badge bg-info text-dark" style={{ fontSize: '0.65rem' }}>
                    {anomaly.metric}
                  </span>
                </div>
              </div>
              <div>
                <small className="text-muted" style={{ fontSize: '0.65rem' }}>Entity Type</small>
                <div>
                  <span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>
                    {anomaly.entity_type}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Recommended Action */}
          <div className="bg-light rounded p-3">
            <small className="fw-semibold text-uppercase d-block mb-2" style={{ fontSize: '0.65rem', letterSpacing: '0.5px', color: 'var(--color-text-light)' }}>
              Recommended Action
            </small>
            <div className="d-flex align-items-center gap-2 mb-2">
              <small className="text-muted" style={{ fontSize: '0.65rem' }}>Response window:</small>
              <span
                className={`badge ${anomaly.severity === 'critical' ? 'bg-danger' : anomaly.severity === 'error' ? 'bg-warning text-dark' : 'bg-info text-dark'}`}
                style={{ fontSize: '0.6rem' }}
              >
                {rec.urgency}
              </span>
            </div>
            <p className="mb-0" style={{ fontSize: '0.72rem', color: 'var(--color-text)', lineHeight: 1.5 }}>
              {rec.action}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
