import React from 'react';
import { StatCard } from '../shell';
import type { KpiValues } from './ourServicesModel';

/**
 * OurServicesKpiRow - the six headline tiles. Every value comes from `buildKpis(summary)`; a value that has no
 * honest number (an average over an empty catalog) shows an em dash, never 0.
 */
interface Props { kpis: KpiValues }

const dash = '—';

function healthHint(avg: number | null): string {
  if (avg == null) return 'no services yet';
  if (avg >= 60) return '🟢 healthy';
  if (avg >= 40) return '🟡 building';
  return '🔴 weak';
}

export default function OurServicesKpiRow({ kpis }: Props): React.ReactElement {
  return (
    <div className="row g-3 mb-4" data-testid="kpi-row">
      <div className="col-6 col-lg-4 col-xxl-2">
        <StatCard label="Active services" value={String(kpis.active)} icon="heart-3-line" tone="primary" hint={`+${kpis.growth} 🌱 growth`} />
      </div>
      <div className="col-6 col-lg-4 col-xxl-2">
        <StatCard label="Linked case studies" value={String(kpis.linkedCaseStudies)} icon="book-2-line" tone="info"
          hint={`🏗️ ${kpis.linkedInside} inside · 📁 ${kpis.linkedOutside} outside`} />
      </div>
      <div className="col-6 col-lg-4 col-xxl-2">
        <StatCard label="Proven services" value={String(kpis.proven)} icon="checkbox-circle-line" tone="success"
          hint={kpis.provenPct == null ? 'no services yet' : `${kpis.provenPct}% of catalog`} />
      </div>
      <div className="col-6 col-lg-4 col-xxl-2">
        <StatCard label="Avg evidence score" value={kpis.avgScore == null ? dash : String(kpis.avgScore)} icon="ruler-line" tone="warning" hint={healthHint(kpis.avgScore)} />
      </div>
      <div className="col-6 col-lg-4 col-xxl-2">
        <StatCard label="Services with no proof" value={String(kpis.noProof)} icon="error-warning-line" tone="danger" hint={'can\'t claim "We have it"'} />
      </div>
      <div className="col-6 col-lg-4 col-xxl-2">
        <StatCard label="Blocked case studies" value={String(kpis.blocked)} icon="forbid-line" tone="danger" hint="need a service link" />
      </div>
    </div>
  );
}
