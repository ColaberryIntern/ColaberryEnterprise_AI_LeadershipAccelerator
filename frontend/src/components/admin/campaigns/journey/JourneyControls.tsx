/**
 * Filters and view switches.
 *
 * All of them operate on one filtered population — the brand and time selectors
 * are sent to the server, the journey-detail and flow/table switches reshape what
 * the client already has. That split is why the table can never disagree with the
 * diagram: both read the same view model.
 */

import React from 'react';
import type { BrandSummary } from '../../../../services/intelligenceApi';
import type { JourneyView } from './campaignSankeyAdapter';

/**
 * Exactly the windows `getTimeWindowCutoff` implements, and no others.
 *
 * Offering a "90 days" option would have been silently wrong: the backend's switch
 * falls through to `null` for any value it does not recognise, which means all
 * time. The control would have looked like it filtered and changed nothing.
 */
export const TIME_WINDOWS = [
  { key: 'all', label: 'All time' },
  { key: '30d', label: 'Last 30 days' },
  { key: '7d', label: 'Last 7 days' },
  { key: '3d', label: 'Last 3 days' },
  { key: '24h', label: 'Last 24 hours' },
];

export const ALL_BRANDS = '__all__';

interface Props {
  timeWindow: string;
  onTimeWindow: (v: string) => void;
  brandId: string;
  brands: BrandSummary[];
  /**
   * When set, the brand selector is disabled with THIS reason. Used by the Campaign 360
   * Journey tab: a campaign belongs to one brand, so the filter is not merely unhelpful there,
   * it could contradict the campaign scope. Kept as a reason rather than hiding the control,
   * matching the convention already followed for the empty-brands case below.
   */
  brandLockedReason?: string;
  onBrand: (v: string) => void;
  journeyView: JourneyView;
  onJourneyView: (v: JourneyView) => void;
  display: 'flow' | 'table';
  onDisplay: (v: 'flow' | 'table') => void;
  onReset: () => void;
  filtersActive: boolean;
  disabled: boolean;
}

export default function JourneyControls({
  timeWindow,
  onTimeWindow,
  brandId,
  brands,
  brandLockedReason,
  onBrand,
  journeyView,
  onJourneyView,
  display,
  onDisplay,
  onReset,
  filtersActive,
  disabled,
}: Props): React.ReactElement {
  return (
    <div className="d-flex align-items-center gap-2 flex-wrap">
      <label className="visually-hidden" htmlFor="journey-time">
        Time window
      </label>
      <select
        id="journey-time"
        className="form-select form-select-sm"
        style={{ width: 'auto' }}
        value={timeWindow}
        onChange={(e) => onTimeWindow(e.target.value)}
        disabled={disabled}
      >
        {TIME_WINDOWS.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>

      <label className="visually-hidden" htmlFor="journey-brand">
        Brand
      </label>
      <select
        id="journey-brand"
        className="form-select form-select-sm"
        style={{ width: 'auto' }}
        value={brandId}
        onChange={(e) => onBrand(e.target.value)}
        // Disabled with a reason rather than hidden: an absent control looks like a
        // missing feature, a disabled one with a title explains itself.
        disabled={disabled || brands.length === 0 || Boolean(brandLockedReason)}
        title={
          brandLockedReason
            ? brandLockedReason
            : brands.length === 0
              ? 'No campaigns in this view, so there is no brand to filter by.'
              : 'Filter every stage to leads who touched a campaign of this brand.'
        }
      >
        <option value={ALL_BRANDS}>All brands</option>
        {brands.map((b) => (
          <option key={b.brand_id} value={b.brand_id}>
            {b.brand_name} ({b.campaign_count})
          </option>
        ))}
      </select>

      <div className="btn-group btn-group-sm" role="group" aria-label="Journey detail">
        <button
          type="button"
          className={`btn btn-sm ${journeyView === 'firstTouch' ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => onJourneyView('firstTouch')}
          disabled={disabled}
          aria-pressed={journeyView === 'firstTouch'}
        >
          First touch
        </button>
        <button
          type="button"
          className={`btn btn-sm ${journeyView === 'campaign' ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => onJourneyView('campaign')}
          disabled={disabled}
          aria-pressed={journeyView === 'campaign'}
        >
          Campaigns
        </button>
      </div>

      <div className="btn-group btn-group-sm" role="group" aria-label="Display mode">
        <button
          type="button"
          className={`btn btn-sm ${display === 'flow' ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => onDisplay('flow')}
          aria-pressed={display === 'flow'}
        >
          Flow
        </button>
        <button
          type="button"
          className={`btn btn-sm ${display === 'table' ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => onDisplay('table')}
          aria-pressed={display === 'table'}
        >
          Table
        </button>
      </div>

      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={onReset}
        disabled={disabled || !filtersActive}
      >
        Reset
      </button>
    </div>
  );
}
