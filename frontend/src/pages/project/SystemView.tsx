/**
 * SystemView — the L4 understanding surface.
 *
 * System View Restructure Sprint, 2026-05-09.
 *
 * Replaces the 4,295-line SystemViewV2 as the user-facing target of
 * `/portal/project/system`. The legacy SystemViewV2 surface is
 * preserved at `/portal/project/system-legacy` for rollback only.
 *
 * Hard rule: this surface EXPLAINS. It does NOT decide, prioritize,
 * rank, recommend, or orchestrate. Cory at Home owns authority;
 * Critique improves; Blueprint executes; Verify confirms; System
 * understands. Anything that violates that boundary belongs in another
 * surface.
 *
 * Layout: 5 tabs. CORE tabs (Components default · Architecture · BPs)
 * load eagerly; ADVANCED tabs (Operations · Cognition) lazy-mount on
 * first click and use their own progressive disclosure.
 *
 * Tab persistence: `?tab=components|architecture|bps|operations|cognition`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CapabilityGrid from '../../components/project/CapabilityGrid';
import BPDomainSurface from '../../components/project/BPDomainSurface';
import SystemArchitectureCard from '../../components/project/SystemArchitectureCard';
import { OperatorCognitionDashboard } from '../../components/operator/OperatorCognitionDashboard';
import { AutonomousExecutionDashboard } from '../../components/operator/AutonomousExecutionDashboard';
import { useWorkspaceMemory } from '../../hooks/useWorkspaceMemory';

type TabKey = 'components' | 'architecture' | 'bps' | 'operations' | 'cognition';

interface TabSpec {
  key: TabKey;
  label: string;
  icon: string;
  advanced?: boolean;
  description: string;
}

const TABS: TabSpec[] = [
  { key: 'components', label: 'Components', icon: 'bi-grid-3x3-gap', description: 'What exists in the system.' },
  { key: 'architecture', label: 'Architecture', icon: 'bi-diagram-3', description: 'How the system is connected.' },
  { key: 'bps', label: 'BPs', icon: 'bi-list-ul', description: 'Business processes and their structure.' },
  { key: 'operations', label: 'Operations', icon: 'bi-activity', advanced: true, description: 'Advanced runtime visibility.' },
  { key: 'cognition', label: 'Cognition', icon: 'bi-cpu', advanced: true, description: 'Advanced intelligence visibility.' },
];

const DEFAULT_TAB: TabKey = 'components';

const SystemView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { memory, update } = useWorkspaceMemory();

  // Continuity + Resume Flow Sprint, 2026-05-12 — initial tab resolution priority:
  //   1. ?tab=… query param (explicit user intent, deep-link)
  //   2. memory.lastSystemTab (last tab the operator was on)
  //   3. DEFAULT_TAB (components)
  // The memory branch makes navigating away + back land the operator
  // exactly where they left off without giant breadcrumbs.
  const queryTab = searchParams.get('tab') as TabKey | null;
  const validQuery = queryTab && TABS.some(t => t.key === queryTab) ? queryTab : null;
  const validMemory = memory.lastSystemTab && TABS.some(t => t.key === memory.lastSystemTab as TabKey)
    ? (memory.lastSystemTab as TabKey)
    : null;
  const resolvedInitial = validQuery ?? validMemory ?? DEFAULT_TAB;

  const [active, setActive] = useState<TabKey>(resolvedInitial);

  // Lazy-mount tracker so advanced tabs don't load until first viewed. The
  // RESTORED initial tab (not just 'components') is marked mounted on first
  // render so the operator's last surface paints immediately.
  const [hasMounted, setHasMounted] = useState<Record<TabKey, boolean>>(() => ({
    components: resolvedInitial === 'components',
    architecture: resolvedInitial === 'architecture',
    bps: resolvedInitial === 'bps',
    operations: resolvedInitial === 'operations',
    cognition: resolvedInitial === 'cognition',
  }));

  // If we resolved the tab from memory (no query param), reflect it in the
  // URL so the surface is shareable and the back-button works naturally.
  // Guarded by `mounted` so the rewrite happens exactly once per mount;
  // subsequent searchParams changes (from user clicks) are no-ops here.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (mounted) return;
    setMounted(true);
    if (!queryTab && validMemory) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', resolvedInitial);
      setSearchParams(next, { replace: true });
    }
  }, [mounted, queryTab, validMemory, resolvedInitial, searchParams, setSearchParams]);

  const setTab = (key: TabKey) => {
    setActive(key);
    setHasMounted(prev => ({ ...prev, [key]: true }));
    update({ lastSystemTab: key });
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  // BP restoration: read memory.lastBpId once on mount and pass to the
  // BPs tab as its initial selection. PortalBusinessProcessesTab already
  // persists its own active_component_id to localStorage; we sync memory
  // on unmount + visibilitychange so the next visit lands on the same BP.
  const initialBpId = memory.lastBpId || null;
  useEffect(() => {
    const syncBpToMemory = () => {
      try {
        const current = localStorage.getItem('active_component_id');
        if (current && current !== memory.lastBpId) update({ lastBpId: current });
      } catch { /* ignore */ }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') syncBpToMemory(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', syncBpToMemory);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', syncBpToMemory);
      syncBpToMemory();
    };
  }, [memory.lastBpId, update]);

  const activeSpec = useMemo(() => TABS.find(t => t.key === active)!, [active]);

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>

      {/* ─── Editorial header ─────────────────────────── */}
      {/* System Surface Maturity Sprint, 2026-05-12 — calmer header rhythm.
          Wider top padding, lighter weight subtitle, longer cascade between
          eyebrow / title / explainer. Goal: feels editorial, not toolbar. */}
      <header style={{ marginBottom: '2rem' }}>
        <div style={{
          fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em',
          color: 'var(--color-text-light)', fontWeight: 600,
        }}>
          System
        </div>
        <h2 style={{
          fontSize: 26, fontWeight: 600, color: 'var(--color-primary)',
          letterSpacing: '-0.015em', marginTop: 8, marginBottom: 10,
          lineHeight: 1.25,
        }}>
          Understand how your system is organized.
        </h2>
        <div style={{
          fontSize: 13.5, color: 'var(--color-text-light)',
          lineHeight: 1.65, maxWidth: 720,
        }}>
          This surface explains operational architecture — the domains your work belongs to,
          how their pieces connect, and where each area sits in its lifecycle. It does not rank
          or recommend; <Link to="/portal/home" style={{ color: 'var(--color-primary-light)' }}>Cory at Home</Link>{' '}
          decides what's next.
        </div>
      </header>

      {/* ─── Tab strip ─────────────────────────── */}
      <div
        role="tablist"
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: '2rem',
          gap: 4,
          overflowX: 'auto',
        }}
      >
        {TABS.map(tab => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              role="tab"
              type="button"
              onClick={() => setTab(tab.key)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                padding: '0.55rem 0.95rem',
                marginBottom: -1,
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-light)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              <i className={`bi ${tab.icon}`}></i>
              {tab.label}
              {tab.advanced && (
                <span style={{
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  background: 'var(--color-purple-bg, rgba(99,102,241,0.08))',
                  color: 'var(--color-purple, #6366f1)',
                  padding: '0.1rem 0.35rem',
                  borderRadius: 3,
                  fontWeight: 600,
                  marginLeft: 2,
                }}>advanced</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Active tab subtitle — only shown when distinct from the
          tab's own header to avoid doubled labels. BPDomainSurface ships
          its own editorial headline. */}
      {active !== 'bps' && (
        <div style={{
          fontSize: 12.5, color: 'var(--color-text-light)',
          marginBottom: '1.5rem', fontStyle: 'italic',
        }}>
          {activeSpec.description}
        </div>
      )}

      {/* ─── Tab panels — keep mounted once shown to preserve scroll ─── */}
      <div role="tabpanel" hidden={active !== 'components'}>
        {hasMounted.components && <ComponentsTab />}
      </div>
      <div role="tabpanel" hidden={active !== 'architecture'}>
        {hasMounted.architecture && <ArchitectureTab />}
      </div>
      <div role="tabpanel" hidden={active !== 'bps'}>
        {hasMounted.bps && <BPsTab initialBpId={initialBpId} />}
      </div>
      <div role="tabpanel" hidden={active !== 'operations'}>
        {hasMounted.operations && <OperationsTab />}
      </div>
      <div role="tabpanel" hidden={active !== 'cognition'}>
        {hasMounted.cognition && <CognitionTab />}
      </div>

      {/* ─── Footer meta — quiet legacy fallback ─────────── */}
      <div style={{
        fontSize: 11, color: 'var(--color-text-light)', textAlign: 'center',
        marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)',
      }}>
        Need the full operator dashboard?{' '}
        <Link to="/portal/project/system-legacy" style={{ color: 'var(--color-text-light)', textDecoration: 'underline' }}>
          Open the legacy view
        </Link>.
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────
// Tabs — kept thin. Each tab wraps an existing component or two.
// ──────────────────────────────────────────────────────────────────

const ComponentsTab: React.FC = () => (
  <section>
    <TabIntro
      title="Components"
      blurb="Every capability the system contains, with completion and feature counts. Toggle scope here; execute via Blueprint."
    />
    <CapabilityGrid />
  </section>
);

const ArchitectureTab: React.FC = () => (
  <section>
    <TabIntro
      title="Architecture"
      blurb="How the layers fit together — backend, frontend, agents, data."
    />
    <SystemArchitectureCard />
    <div style={{
      marginTop: '1rem',
      padding: '0.75rem 0.95rem',
      background: 'var(--color-bg-alt)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 12,
      color: 'var(--color-text-light)',
    }}>
      <i className="bi bi-info-circle me-2" style={{ color: 'var(--color-info)' }}></i>
      For a per-BP visual flow (frontend / API / services / agents / database), open the
      <strong style={{ color: 'var(--color-text)' }}> BPs</strong> tab and pick a process.
    </div>
  </section>
);

const BPsTab: React.FC<{ initialBpId?: string | null }> = ({ initialBpId }) => (
  <section>
    {/* TabIntro intentionally omitted here — BPDomainSurface ships its own
        narrative headline that's richer than the static "Business
        Processes" blurb. Avoids the doubled-header pattern. The initialBpId
        is wired through via PortalBusinessProcessesTab's existing prop when
        the operator drops into the full inventory mode. */}
    <BPDomainSurface />
    {initialBpId && (
      <div style={{
        fontSize: 11, color: 'var(--color-text-light)',
        marginTop: '0.5rem', textAlign: 'right', fontStyle: 'italic',
      }}>
        Resumed your last BP context — open the inventory to inspect that BP directly.
      </div>
    )}
  </section>
);

const OperationsTab: React.FC = () => (
  <section>
    <TabIntro
      title="Operations"
      blurb="Advanced runtime visibility — autonomous execution lanes, governance handoffs, recovery archetypes. Collapsed by default; expand only if you need to inspect."
      advanced
    />
    <div style={{
      background: 'var(--color-bg-alt)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      padding: '0.85rem 1rem',
      fontSize: 12,
      color: 'var(--color-text-light)',
      marginBottom: '1rem',
    }}>
      <i className="bi bi-info-circle me-2" style={{ color: 'var(--color-info)' }}></i>
      Sections below come from the operator dashboard. They surface advanced operational state across all
      32 backend phases. <strong>You don't need to read these to use the platform.</strong>
    </div>
    <AutonomousExecutionDashboard defaultCollapsed={true} />
  </section>
);

const CognitionTab: React.FC = () => (
  <section>
    <TabIntro
      title="Cognition"
      blurb="Advanced intelligence visibility — reasoning continuity, governance memory, federation, archaeology. Collapsed by default."
      advanced
    />
    <div style={{
      background: 'var(--color-bg-alt)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      padding: '0.85rem 1rem',
      fontSize: 12,
      color: 'var(--color-text-light)',
      marginBottom: '1rem',
    }}>
      <i className="bi bi-info-circle me-2" style={{ color: 'var(--color-info)' }}></i>
      The cognition layer below is how the platform reasons about itself over time.
      It's hidden infrastructure — surfaced here for transparency, not because you need to act on it.
    </div>
    <OperatorCognitionDashboard defaultCollapsed={true} />
  </section>
);

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

const TabIntro: React.FC<{ title: string; blurb: string; advanced?: boolean }> = ({ title, blurb, advanced }) => (
  <header style={{ marginBottom: '1.1rem' }}>
    <h3 style={{
      fontSize: 16, fontWeight: 600, color: 'var(--color-primary)', margin: 0,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {title}
      {advanced && (
        <span style={{
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          background: 'var(--color-purple-bg, rgba(99,102,241,0.08))',
          color: 'var(--color-purple, #6366f1)',
          padding: '0.1rem 0.4rem',
          borderRadius: 3,
          fontWeight: 600,
        }}>advanced</span>
      )}
    </h3>
    <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 4 }}>
      {blurb}
    </div>
  </header>
);

const Disclosure: React.FC<{
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, open, onToggle, children }) => (
  <div style={{
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    marginTop: '1rem',
    overflow: 'hidden',
  }}>
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: '100%',
        background: 'var(--color-bg-alt)',
        border: 'none',
        padding: '0.7rem 0.95rem',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
      }}
      aria-expanded={open}
    >
      <i className={`bi ${open ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ color: 'var(--color-text-light)' }}></i>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 2 }}>{subtitle}</div>}
      </div>
    </button>
    {open && (
      <div style={{ padding: '0.95rem 1rem', background: 'white' }}>
        {children}
      </div>
    )}
  </div>
);

export default SystemView;
