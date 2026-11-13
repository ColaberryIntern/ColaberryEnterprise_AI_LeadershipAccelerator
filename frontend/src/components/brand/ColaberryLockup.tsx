import React from 'react';

/**
 * D14 — the Colaberry horizontal lockup, as artwork.
 *
 * Three surfaces hand-set the wordmark as a Quicksand logotype with a cherry-red "C"
 * (PublicNavbar, LiveSessionPage, ClassCheckinPage). Each kept its own near-identical copy of
 * the same two CSS rules under a different prefix, at three different font sizes, and each
 * depended on the Quicksand webfont having loaded. A logotype reproduced by hand in three
 * places is three places it can drift; the artwork cannot drift at all.
 *
 * It also carries the cherry mark, so this component replaces the separate icon image
 * alongside the wordmark rather than sitting next to it.
 *
 * NOT a theme-aware asset: the lockup is a fixed-colour PNG. Every surface using it today is
 * light-background only. A dark surface needs a light-on-dark variant of the artwork, not a
 * CSS filter over this one.
 */

/** Intrinsic size of public/colaberry-horizontal.png. Width is derived so it cannot be set wrong. */
const ART_WIDTH = 436;
const ART_HEIGHT = 102;

export interface ColaberryLockupProps {
  /** Rendered height in CSS pixels. Width follows the artwork's own aspect ratio. */
  height?: number;
  /**
   * Leave as the default empty string wherever the surrounding element already carries the
   * name (a link labelled "Colaberry home", a heading that identifies the site). Pass
   * "Colaberry" only where this lockup is the sole thing identifying whose page this is,
   * otherwise a screen reader hears the name twice.
   */
  alt?: string;
  className?: string;
}

export default function ColaberryLockup({
  height = 30, alt = '', className,
}: ColaberryLockupProps) {
  const width = Math.round((ART_WIDTH / ART_HEIGHT) * height);
  return (
    <img
      src="/colaberry-horizontal.png"
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={{ display: 'block', height, width }}
    />
  );
}
