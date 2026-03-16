import React from 'react';
import { DemoKpi } from './demoData';

interface KpiOverviewRowProps {
  kpis: DemoKpi[];
}

function TrendBadge({ trend }: { trend: number }) {
  const positive = trend > 0;
  const label = trend > 0 ? 'improvement' : 'reduction';
  return (
    <span
      className={`badge ${positive ? 'bg-success' : 'bg-danger'}`}
      style={{ fontSize: '0.6rem', fontWeight: 600 }}
      title={`${Math.abs(trend)}% ${label}`}
    >
      {positive ? '\u2191' : '\u2193'} {Math.abs(trend)}%
    </span>
  );
}

export default function KpiOverviewRow({ kpis }: KpiOverviewRowProps) {
  return (
    <div className="d-flex gap-3 flex-wrap mb-3">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="intel-card-float flex-fill"
          style={{
            minWidth: '140px',
            maxWidth: '200px',
            borderLeft: `4px solid ${kpi.color}`,
          }}
        >
          <div className="card-body p-3">
            <small
              className="text-muted fw-medium text-uppercase"
              style={{ fontSize: '0.65rem', letterSpacing: '0.5px' }}
            >
              {kpi.label}
            </small>
            <div
              className="fw-bold mt-1"
              style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}
            >
              {kpi.value}
            </div>
            <div className="d-flex align-items-center gap-2">
              <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                {kpi.detail}
              </small>
              {kpi.trend != null && kpi.trend !== 0 && <TrendBadge trend={kpi.trend} />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
