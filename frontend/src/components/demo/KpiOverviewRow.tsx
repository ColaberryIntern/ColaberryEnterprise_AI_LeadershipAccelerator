import React from 'react';
import { DemoKpi } from './demoData';

interface KpiOverviewRowProps {
  kpis: DemoKpi[];
}

export default function KpiOverviewRow({ kpis }: KpiOverviewRowProps) {
  return (
    <div className="row g-2 mb-4">
      {kpis.map((kpi) => (
        <div className="col-4 col-md-2" key={kpi.label}>
          <div
            className="card border-0 shadow-sm text-center p-2 h-100"
            style={{ borderTop: `3px solid ${kpi.color}` }}
          >
            <div className="small mb-1" aria-hidden="true">{kpi.icon}</div>
            <div className="fw-bold" style={{ fontSize: '1.1rem', color: kpi.color }}>
              {kpi.value}
            </div>
            <div className="text-muted" style={{ fontSize: '0.65rem' }}>
              {kpi.detail}
            </div>
            <div className="text-muted fw-medium" style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {kpi.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
