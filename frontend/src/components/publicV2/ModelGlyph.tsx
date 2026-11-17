import React from 'react';

/**
 * ModelGlyph - the line icons Ali's site model draws (24px grid, 2px round stroke).
 *
 * The model inlines each SVG. These are the same paths, by name, so the service
 * pages, the demo-pilot band and the inclusion lists draw what the model draws
 * rather than the nearest icon from the older set in Icon.tsx.
 */
const PATHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  bars: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7 9l3 3-3 3M12.5 15H17" />
    </>
  ),
  ringCheck: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M8 12.3l2.7 2.7L16.2 9.5" />
    </>
  ),
  ringMinus: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M8 12h8" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <circle cx="17" cy="7" r="2.6" />
      <path d="M17 12.5c2.6 0 4.3 1.6 4.8 4.5" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  code: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16" />,
  shield: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  cap: (
    <>
      <path d="M2 9l10-5 10 5-10 5z" />
      <path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  chat: (
    <>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.8-4.4 3.9-6.5 8-6.5s7.2 2.1 8 6.5" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="M15.5 10.5l6-3.5v10l-6-3.5" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
} as const;

export type GlyphName = keyof typeof PATHS;

export default function ModelGlyph({
  name,
  size = 20,
  className,
}: {
  name: GlyphName;
  size?: number;
  className?: string;
}): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'arrow' ? 2.2 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
