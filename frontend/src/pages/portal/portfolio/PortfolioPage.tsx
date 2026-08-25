import React, { useCallback, useEffect, useRef, useState } from 'react';
import PortalShell from '../today/PortalShell';
import { PaywallScreen } from '../../../components/paywall/PageGate';
import { GATED_FEATURES } from '../../../components/paywall/gatedFeatures';
import { fetchCareerProfile, CareerProfile } from '../../../services/careerApi';
import BaselineBanner from './BaselineBanner';
import StudioOverview from './StudioOverview';
import CapabilityList from './CapabilityList';
import BuildsSection from './BuildsSection';
import PublishingPanel from './PublishingPanel';
import './PortfolioPage.css';

/**
 * PortfolioPage — the private Career Studio at /portal/portfolio.
 *
 * This is a Career Studio, not a public preview (build plan §5): everything here
 * is private, and nothing on this page can publish. The publication surface is a
 * later gate; the "Publishing" tab exists to say so honestly rather than to hide
 * the concept.
 *
 * Access states rendered here mirror the server's own state machine:
 *   402              → PaywallScreen (defensive; <PageGate> normally catches this first)
 *   baseline_missing → the Studio, PLUS an inline prompt for a resume/LinkedIn PDF
 *   ready            → the Studio
 *
 * `baseline_missing` used to be a blocking screen that showed nothing else. It was
 * softened on 2026-08-24 after prod data showed the gate was hiding real earned
 * evidence from the students who had the most of it. See BaselineBanner.
 */

type Tab = 'overview' | 'capabilities' | 'builds' | 'publishing';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'capabilities', label: 'Capabilities' },
  { key: 'builds', label: 'Builds' },
  { key: 'publishing', label: 'Publishing' },
];

type UiState = 'loading' | 'error' | 'gated' | 'loaded';

const PortfolioPage: React.FC = () => {
  const [ui, setUi] = useState<UiState>('loading');
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const load = useCallback(() => {
    setUi('loading');
    fetchCareerProfile()
      .then((p) => { setProfile(p); setUi('loaded'); })
      .catch((err: any) => {
        // Backend content gate. <PageGate> normally blocks the route before this,
        // but a stale entitlement cache must still land on the upsell, not an
        // error page — same defensive pattern ClassroomPage uses.
        if (err?.response?.status === 402) { setUi('gated'); return; }
        setUi('error');
      });
  }, []);

  useEffect(load, [load]);

  /** Roving-focus arrow-key navigation across the tablist (WCAG 2.1 AA). */
  const onTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next =
      e.key === 'Home' ? 0
      : e.key === 'End' ? TABS.length - 1
      : e.key === 'ArrowRight' ? (idx + 1) % TABS.length
      : (idx - 1 + TABS.length) % TABS.length;
    setTab(TABS[next].key);
    tabRefs.current[next]?.focus();
  };

  if (ui === 'gated') {
    return <PortalShell><PaywallScreen copy={GATED_FEATURES.portfolio} /></PortalShell>;
  }

  if (ui === 'loading') {
    return (
      <PortalShell>
        <div className="te-page-h">
          <div className="crumb">Your career</div>
          <h1>Your portfolio</h1>
        </div>
        <div className="cp-skeleton" role="status" aria-live="polite">Loading your portfolio…</div>
      </PortalShell>
    );
  }

  if (ui === 'error' || !profile) {
    return (
      <PortalShell>
        <div className="te-page-h">
          <div className="crumb">Your career</div>
          <h1>Your portfolio</h1>
        </div>
        <div className="cp-error" role="alert">
          <h2>We couldn’t load your portfolio</h2>
          <p>Nothing was lost — your work and evidence are safe. This was a problem reading them.</p>
          <button type="button" className="cp-btn cp-btn-primary" onClick={load}>Try again</button>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <div className="te-page-h cp-head">
        <div>
          <div className="crumb">Your career</div>
          <h1>Your portfolio</h1>
          <div className="sub">
            Everything you learn, build and prove here becomes your portfolio automatically.
            You don’t assemble it. It grows.
          </div>
        </div>
        <span className="cp-privacy" title="Only you can see this">
          <svg viewBox="0 0 24 24" fill="none" width="14" height="14" aria-hidden="true">
            <rect x="5" y="10" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2.4" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          Private
        </span>
      </div>

      {profile.degraded.length > 0 && (
        <div className="cp-degraded" role="status">
          Some sections couldn’t be loaded just now ({profile.degraded.join(', ')}). Everything else is up to date.
          <button type="button" className="cp-link" onClick={load}>Retry</button>
        </div>
      )}

      {profile.state === 'baseline_missing' && <BaselineBanner />}

      <div className="cp-tabs" role="tablist" aria-label="Portfolio sections">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => { tabRefs.current[i] = el; }}
            type="button"
            role="tab"
            id={`cp-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`cp-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            className={`cp-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
            onKeyDown={(e) => onTabKeyDown(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`cp-panel-${tab}`}
        aria-labelledby={`cp-tab-${tab}`}
        tabIndex={0}
        className="cp-panel"
      >
        {tab === 'overview' && <StudioOverview profile={profile} onJump={setTab} />}
        {tab === 'capabilities' && <CapabilityList capabilities={profile.capabilities} />}
        {tab === 'builds' && (
          <BuildsSection
            artifacts={profile.artifacts}
            projects={profile.projects}
            github={profile.github}
          />
        )}
        {tab === 'publishing' && <PublishingPanel />}
      </div>
    </PortalShell>
  );
};

export default PortfolioPage;
