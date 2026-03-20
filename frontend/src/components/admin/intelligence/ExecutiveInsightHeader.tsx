import React from 'react';
import CoryBadge from './CoryBadge';

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
  entityType?: string;
  onCoryClick?: (context: string) => void;
}

const ENTITY_LABELS: Record<string, Record<string, string>> = {
  campaigns: {
    risk_level: 'Campaign Error Rate',
    active_alerts: 'Unresolved Errors',
    lead_trend: 'Leads This Week',
    system_health: 'Campaign Health',
    agent_health: 'Campaign Status',
    process_activity: 'Total Errors',
  },
  leads: {
    risk_level: 'Pipeline Risk',
    active_alerts: 'Stalled Leads',
    lead_trend: 'New Leads',
    system_health: 'Conversion Rate',
    agent_health: 'Lead Activity',
    process_activity: 'Engagements (7d)',
  },
  students: {
    risk_level: 'Dropout Risk',
    active_alerts: 'Inactive Students',
    lead_trend: 'Enrollments',
    system_health: 'Completion Rate',
    agent_health: 'Cohort Status',
    process_activity: 'Attendance (7d)',
  },
  agents: {
    risk_level: 'Agent Error Rate',
    active_alerts: 'Errored Agents',
    lead_trend: 'Executions (24h)',
    system_health: 'Orchestration Health',
    agent_health: 'Agent Status',
    process_activity: 'Executions (24h)',
  },
};

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
  onCoryClick?: () => void;
}

function KPICard({ label, accent, children, onCoryClick }: KPICardProps) {
  return (
    <div
      className="intel-card-float flex-fill"
      style={{
        minWidth: '150px',
        maxWidth: '220px',
        borderLeft: `4px solid ${accent}`,
        position: 'relative',
      }}
    >
      <div className="card-body p-3">
        {onCoryClick && (
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            <CoryBadge onClick={onCoryClick} tooltip={`Ask Cory about ${label}`} size={18} />
          </div>
        )}
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

export default function ExecutiveInsightHeader({ kpis, loading, entityType, onCoryClick }: Props) {
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

  const labels = entityType ? ENTITY_LABELS[entityType] || {} : {};
  const lbl = (key: string, fallback: string) => labels[key] || fallback;

  // Count how many KPIs have data
  const hasData = [risk_level, active_alerts, lead_trend, system_health, agent_health, process_activity].some(Boolean);
  if (!hasData) return null;

  return (
    <div className="d-flex gap-3 flex-wrap">
      {/* System Risk Level */}
      {risk_level && (
        <KPICard label={lbl('risk_level', 'System Risk Level')} accent={getRiskBadgeColor(risk_level.label)}
          onCoryClick={onCoryClick ? () => onCoryClick(`Analyze the System Risk Level KPI: score is ${risk_level.score}/100, level is ${risk_level.label}, delta ${risk_level.delta}. Give me a full executive report with flagged KPIs, risk assessment, and recommended actions.`) : undefined}>
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
        <KPICard label={lbl('active_alerts', 'Active Alerts')} accent="#e53e3e"
          onCoryClick={onCoryClick ? () => onCoryClick(`Analyze the Active Alerts KPI: ${active_alerts.count} high/critical alerts, delta ${active_alerts.delta}. Give me a full executive report with what's causing these alerts, severity breakdown, and recommended actions.`) : undefined}>
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
        <KPICard label={lbl('lead_trend', 'Lead Trend')} accent={lead_trend.delta >= 0 ? 'var(--color-accent)' : 'var(--color-secondary)'}
          onCoryClick={onCoryClick ? () => onCoryClick(`Analyze the Lead Trend KPI: current value ${lead_trend.value}, delta ${lead_trend.delta}%, total ${lead_trend.total}. Give me a full executive report with pipeline health, conversion insights, and growth recommendations.`) : undefined}>
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
          label={lbl('system_health', 'System Health')}
          accent={system_health.score >= 80 ? '#38a169' : system_health.score >= 50 ? '#d69e2e' : '#e53e3e'}
          onCoryClick={onCoryClick ? () => onCoryClick(`Analyze the System Health KPI: score ${system_health.score}/100, status "${system_health.label}". Give me a full executive report with health breakdown, bottlenecks, and optimization recommendations.`) : undefined}
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
          label={lbl('agent_health', 'Agent Status')}
          accent={agent_health.errored > 0 ? '#dd6b20' : '#38a169'}
          onCoryClick={onCoryClick ? () => onCoryClick(`Analyze the Agent Status KPI: ${agent_health.running} running, ${agent_health.errored} errored, ${agent_health.total} total agents. Give me a full executive report with agent fleet health, error analysis, and which agents need attention.`) : undefined}
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
        <KPICard label={lbl('process_activity', 'Process Activity')} accent="#805ad5"
          onCoryClick={onCoryClick ? () => onCoryClick(`Analyze the Process Activity KPI: ${process_activity.count_24h} processes in 24h, delta ${process_activity.delta}. Give me a full executive report with activity trends, anomalies, and efficiency recommendations.`) : undefined}>
          <div className="fw-bold mt-1" style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>
            {process_activity.count_24h}<small className="fw-normal text-muted"> (24h)</small>
          </div>
          <DeltaBadge delta={process_activity.delta} />
        </KPICard>
      )}

      {/* Dynamic KPI cards from Cory's analysis */}
      {(kpis as any)?.cory_kpis?.map((ckpi: any, idx: number) => (
        <KPICard
          key={`cory-${idx}`}
          label={ckpi.name || ckpi.label || 'Metric'}
          accent="var(--color-primary-light)"
          onCoryClick={onCoryClick ? () => onCoryClick(`Tell me more about ${ckpi.name}: current value is ${ckpi.value}`) : undefined}
        >
          <div className="fw-bold mt-1" style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>
            {typeof ckpi.value === 'number' ? ckpi.value.toLocaleString() : ckpi.value}
            {ckpi.unit && <small className="fw-normal text-muted"> {ckpi.unit}</small>}
          </div>
          <div className="d-flex align-items-center gap-2">
            <span
              className="badge"
              style={{
                fontSize: '0.5rem',
                background: 'rgba(43, 108, 176, 0.08)',
                color: 'var(--color-primary-light)',
                border: '1px solid rgba(43, 108, 176, 0.15)',
              }}
            >
              from Cory
            </span>
            {ckpi.trend && ckpi.trend !== 'stable' && (
              <DeltaBadge delta={ckpi.trend === 'up' ? 1 : -1} />
            )}
          </div>
        </KPICard>
      ))}
    </div>
  );
}
