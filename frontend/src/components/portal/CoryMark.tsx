import React from 'react';

/**
 * Cory — the student mentor's mark. A faceless, genderless "spark" (no photo,
 * no depicted person, no gender), per the locked Cory persona. Graphite by
 * default; pass `color` to place it on a coloured surface (e.g. white on the
 * launcher gradient). Shared by the mentor chat and the project-activity byline.
 */
export const CorySpark: React.FC<{ size?: number; color?: string; className?: string }> = ({
  size = 40,
  color = '#2d3748',
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    className={className}
    style={{ display: 'block', flexShrink: 0 }}
    aria-hidden="true"
  >
    <path
      d="M24 4 C25 19 29 23 44 24 C29 25 25 29 24 44 C23 29 19 25 4 24 C19 23 23 19 24 4 Z"
      fill={color}
    />
  </svg>
);

/** Cory's chat avatar — the spark centred on a soft neutral disc. */
export const CoryAvatar: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <div
    className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
    style={{ width: size, height: size, background: '#eaeef4' }}
  >
    <CorySpark size={Math.round(size * 0.62)} />
  </div>
);
