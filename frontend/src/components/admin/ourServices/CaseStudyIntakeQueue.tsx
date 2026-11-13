import React from 'react';
import type { IntakeSummaryItem } from '../../../services/ourServicesApi';
import IntakeCard from './IntakeCard';

/**
 * CaseStudyIntakeQueue - every case study with no confirmed service link. It cannot publish or count as evidence
 * until a person links it (or proposes a new service from it). The page refreshes the summary after every action,
 * so a linked card leaves the queue on its own.
 */
interface Props {
  intake: IntakeSummaryItem[];
  growthServiceIds: Set<string>;
  onLink: (item: IntakeSummaryItem, linkIds: string[]) => Promise<void>;
  onPropose: (item: IntakeSummaryItem, name: string, category: string) => Promise<void>;
}

const dot = (color: string): React.CSSProperties => ({ width: 9, height: 9, borderRadius: '50%', display: 'inline-block', background: color });

export function IntakeLegend(): React.ReactElement {
  return (
    <div className="d-flex gap-2 text-secondary flex-wrap align-items-center text-nowrap" style={{ fontSize: '.75rem' }}>
      <span>Match confidence:</span>
      <span><i style={dot('var(--status-success)')} aria-hidden="true" /> 75% or more</span>
      <span><i style={dot('var(--status-warning)')} aria-hidden="true" /> 50-74%</span>
      <span><i style={dot('var(--border-strong)')} aria-hidden="true" /> under 50%</span>
    </div>
  );
}

export default function CaseStudyIntakeQueue({ intake, growthServiceIds, onLink, onPropose }: Props): React.ReactElement {
  if (!intake.length) {
    return (
      <div className="border border-2 border-success-subtle rounded-3 p-3 text-success-emphasis fw-semibold" style={{ borderStyle: 'dashed' }} data-testid="intake-empty">
        ✅ Every case study is linked to a service. Nothing is blocked.
      </div>
    );
  }
  return (
    <div className="row g-3">
      {intake.map((item) => (
        <div key={item.id} className="col-12 col-xl-6">
          {/* Keyed on the suggestion set so a refreshed card re-derives its pre-checked picks. */}
          <IntakeCard key={item.suggestions.map((s) => s.linkId).join(',')} item={item} growthServiceIds={growthServiceIds} onLink={onLink} onPropose={onPropose} />
        </div>
      ))}
    </div>
  );
}
