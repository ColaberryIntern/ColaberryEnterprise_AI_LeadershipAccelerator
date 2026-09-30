import React from 'react';

/**
 * Icon -- the V2 icon system, ported from the approved prototype's icons.js.
 *
 * One 24px grid, 1.6 stroke, round caps and joins, `currentColor` throughout, so
 * an icon always matches the text it sits beside and needs no per-theme variant.
 * No CDN, no icon font, no emoji, no raster: the prototype's design review scored
 * emoji-as-bullets 2/10, and these replaced them.
 *
 * The prototype injected a hidden <symbol> sprite into the DOM and referenced it
 * with <use href="#i-name">. That is the right call for a static page with many
 * repeats. In React it is the wrong one: <use> against an injected sprite breaks
 * whenever the sprite mounts after the consumer, which is exactly what happens
 * with route-level code splitting. Rendering the paths inline per icon costs a
 * few bytes more and cannot desynchronise.
 *
 * ACCESSIBILITY
 * Icons here are decorative by default -- aria-hidden, no title -- because every
 * place they appear already has a visible text label beside them. Pass `title`
 * only when an icon carries meaning no adjacent text conveys, and it becomes a
 * labelled img role instead.
 */

/** Multi-subpath strings are split on " M" and rendered as separate <path>s. */
const PATHS = {
  /* discovery / strategy */
  compass: 'M12 21a9 9 0 100-18 9 9 0 000 18z M15.2 8.8l-1.6 4.4-4.4 1.6 1.6-4.4z',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18z M12 17a5 5 0 100-10 5 5 0 000 10z M12 13a1 1 0 100-2 1 1 0 000 2z',
  map: 'M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z M9 4v13 M15 6.5v13',

  /* build / system */
  blocks: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  cpu: 'M7 7h10v10H7z M4 10h3 M4 14h3 M17 10h3 M17 14h3 M10 4v3 M14 4v3 M10 17v3 M14 17v3',
  layers: 'M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5 M3 17l9 5 9-5',
  wrench: 'M15 5a4 4 0 00-5.3 5.3L4 16v4h4l5.7-5.7A4 4 0 0019 9l-2.5 2.5L14 9l2.5-2.5A4 4 0 0015 5z',
  plug: 'M9 3v6 M15 3v6 M7 9h10v3a5 5 0 01-10 0V9z M12 17v4',

  /* governance / trust */
  shield: 'M12 3l7 3v6c0 4.4-3 8.2-7 9-4-.8-7-4.6-7-9V6l7-3z',
  shieldCheck: 'M12 3l7 3v6c0 4.4-3 8.2-7 9-4-.8-7-4.6-7-9V6l7-3z M9 12l2 2 4-4',
  lock: 'M7 11V8a5 5 0 0110 0v3 M5 11h14v9H5z M12 15v2',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z M12 15a3 3 0 100-6 3 3 0 000 6z',
  scale: 'M12 4v16 M7 20h10 M12 7l-6 2 3 5 3-5 3 5 3-5-6-2z',

  /* people / growth */
  people: 'M16 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2 M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7 M21 20v-2a4 4 0 00-3-3.9 M16 3.1a4 4 0 010 7.8',
  ladder: 'M7 3v18 M17 3v18 M7 8h10 M7 13h10 M7 18h10',
  spark: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z',
  trend: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
  medal: 'M12 13a5 5 0 100-10 5 5 0 000 10z M8.5 12L7 21l5-2.5L17 21l-1.5-9',

  /* evidence / delivery */
  doc: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z M14 3v5h5 M9 13h6 M9 17h6',
  check: 'M4 12.5l5 5L20 6.5',
  clipboard: 'M9 4h6v3H9z M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 12h6 M9 16h4',
  gauge: 'M12 20a8 8 0 100-16 8 8 0 000 16z M12 12l4-3',
  pulse: 'M3 12h4l2.5-7 4 14L16 12h5',

  /* interface */
  arrowRight: 'M5 12h13 M13 6l6 6-6 6',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6l1-7z',
  play: 'M8 5l11 7-11 7V5z',
  grid: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
} as const;

export type IconName = keyof typeof PATHS;

/** Exported so a test can assert every name still resolves to path data. */
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export interface IconProps {
  name: IconName;
  /** Rendered size in px. Stroke stays optically even because the grid is fixed. */
  size?: number;
  className?: string;
  /** Supply ONLY when the icon carries meaning no nearby text already gives. */
  title?: string;
}

function Icon({ name, size = 24, className, title }: IconProps): React.ReactElement {
  const segments = PATHS[name].split(' M').map((seg, i) => (i ? `M${seg}` : seg));
  const labelled = Boolean(title);

  return (
    <svg
      className={`cbv2-ic${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={labelled ? 'img' : undefined}
      aria-hidden={labelled ? undefined : true}
      aria-label={labelled ? title : undefined}
      focusable="false"
    >
      {segments.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export default Icon;
