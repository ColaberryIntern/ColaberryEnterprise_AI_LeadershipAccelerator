import React from 'react';

interface KPIData {
  [key: string]: any;
}

interface ExecutiveInsightHeaderProps {
  summary: KPIData | null;
  loading?: boolean;
}

interface KPICardConfig {
  label: string;
  accent: string;
  render: (data: KPIData) => { value: string; subtitle: string };
}

const kpiRegistry: Record<string, KPICardConfig> = {
  risk_level: {
    label: 'Risk Level',
    accent: 'var(--color-secondary)',
    render: (d) => ({
      value: d.risk_level || d.risk_label || 'N/A',
      subtitle: d.risk_score != null ? `Score: ${d.risk_score}/100` : '',
    }),
  },
  active_alerts: {
    label: 'Active Alerts',
    accent: '#e53e3e',
    render: (d) => ({
      value: String(d.active_alerts ?? d.alert_count ?? 0),
      subtitle: d.alert_detail || 'High/critical alerts',
    }),
  },
  revenue_trend: {
    label: 'Revenue Trend (30D)',
    accent: (undefined as any), // computed dynamically
    render: (d) => {
      const val = d.revenue_trend ?? d.revenue_delta ?? 0;
      const pct = typeof val === 'number' ? val : parseFloat(val) || 0;
      return {
        value: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`,
        subtitle: pct >= 0 ? 'growing' : 'declining',
      };
    },
  },
  complaint_spike: {
    label: 'Complaint Spike',
    accent: '#dd6b20',
    render: (d) => ({
      value: String(d.complaint_spike ?? d.complaint_count ?? 0),
      subtitle: d.complaint_category || 'Product Quality',
    }),
  },
  inventory_risk: {
    label: 'Inventory Risk',
    accent: '#805ad5',
    render: (d) => ({
      value: d.inventory_risk ?? d.at_risk_count ?? 'N/A',
      subtitle: d.inventory_detail || 'At-risk stores',
    }),
  },
};

const riskColors: Record<string, string> = {
  critical: '#e53e3e',
  high: '#dd6b20',
  medium: '#d69e2e',
  low: '#38a169',
};

function getRiskBadgeColor(level: string): string {
  return riskColors[level?.toLowerCase()] || '#718096';
}

function SkeletonCards() {
  return (
    <div className="d-flex gap-3 flex-wrap">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="card border-0 shadow-sm flex-fill"
          style={{ minWidth: '150px', maxWidth: '220px' }}
        >
          <div className="card-body p-3">
            <div className="placeholder-glow">
              <span className="placeholder col-8 placeholder-sm mb-2 d-block" />
              <span className="placeholder col-5 placeholder-lg mb-1 d-block" />
              <span className="placeholder col-6 placeholder-xs d-block" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ExecutiveInsightHeader({ summary, loading }: ExecutiveInsightHeaderProps) {
  if (loading) return <SkeletonCards />;
  if (!summary) return null;

  const keys = Object.keys(kpiRegistry).filter(
    (k) => summary[k] != null || summary[k.replace(/_/g, '')] != null
  );

  // No matching KPI keys found — don't render empty cards
  if (keys.length === 0) return null;

  return (
    <div className="d-flex gap-3 flex-wrap">
      {keys.map((key) => {
        const cfg = kpiRegistry[key];
        const { value, subtitle } = cfg.render(summary);
        const accent =
          key === 'revenue_trend'
            ? (parseFloat(summary.revenue_trend ?? '0') >= 0 ? 'var(--color-accent)' : 'var(--color-secondary)')
            : cfg.accent;

        return (
          <div
            key={key}
            className="card border-0 shadow-sm flex-fill"
            style={{
              minWidth: '150px',
              maxWidth: '220px',
              borderLeft: `4px solid ${accent}`,
            }}
          >
            <div className="card-body p-3">
              <small className="text-muted fw-medium text-uppercase" style={{ fontSize: '0.65rem', letterSpacing: '0.5px' }}>
                {cfg.label}
              </small>
              <div className="fw-bold mt-1" style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>
                {key === 'risk_level' ? (
                  <span
                    className="badge"
                    style={{
                      background: getRiskBadgeColor(value),
                      fontSize: '0.8rem',
                    }}
                  >
                    {value.toUpperCase()}
                  </span>
                ) : (
                  value
                )}
              </div>
              {subtitle && (
                <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                  {subtitle}
                </small>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
