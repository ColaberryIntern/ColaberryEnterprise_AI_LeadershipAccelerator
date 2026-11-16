import React from 'react';

/**
 * The Colaberry Enterprise lockup: mark + "Colaberry" + the ENTERPRISE tag.
 *
 * SOURCE: Aleem's Colaberry Enterprise Design System,
 * github.com/aleemcolaberry/Colaberry-Enterprise-Design-System, readme.md:
 *   "The Enterprise lockup is mark + Roboto 'Colaberry' + the ENTERPRISE tag."
 *   "assets/cb-enterprise-mark.svg - the cherry-pair mark in berry blue
 *    (#2E6A86) ... token-colorable."
 * The geometry below is that file's, verbatim. The fill is `currentColor`, so
 * the mark takes the accent token on light ground and the dark-mode accent
 * (#6F9DB6, the system's cb-enterprise-mark-dark.svg) on dark, from CSS.
 *
 * WHY THIS EXISTS. Until 2026-11-16 the public site drew
 * /colaberry-logo-transparent.png: the red-and-green Colaberry TRAINING
 * wordmark, the career school's brand. The enterprise mark was never copied
 * into this repository (the design-system sync follows styles.css only, and
 * the marks are not reachable from it), which is how the training logo stayed.
 * Ali: "you are not using the corporate logo - you are using the Colaberry
 * training logo."
 *
 * Lockup rules from the same readme: horizontal lockup at least 120px wide,
 * mark at least 16px, never stretched, rotated or given effects.
 */
export interface EnterpriseLockupProps {
  /** `dark` for dark ground (the footer): the dark-mode accent mark and light text. */
  readonly tone?: 'light' | 'dark';
}

export function EnterpriseMark(): React.ReactElement {
  return (
    <svg
      className="cbv2-lockup__mark"
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      data-enterprise-mark=""
    >
      <circle cx="34" cy="80" r="26" fill="currentColor" />
      <circle cx="94" cy="88" r="18" fill="currentColor" />
      <path d="M36 55 C40 34 50 21 62 15" stroke="currentColor" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M94 71 C92 48 78 24 62 15" stroke="currentColor" strokeWidth="7" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function EnterpriseLockup({ tone = 'light' }: EnterpriseLockupProps): React.ReactElement {
  return (
    <span className={`cbv2-lockup cbv2-lockup--${tone}`}>
      <EnterpriseMark />
      <span className="cbv2-lockup__word">Colaberry</span>
      <span className="cbv2-lockup__tag">Enterprise</span>
    </span>
  );
}
