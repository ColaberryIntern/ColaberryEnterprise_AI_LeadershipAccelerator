import React from 'react';

interface CoryBadgeProps {
  onClick: () => void;
  tooltip?: string;
  size?: number;
}

/**
 * Small Cory "C" icon badge for charts and KPI cards.
 * Click to get an executive report from Cory about the data.
 */
export default function CoryBadge({ onClick, tooltip = 'Ask Cory to analyze', size = 20 }: CoryBadgeProps) {
  return (
    <span
      role="button"
      aria-label={tooltip}
      title={tooltip}
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClick(); } }}
      className="d-inline-flex align-items-center justify-content-center rounded-circle cory-badge-hover"
      style={{
        width: size,
        height: size,
        background: 'var(--color-primary)',
        color: '#fff',
        fontSize: size * 0.55,
        fontWeight: 700,
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        lineHeight: 1,
      }}
    >
      C
    </span>
  );
}
