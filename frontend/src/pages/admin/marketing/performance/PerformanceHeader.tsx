import React from 'react';

/**
 * Title, subtitle and the chips that say what the numbers below are scoped to.
 *
 * THE CHIPS ARE NOT FILTERS. They are a read-out. The date window on this tab is fixed at 30 days
 * by the caller, and the brand/date pickers above the tab bar apply to the Revenue tab only -
 * `PerformanceScopeBar` already says so in words. A chip that looks like a control but changes
 * nothing is worse than no chip, so these are plain statements of scope.
 */
export default function PerformanceHeader({
  windowDays, brandLabel,
}: {
  windowDays: number | null;
  brandLabel?: string | null;
}) {
  return (
    <div className="mp-head">
      <div>
        <h2 className="mp-head__title">From ad click to coming back</h2>
        <p className="mp-head__sub">
          Every stage measured on its own, so a gap between two of them is visible rather than
          smoothed away.
        </p>
      </div>
      <div className="mp-chips">
        {brandLabel ? (
          <span className="mp-chip">Brand <b>{brandLabel}</b></span>
        ) : (
          <span className="mp-chip">Brand <b>All</b></span>
        )}
        <span className="mp-chip">
          Window <b>{windowDays == null ? '—' : `${windowDays} days`}</b>
        </span>
      </div>
    </div>
  );
}
