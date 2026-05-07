import React from 'react';

export interface RegressionRiskOverlayProps {
  recurrenceCount: number;
  recommendedAlternative?: string;
}

/**
 * Compact icon + tooltip for step rows whose cluster_signature has a
 * regression-prone history (≥3× recurrence in 30d). Hover surfaces
 * the recommended alternative the engine derived per cluster_type.
 */
export function RegressionRiskOverlay({ recurrenceCount, recommendedAlternative }: RegressionRiskOverlayProps) {
  return (
    <span
      className="d-inline-flex align-items-center gap-1"
      title={recommendedAlternative
        ? `Recurred ${recurrenceCount}× in 30d. ${recommendedAlternative}`
        : `Recurred ${recurrenceCount}× in 30d — regression-prone.`}
      style={{ color: '#b91c1c', fontSize: 10, fontWeight: 600 }}
    >
      <i className="bi bi-arrow-repeat" style={{ fontSize: 11 }}></i>
      <span>×{recurrenceCount}</span>
    </span>
  );
}
