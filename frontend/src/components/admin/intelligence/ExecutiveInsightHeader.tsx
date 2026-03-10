import React from 'react';

interface Props {
  kpis: {
    risk_level?: { score: number; label: string; delta: number };
    active_alerts?: { count: number; delta: number };
    lead_trend?: { value: string; delta: number; total: number };
    system_health?: { score: number; label: string };
    agent_health?: { running: number; errored: number; total: number };
    process_activity?: { count_24h: number; delta: number };
  } | null;
  loading?: boolean;
}

const riskColors: Record<string, string> = {
  critical: '#e53e3e',
  high: '#dd6b20',
  medium: '#d69e2e',
  low: '#38a169',
};

function getRiskBadgeColor(label: string): string {
  return riskColors[label?.toLowerCase()] || '#718096';
}

function DeltaBadge({ delta, suffix = '' }: { delta: number; suffix?: string }) {
  if (delta === 0) return null;
  const positive = delta > 0;
  return (
    <span
      className={`badge ${positive ? 'bg-success' : 'bg-danger'}`}
      style={{ fontSize: '0.6rem', fontWeight: 600 }}
    >
      {positive ? '\u2191' : '\u2193'} {Math.abs(delta)}{suffix}
    </span>
  );
}

function SkeletonCards() {
  return (
    <div className="d-flex gap-3 flex-wrap">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="intel-card-float flex-fill"
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

interface KPICardProps {
  label: string;
  accent: string;
  children: React.ReactNode;
}

function KPICard({ label, accent, children }: KPICardProps) {
  return (
    <div
      className="intel-card-float flex-fill"
      style={{
        minWidth: '150px',
        maxWidth: '220px',
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <div className="card-body p-3">
        <small
          className="text-muted fw-medium text-uppercase"
          style={{ fontSize: '0.65rem', letterSpacing: '0.5px' }}
        >
          {label}
        </small>
        {children}
      </div>
    </div>
  );
}

export default function ExecutiveInsightHeader({ kpis, loading }: Props) {
  if (loading) return <SkeletonCards />;
  if (!kpis) return null;

  const {
    risk_level,
    active_alerts,
    lead_trend,
    system_health,
    agent_health,
    process_activity,
  } = kpis;

  // Count how many KPIs have data
  const hasData = [risk_level, active_alerts, lead_trend, system_health, agent_health, process_activity].some(Boolean);
  if (!hasData) return null;

  return (
    <div className="d-flex gap-3 flex-wrap">
      {/* System Risk Level */}
      {risk_level && (
        <KPICard label="System Risk Level" accent={getRiskBadgeColor(risk_level.label)}>
          <div className="d-flex align-items-center gap-2 mt-1">
            <span
              className="badge"
              style={{
                background: getRiskBadgeColor(risk_level.label),
                fontSize: '0.8rem',
              }}
            >
              {risk_level.label.toUpperCase()}
            </span>
            <small className="text-muted" style={{ fontSize: '0.7rem' }}>
              {risk_level.score}/100
            </small>
          </div>
          {risk_level.delta !== 0 && (
            <div className="mt-1">
              <DeltaBadge delta={risk_level.delta} />
            </div>
          )}
        </KPICard>
      )}

      {/* Active Alerts */}
      {active_alerts && (
        <KPICard label="Active Alerts" accent="#e53e3e">
          <div className="fw-bold mt-1" style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>
            {active_alerts.count}
          </div>
          <div className="d-flex align-items-center gap-2">
            <small className="text-muted" style={{ fontSize: '0.7rem' }}>High/critical alerts</small>
            <DeltaBadge delta={active_alerts.delta} />
          </div>
        </KPICard>
      )}

      {/* Lead Trend */}
      {lead_trend && (
        <KPICard label="Lead Trend" accent={lead_trend.delta >= 0 ? 'var(--color-accent)' : 'var(--color-secondary)'}>
          <div className="fw-bold mt-1" style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>
            {lead_trend.value}
          </div>
          <div className="d-flex align-items-center gap-2">
            <DeltaBadge delta={lead_trend.delta} suffix="%" />
            {lead_trend.total != null && (
              <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                of {lead_trend.total} total
              </small>
            )}
          </div>
        </KPICard>
      )}

      {/* System Health */}
      {system_health && (
        <KPICard
          label="System Health"
          accent={system_health.score >= 80 ? '#38a169' : system_health.score >= 50 ? '#d69e2e' : '#e53e3e'}
        >
          <div className="fw-bold mt-1" style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>
            {system_health.score}<small className="fw-normal text-muted">/100</small>
          </div>
          <small className="text-muted" style={{ fontSize: '0.7rem' }}>
            {system_health.label}
          </small>
        </KPICard>
      )}

      {/* Agent Status */}
      {agent_health && (
        <KPICard
          label="Agent Status"
          accent={agent_health.errored > 0 ? '#dd6b20' : '#38a169'}
        >
          <div className="fw-bold mt-1" style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>
            {agent_health.running}<small className="fw-normal text-muted"> running</small>
          </div>
          <div className="d-flex align-items-center gap-2">
            <small className="text-muted" style={{ fontSize: '0.7rem' }}>
              of {agent_health.total} total
            </small>
            {agent_health.errored > 0 && (
              <span className="badge bg-danger" style={{ fontSize: '0.6rem' }}>
                {agent_health.errored} errored
              </span>
            )}
          </div>
        </KPICard>
      )}

      {/* Process Activity */}
      {process_activity && (
        <KPICard label="Process Activity" accent="#805ad5">
          <div className="fw-bold mt-1" style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>
            {process_activity.count_24h}<small className="fw-normal text-muted"> (24h)</small>
          </div>
          <DeltaBadge delta={process_activity.delta} />
        </KPICard>
      )}
    </div>
  );
}
