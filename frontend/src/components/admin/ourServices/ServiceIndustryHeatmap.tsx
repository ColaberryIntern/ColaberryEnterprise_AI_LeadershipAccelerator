import React from 'react';
import { EmptyState } from '../shell';
import type { EvidenceService, EvidenceSummary } from '../../../services/ourServicesApi';
import { heatStep } from './ourServicesModel';

/**
 * ServiceIndustryHeatmap - confirmed case studies per service x industry. Cell intensity is one of four token
 * alpha steps of the brand accent, relative to the busiest cell; an empty cell shows the mockup's ⚪ marker.
 * Rows follow evidence score, strongest first, and end with a total column.
 */
interface Props { services: EvidenceService[]; matrix: EvidenceSummary['industryMatrix'] }

/**
 * Token intensity steps of the accent ramp (no hex). Steps 1-3 carry dark text; step 4 (red-600) carries white,
 * which keeps every cell at or above 4.5:1 for the small bold numbers (red-400 with white would not).
 */
const STEP_BG = ['var(--surface-sunken)', 'var(--red-100)', 'var(--red-200)', 'var(--red-300)', 'var(--red-600)'];
const STEP_FG = ['var(--text-subtle)', 'var(--text-strong)', 'var(--text-strong)', 'var(--text-strong)', 'var(--neutral-0)'];

export default function ServiceIndustryHeatmap({ services, matrix }: Props): React.ReactElement {
  const rows = [...services].sort((a, b) => b.evidenceScore - a.evidenceScore || a.name.localeCompare(b.name));
  if (!rows.length) return <EmptyState icon="grid-line" tone="quiet" title="No services yet." />;
  if (!matrix.industries.length || !matrix.cells.length) {
    return <EmptyState icon="grid-line" tone="quiet" title="No confirmed case studies yet. Link one from Intake." description="Industry coverage appears once a linked case study names its industry." />;
  }
  const cell = new Map(matrix.cells.map((c) => [`${c.serviceId}|${c.industry}`, c.count]));
  const max = Math.max(...matrix.cells.map((c) => c.count));
  const base: React.CSSProperties = { borderRadius: 5, padding: '7px 4px', textAlign: 'center', fontWeight: 700, minWidth: 54, border: 0 };
  return (
    <div className="table-responsive">
      <table className="small mb-0" style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%' }} aria-label="Confirmed case studies per service and industry">
        <thead>
          <tr>
            <th scope="col"><span className="visually-hidden">Service</span></th>
            {matrix.industries.map((i) => <th key={i} scope="col" className="text-center fw-semibold text-secondary px-1 align-bottom" style={{ fontSize: 11 }}>{i}</th>)}
            <th scope="col" className="text-center fw-semibold text-secondary px-1 align-bottom" style={{ fontSize: 11 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const total = s.insideCount + s.outsideCount;
            return (
              <tr key={s.id}>
                <th scope="row" className="fw-semibold pe-3 text-body" style={{ minWidth: 220 }}>{s.name}</th>
                {matrix.industries.map((i) => {
                  const n = cell.get(`${s.id}|${i}`) ?? 0;
                  const step = heatStep(n, max);
                  return (
                    <td key={i} style={{ ...base, background: STEP_BG[step], color: STEP_FG[step] }}>
                      {n ? n : <><span aria-hidden="true">⚪</span><span className="visually-hidden">none</span></>}
                    </td>
                  );
                })}
                <td style={{ ...base, background: 'var(--surface-inverse)', color: 'var(--text-on-inverse)' }}>{total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
