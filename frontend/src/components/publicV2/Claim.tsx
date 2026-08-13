import React from 'react';
import { publicClaim, getClaim, requiresSampleLabel } from '../../config/claimsRegistry';

/**
 * Claim / EvidenceBadge / SampleBadge — the shared primitives that make the
 * site's honesty structural rather than a convention someone has to remember.
 *
 * WHY THESE EXIST
 * The design audit found two failure patterns in the current site:
 *   1. Unverified claims hardcoded as string literals in page components.
 *   2. A dashboard whose sample and live modes are visually IDENTICAL except for
 *      a badge string, so a screenshot of demo data is indistinguishable from a
 *      customer's real data.
 *
 * These components close both. `<Claim>` resolves through the registry and
 * renders nothing when a claim may not ship. `<Metric>` refuses to render at all
 * without an explicit evidence class, so an unlabelled figure is a type error
 * rather than an oversight.
 */

/* ─────────────────────────────────────────────────────────── evidence class ── */

export type EvidenceClass = 'verified' | 'anonymized' | 'illustrative' | 'pending';

const EVIDENCE_LABEL: Record<EvidenceClass, string> = {
  verified: 'Verified',
  anonymized: 'Anonymized',
  illustrative: 'Illustrative demo',
  pending: 'Pending approval',
};

/** Text + glyph, never colour alone — status must survive colour-blindness and greyscale. */
const EVIDENCE_GLYPH: Record<EvidenceClass, string> = {
  verified: '✔',      // heavy check
  anonymized: '◐',    // half-filled circle
  illustrative: '◆',  // filled diamond
  pending: '◷',       // quarter circle
};

export interface EvidenceBadgeProps {
  evidence: EvidenceClass;
  className?: string;
}

export function EvidenceBadge({ evidence, className }: EvidenceBadgeProps): React.ReactElement {
  return (
    <span
      className={`cbv2-evidence cbv2-evidence--${evidence}${className ? ` ${className}` : ''}`}
      data-evidence={evidence}
    >
      <span aria-hidden="true">{EVIDENCE_GLYPH[evidence]}</span>
      {EVIDENCE_LABEL[evidence]}
    </span>
  );
}

export interface SampleBadgeProps {
  /** Render light-on-dark for inverse surfaces. */
  inverse?: boolean;
  className?: string;
}

export function SampleBadge({ inverse, className }: SampleBadgeProps): React.ReactElement {
  return (
    <span
      className={
        `cbv2-sample${inverse ? ' cbv2-sample--inverse' : ''}${className ? ` ${className}` : ''}`
      }
      data-sample="true"
    >
      <span aria-hidden="true">{'◆'}</span>
      Sample data
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────── claim ── */

export interface ClaimProps {
  /** Key into the claims registry. */
  claimKey: string;
  /** Current route, so route-scoped claims can be enforced. */
  route?: string;
  /** Wrapper element. Defaults to a fragment-free span. */
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  /** Rendered instead when the claim may not ship. Defaults to nothing. */
  fallback?: React.ReactNode;
}

/**
 * Renders a governed marketing claim, or nothing.
 *
 * There is deliberately no way to pass raw copy through this component — if a
 * string is not in the registry it cannot be rendered by it, which is what stops
 * the registry from being bypassed under deadline pressure.
 */
export function Claim({
  claimKey,
  route,
  as: Tag = 'span',
  className,
  fallback = null,
}: ClaimProps): React.ReactElement | null {
  const wording = publicClaim(claimKey, route);
  if (wording === null) return <>{fallback}</>;
  return <Tag className={className}>{wording}</Tag>;
}

/** True when a claim exists and is currently publishable — for conditional sections. */
export function canShow(claimKey: string, route?: string): boolean {
  return publicClaim(claimKey, route) !== null;
}

/* ─────────────────────────────────────────────────────────────────── metric ── */

export interface MetricProps {
  value: string;
  label: string;
  /** Optional delta, e.g. "+18 in 8 wks". */
  delta?: string;
  /**
   * REQUIRED. There is no default. An unlabelled figure is the exact defect this
   * component exists to prevent, so omitting it is a compile error.
   */
  evidence: EvidenceClass;
  /** Suppress the inline badge when a single badge already covers the whole block. */
  badgeHidden?: boolean;
  className?: string;
}

/**
 * A figure that cannot render without declaring what kind of number it is.
 *
 * The production `CompanyMomentumDashboard` renders sample and live data
 * identically apart from one badge string; this makes the distinction a required
 * prop instead.
 */
export function Metric({
  value,
  label,
  delta,
  evidence,
  badgeHidden,
  className,
}: MetricProps): React.ReactElement {
  return (
    <div
      className={`cbv2-metric${className ? ` ${className}` : ''}`}
      data-metric="true"
      data-evidence={evidence}
    >
      <div className="cbv2-metric__value">{value}</div>
      <div className="cbv2-metric__label">{label}</div>
      {delta ? <div className="cbv2-metric__delta">{delta}</div> : null}
      {!badgeHidden && evidence === 'illustrative' ? <SampleBadge /> : null}
      {!badgeHidden && evidence !== 'illustrative' ? <EvidenceBadge evidence={evidence} /> : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────── capability notice ──── */

export interface CapabilityNoticeProps {
  claimKey: string;
}

/**
 * Explains, in the UI, why a surface is absent — rather than leaving a hole.
 * Renders only for claims blocked specifically because the capability is unbuilt,
 * so it never leaks the reason a claim failed *verification*.
 */
export function CapabilityNotice({ claimKey }: CapabilityNoticeProps): React.ReactElement | null {
  const claim = getClaim(claimKey);
  if (!claim || claim.capability !== 'unbuilt') return null;
  return (
    <p className="cbv2-capability-notice" role="note">
      In development. This is not available yet, so it is not shown here.
    </p>
  );
}

export { requiresSampleLabel };
