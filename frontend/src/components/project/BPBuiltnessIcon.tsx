/**
 * BPBuiltnessIcon — shared compact icon expressing a BP's "is it built?"
 * status. Operator scans icons left-to-right; full meaning on hover.
 *
 *   - check-circle (green) → page built + UI Advisor verified, OR usable cap
 *   - eye         (blue)   → page built, UI Advisor pending
 *   - dot         (blue)   → partial / forming (≥50% reqs matched)
 *   - circle-half (blue)   → early (some matches)
 *   - circle      (muted)  → no signal yet (Not built yet)
 *
 * Extracted from BPDomainSurfaceRows on 2026-05-22 so the Components tab
 * (CapabilityGrid) and the BPs tab (BPDomainSurfaceRows) render the same
 * single-icon status surface — instead of the prior split where one tab
 * used the icon and the other used a "Built / Wired / Partial / Not built
 * yet" text badge. Operators stop having to learn two vocabularies for
 * the same data.
 *
 * The `deriveBuiltnessProps(bp)` helper produces the icon's props from a
 * raw BP record so each caller doesn't have to reproduce the derivation
 * logic. Keep that function the SINGLE source of truth for what makes a
 * cap "built" visually — both tabs will share its behavior.
 */
import React from 'react';

export interface BuiltnessIconProps {
  isPage: boolean;
  pageHasFrontend: boolean;
  usable: boolean;
  /** % of requirements matched, 0-100. */
  pct: number;
  /** Hover-text appended after the status word. */
  tooltip: string;
}

export const BuiltnessIcon: React.FC<BuiltnessIconProps> = ({
  isPage, pageHasFrontend, usable, pct, tooltip,
}) => {
  // isPage retained for API symmetry with the historical helper signature;
  // the actual branching reads pageHasFrontend (which already includes the
  // is-a-page check), so isPage is informational and matches caller intent.
  void isPage;

  let icon: string;
  let color: string;
  let label: string;
  if (pageHasFrontend) {
    if (usable) { icon = 'bi-check-circle-fill'; color = '#15803d'; label = 'Page built · UI Advisor verified'; }
    else        { icon = 'bi-eye';                color = '#1d4ed8'; label = 'Page built · UI review pending'; }
  } else if (usable) {
    icon = 'bi-check-circle-fill'; color = '#15803d'; label = 'Usable';
  } else if (pct >= 50) {
    icon = 'bi-dot'; color = '#1d4ed8'; label = 'Forming';
  } else if (pct > 0) {
    icon = 'bi-circle-half'; color = '#1d4ed8'; label = 'Early';
  } else {
    icon = 'bi-circle'; color = 'var(--color-text-light)'; label = 'Not built yet';
  }
  return (
    <i
      className={`bi ${icon}`}
      title={`${label}\n${tooltip}`}
      aria-label={label}
      style={{
        fontSize: 14, color, flexShrink: 0,
        opacity: icon === 'bi-circle' ? 0.55 : 1,
      }}
    />
  );
};

// ─── Derivation helper ──────────────────────────────────────────────────────

/**
 * Compute the props BuiltnessIcon needs from a raw BP record. Mirrors the
 * logic that lived inline in BPDomainSurfaceRows before this extraction.
 *
 * Reads only documented BP fields: `is_page_bp`, `source`, `name`,
 * `frontend_route`, `usability.{usable,frontend}`, `matched_requirements`,
 * `total_requirements`. Any field may be missing — the helper degrades
 * to the "Not built yet" icon rather than throwing.
 */
export function deriveBuiltnessProps(bp: any): BuiltnessIconProps {
  const matched = bp?.matched_requirements ?? 0;
  const total = bp?.total_requirements ?? 0;
  const pct = total > 0 ? Math.round((matched / total) * 100) : 0;
  const usable = bp?.usability?.usable === true;
  // A cap is "Page-like" if any of these signals fire (matches the
  // 2026-05-20 widening: brownfield caps can have routes after Phase 0
  // backfilled them from linked components).
  const isPage = !!bp?.is_page_bp
    || bp?.source === 'frontend_page'
    || (typeof bp?.name === 'string' && /\s(landing\s)?page$/i.test(bp.name))
    || !!bp?.frontend_route;
  const pageHasFrontend = isPage && (
    !!bp?.frontend_route
    || (bp?.usability?.frontend && bp.usability.frontend !== 'missing')
  );
  // Compose a tooltip that always tells the operator the underlying ratio.
  const tooltip = total > 0
    ? `Coverage: ${matched}/${total} requirements matched (${pct}%).`
    : 'No requirements extracted yet — the build signal above tells the real story.';
  return { isPage, pageHasFrontend, usable, pct, tooltip };
}
