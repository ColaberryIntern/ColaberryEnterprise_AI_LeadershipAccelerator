import React from 'react';
import PortalShell from '../../pages/portal/today/PortalShell';
import { useEntitlement } from '../../pages/portal/useEntitlement';
import { GATED_FEATURES, GatedFeatureKey, gatedFeatureIcon } from './gatedFeatures';
import './paywall.css';

/**
 * PaywallScreen — the shared "here's what you get, pay to unlock" visual for
 * every gated page. Exported separately from <PageGate> so a page's own data
 * fetch can render the SAME screen defensively on a 402 from the backend gate
 * (see ClassroomPage.tsx's 'gated' uiState) without re-running the entitlement
 * hook — there is exactly one visual implementation, not two that could drift.
 */
export const PaywallScreen: React.FC<{ copy: (typeof GATED_FEATURES)[GatedFeatureKey] }> = ({ copy }) => (
  <div className="pg-wrap">
    <div className="pg-backdrop" aria-hidden="true">
      <span className="pg-ghost" /><span className="pg-ghost" /><span className="pg-ghost" />
    </div>
    <div className="pg-panel" role="region" aria-label={copy.title}>
      <span className="pg-icon">
        {gatedFeatureIcon(copy.key)}
        <span className="pg-icon-lock">
          <svg viewBox="0 0 24 24" fill="none" width="12" height="12"><rect x="5" y="10" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2.4" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
        </span>
      </span>
      <div className="pg-eyebrow">{copy.eyebrow} · Paid feature</div>
      <h2 className="pg-title">{copy.title}</h2>
      <p className="pg-subtitle">{copy.subtitle}</p>
      <ul className="pg-benefits">
        {copy.benefits.map((b) => (
          <li key={b}>
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {b}
          </li>
        ))}
      </ul>
      <a className="pg-cta" href={copy.ctaTo}>{copy.ctaLabel}</a>
      <button type="button" className="pg-refresh" onClick={() => window.location.reload()}>
        Already enrolled and paid? Refresh
      </button>
    </div>
  </div>
);

/**
 * PageGate — wraps a route's element. Staff/entitled renders the real page;
 * everyone else gets the PaywallScreen instead, and the wrapped page's own code
 * never even mounts (no wasted data fetch for a student who was never going to
 * see it). See routes/portalRoutes.tsx for usage.
 */
export const PageGate: React.FC<{ feature: GatedFeatureKey; children: React.ReactNode }> = ({ feature, children }) => {
  const { isStaff, hasFullAccess, loading } = useEntitlement();
  if (loading) return <PortalShell><div className="pg-loading">Loading…</div></PortalShell>;
  if (isStaff || hasFullAccess) return <>{children}</>;
  return <PortalShell><PaywallScreen copy={GATED_FEATURES[feature]} /></PortalShell>;
};

export default PageGate;
