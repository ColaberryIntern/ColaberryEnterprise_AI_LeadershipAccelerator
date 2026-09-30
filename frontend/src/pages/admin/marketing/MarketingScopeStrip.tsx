import React from 'react';
import {
  ALL_BRANDS,
  comparisonLabel,
  comparisonRange,
  freshnessLabel,
  rangeLengthDays,
  type ComparisonMode,
  type MarketingScope,
  type ScopeComparison,
} from './marketingScope';
import type { Brand } from '../../../services/adminBrandApi';

/**
 * MarketingScopeStrip — the one place that says what the numbers below are ABOUT.
 *
 * Every figure on the command center is filtered by brand and by date range, and a dashboard
 * that shows filtered numbers without showing the filter is the most ordinary way to mislead
 * someone: the totals look like totals. So the strip states the scope in words, including the
 * comparison window, rather than leaving the operator to infer it from two date inputs.
 *
 * All arithmetic lives in `marketingScope.ts` and is tested there. This component only renders
 * and emits - it computes nothing it could get wrong.
 */

export interface MarketingScopeStripProps {
  scope: MarketingScope;
  brands: Brand[];
  /** Brands still loading — the selector says so rather than looking like an empty list. */
  brandsLoading: boolean;
  /** ISO timestamp of the last SUCCESSFUL fetch, or null when nothing has loaded. */
  fetchedAt: string | null;
  /** Injected so the label is deterministic in tests and never reads a clock at render. */
  now: number;
  /**
   * The server's totals for the stated comparison window, or null when none was requested or
   * none has arrived. The strip is the consumer of the window it states: without this prop it
   * printed a comparison nothing rendered (the verifier's finding).
   */
  comparison?: ScopeComparison | null;
  onScopeChange: (next: MarketingScope) => void;
}

const COMPARISON_LABELS: Record<ComparisonMode, string> = {
  none: 'No comparison',
  previous_period: 'Previous period',
  previous_year: 'Same period last year',
};

export default function MarketingScopeStrip(props: MarketingScopeStripProps) {
  const { scope, brands, brandsLoading, fetchedAt, now, comparison = null, onScopeChange } = props;

  const compare = comparisonRange(scope.range, scope.comparison);
  const days = rangeLengthDays(scope.range);

  const set = (patch: Partial<MarketingScope>) => onScopeChange({ ...scope, ...patch });

  return (
    <div className="d-flex flex-wrap align-items-end gap-3 px-3 py-2 border-bottom bg-light" data-testid="scope-strip">
      <div>
        <label className="form-label small text-muted mb-1" htmlFor="scope-brand">Brand</label>
        <select
          id="scope-brand"
          className="form-select form-select-sm"
          value={scope.brand}
          disabled={brandsLoading}
          onChange={(e) => set({ brand: e.target.value })}
          style={{ minWidth: 200 }}
        >
          {/* "All authorized brands", not "All brands" - the list is already scoped to this
              operator's memberships, and claiming otherwise would overstate what is shown. */}
          <option value={ALL_BRANDS}>
            {brandsLoading ? 'Loading brands...' : 'All authorized brands'}
          </option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="form-label small text-muted mb-1" htmlFor="scope-start">From</label>
        <input
          id="scope-start"
          type="date"
          className="form-control form-control-sm"
          value={scope.range.start}
          max={scope.range.end}
          onChange={(e) => set({ range: { ...scope.range, start: e.target.value } })}
        />
      </div>

      <div>
        <label className="form-label small text-muted mb-1" htmlFor="scope-end">To</label>
        <input
          id="scope-end"
          type="date"
          className="form-control form-control-sm"
          value={scope.range.end}
          min={scope.range.start}
          onChange={(e) => set({ range: { ...scope.range, end: e.target.value } })}
        />
      </div>

      <div>
        <label className="form-label small text-muted mb-1" htmlFor="scope-compare">Compared to</label>
        <select
          id="scope-compare"
          className="form-select form-select-sm"
          value={scope.comparison}
          onChange={(e) => set({ comparison: e.target.value as ComparisonMode })}
        >
          {(Object.keys(COMPARISON_LABELS) as ComparisonMode[]).map((m) => (
            <option key={m} value={m}>{COMPARISON_LABELS[m]}</option>
          ))}
        </select>
      </div>

      <div className="ms-auto text-end small">
        {/* The comparison window is SPELLED OUT. "vs previous period" tells an operator nothing
            about which days were actually compared, and that is precisely where an off-by-one
            hides. */}
        <div className="text-muted">
          {days} day{days === 1 ? '' : 's'}
          {compare ? ` vs ${compare.start} to ${compare.end}` : ' · no comparison'}
        </div>
        {compare && comparison && (
          <div className="text-muted" data-testid="comparison-totals">
            leads {comparisonLabel(comparison.current.leads_count, comparison.prior.leads_count)}
            {' · '}engagement {comparisonLabel(comparison.current.engagement_count, comparison.prior.engagement_count)}
            {' · '}enrolments {comparisonLabel(comparison.current.enrollments_count, comparison.prior.enrollments_count)}
          </div>
        )}
        {/* Freshness is the real fetch time or an explicit "not loaded" - never a clock read
            at render, which would report the moment this component drew as the data's age. */}
        <div className={fetchedAt ? 'text-muted' : 'text-muted fst-italic'} data-testid="freshness">
          {freshnessLabel(fetchedAt, now)}
        </div>
      </div>
    </div>
  );
}
