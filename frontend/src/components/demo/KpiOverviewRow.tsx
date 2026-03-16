import React from 'react';
import { DemoKpi } from './demoData';

interface KpiOverviewRowProps {
  kpis: DemoKpi[];
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
            <small className="text-muted" style={{ fontSize: '0.7rem' }}>
              {kpi.detail}
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}
