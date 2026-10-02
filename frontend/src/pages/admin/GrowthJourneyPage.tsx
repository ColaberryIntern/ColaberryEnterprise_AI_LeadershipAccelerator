import React from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/admin/shell/PageHeader';
import StatCard from '../../components/admin/shell/StatCard';
import EmptyState from '../../components/admin/shell/EmptyState';
import SystemStateNotices from '../../components/growthJourney/SystemStateNotices';
import type { TrustSignal } from '../../components/admin/shell/trust';
import AsyncPanel from '../../components/explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from '../../components/growthJourney/useGrowthJourneyData';
import { wordsOf, brandNameOf } from '../../components/growthJourney/journeyWords';
import { TAB_VIEWS } from '../../components/growthJourney/tabViews';
import type { TabKey } from '../../components/growthJourney/tabKeys';
import { getStatusRegistry } from '../../services/growthJourneyApi';

/**
 * Growth Journey OS — the workspace (Phase 6, T613).
 *
 * Twelve backend tasks have been shipping into this system with no screen on it.
 * This is the shell and its Overview; the other eight tabs are later tasks and
 * render a plain "not built yet" rather than an empty panel, because an empty
 * panel is indistinguishable from a broken one.
 *
 * ── THE THREE STATES THIS PAGE MUST TELL APART ──────────────────────────────
 *
 * A dark system, an unseeded system and a working one look identical if you only
 * render rows. All three are reachable today and the first two are the LIKELY
 * ones, so each gets a named state rather than a spinner that never resolves:
 *
 *   1. SWITCHED OFF. `GROWTH_JOURNEY_ENABLED` gates the whole journey prefix and
 *      answers `{ error: 'Not found' }` - the routes genuinely do not exist. The
 *      banner names the flag, because "failed to load" would send someone
 *      debugging a system that is merely off.
 *   2. NO MEMBERSHIPS. Every journey read scopes by the caller's memberships, so
 *      with none an admin sees a complete, empty, entirely plausible system. The
 *      registry reports `memberships_populated` for exactly this reason and the
 *      state names the seed script to run.
 *   3. LOADED.
 *
 * The three `/status` reads answer while the flag is OFF (T604), which is what
 * makes state 1 reportable at all: the page can describe a dark system from
 * inside it. That is also why the registry - not a journey read - drives this
 * shell.
 *
 * ── TERMINOLOGY COMES FROM THE PROGRAMME, NOT FROM HERE ─────────────────────
 *
 * A CPN learner and a Colaberry Business buyer are not both "leads". Each
 * programme row carries its own `terminology`, and the header uses the selected
 * programme's words. Hardcoding "lead" here would quietly rebrand four brands.
 */


const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'dashboard-line' },
  { key: 'classification', label: 'Classification', icon: 'price-tag-3-line' },
  { key: 'decisions', label: 'Decisions', icon: 'git-branch-line' },
  { key: 'shadow', label: 'Shadow', icon: 'eye-line' },
  { key: 'content', label: 'Content', icon: 'book-open-line' },
  { key: 'handoffs', label: 'Handoffs', icon: 'user-shared-line' },
  { key: 'experiments', label: 'Experiments', icon: 'flask-line' },
  { key: 'performance', label: 'Performance', icon: 'line-chart-line' },
  { key: 'controls', label: 'Controls', icon: 'settings-3-line' },
];

const isTabKey = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

/** What a tab view needs from the page, so the lookup below can be one list. */
export default function GrowthJourneyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const tab: TabKey = isTabKey(raw) ? raw : 'overview';
  const brandId = searchParams.get('brand') ?? '';
  const programId = searchParams.get('program') ?? '';

  // The registry drives the header, the selects, the terminology AND both empty
  // states, so it is read once here rather than four times by four children.
  const registry = useGrowthJourneyData(getStatusRegistry, 'registry');

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    // `replace` so switching tabs does not fill the back button with one page.
    setSearchParams(next, { replace: true });
  };

  const reg = registry.data;
  const off = reg !== null && reg.flags.master === false;
  const unseeded = reg !== null && reg.memberships_populated === false;
  const words = wordsOf(reg, programId);
  // The nine inspect reads return `brand_id` as a bare UUID, so an empty state that
  // wants to name the brand it was empty FOR has to resolve it through the registry.
  // Null rather than the UUID: a raw id in a sentence meant for an operator is worse
  // than saying "every brand in your scope".
  const brandName_ = brandNameOf(reg, brandId);

  /**
   * The trust signal, derived from what the API returned.
   *
   * Never a hardcoded 'verified': this is the component whose entire job is
   * trustworthiness, and a literal here would be a lie told by the badge that
   * exists to prevent them. A dark system is `unverified`, not `error` - off is
   * a state, not a fault.
   */
  const trust: TrustSignal = registry.error
    ? {
        level: 'error',
        source: 'growth_journey status/registry',
        updatedAt: null,
        summary: `The workspace could not read its own configuration: ${registry.error.message}`,
      }
    : reg
      ? {
          level: off ? 'unverified' : 'live',
          source: 'growth_journey status/registry',
          updatedAt: null,
          summary: off
            ? 'Every journey switch is off. The registry is readable; nothing is running.'
            : `${reg.brands.length} brands, ${reg.programs.length} programmes, ${reg.paths.length} paths.`,
        }
      : { level: 'unverified', source: 'growth_journey status/registry', updatedAt: null };

  const programsForBrand = (reg?.programs ?? []).filter((p) => !brandId || p.brand_id === brandId);

  return (
    <div className="container-fluid py-3">
      <PageHeader
        title="Growth Journey OS"
        icon="route-line"
        subtitle={`One ${words.subject}'s ${words.pipeline}, across every brand on the framework.`}
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Growth Journey' }]}
        trust={trust}
        actions={
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={registry.reload} disabled={registry.loading}>
            <i className="ri-refresh-line me-1" aria-hidden="true" />
            Refresh
          </button>
        }
      >
        <AsyncPanel state={registry}>
          {(r) => (
            <>
              <div className="row g-3">
                <div className="col-6 col-lg-3">
                  <StatCard label="Brands" value={r.brands.length} icon="building-line" tone="primary" />
                </div>
                <div className="col-6 col-lg-3">
                  <StatCard label="Programmes" value={r.programs.length} icon="route-line" tone="info" />
                </div>
                <div className="col-6 col-lg-3">
                  <StatCard label="Paths" value={r.paths.length} icon="node-tree" tone="info" />
                </div>
                <div className="col-6 col-lg-3">
                  {/* Switches ON is the number that matters, and 0 is the correct,
                      calm answer today - the system is dark on purpose. */}
                  <StatCard
                    label="Switches on"
                    value={Object.values(r.flags).filter(Boolean).length}
                    unit="of 6"
                    icon="toggle-line"
                    tone={r.flags.master ? 'warning' : 'neutral'}
                    hint={r.flags.master ? 'the master flag is ON' : 'dark: nothing executes'}
                  />
                </div>
              </div>

              <div className="d-flex gap-2 mt-3 flex-wrap align-items-end">
                <div>
                  <label className="form-label small fw-medium mb-1" htmlFor="gj-brand">Brand</label>
                  <select
                    id="gj-brand"
                    className="form-select form-select-sm"
                    style={{ maxWidth: 220 }}
                    value={brandId}
                    onChange={(e) => setParam('brand', e.target.value)}
                  >
                    <option value="">All brands</option>
                    {r.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label small fw-medium mb-1" htmlFor="gj-program">Programme</label>
                  <select
                    id="gj-program"
                    className="form-select form-select-sm"
                    style={{ maxWidth: 240 }}
                    value={programId}
                    onChange={(e) => setParam('program', e.target.value)}
                  >
                    <option value="">All programmes</option>
                    {programsForBrand.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
        </AsyncPanel>
      </PageHeader>

      <SystemStateNotices off={off} unseeded={unseeded} />

      <ul className="nav nav-tabs mt-4 mb-3">
        {TABS.map((t) => (
          <li className="nav-item" key={t.key}>
            <button
              type="button"
              className={`nav-link${tab === t.key ? ' active' : ''}`}
              onClick={() => setParam('tab', t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
            >
              <i className={`ri-${t.icon} me-1`} aria-hidden="true" />
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      {/*
        * ONE list, and this time it really is one.
        *
        * The first draft of this block had `BUILT` as an array AND five separate
        * `tab === '…' &&` branches - two parallel lists that could disagree, and
        * T614's verifier proved they could: dropping 'content' from `BUILT` rendered
        * ContentTab AND the "not built yet" panel at the same time, with all 194
        * cells green. The same draft also claimed in a comment that
        * `adminNavGrowthJourney` asserted the list against `TABS`. IT DID NOT - that
        * suite never imports this file, and I had invented a named guarantee.
        *
        * So the lookup below IS the list: a tab is built if and only if it has an
        * entry, there is nothing to keep in step, and removing one makes the page
        * fall through to the unbuilt panel - which the page suite now catches by
        * mounting every built tab and asserting its heading renders.
        *
        * `words` and `brandName_` come down as props because the registry that
        * carries them is read ONCE here; four children re-reading it would be four
        * requests against a 120/min budget for an answer that cannot differ.
        * ShadowTab takes neither: its read is not brand-scoped and accepts no brand
        * filter, so handing it a brand would imply a scope it does not apply.
        */}
      {(TAB_VIEWS[tab] ?? ((): React.ReactNode => (
        // Named as unbuilt rather than rendered empty: an empty panel and a broken
        // one look the same.
        <EmptyState
          tone="quiet"
          icon="tools-line"
          title={`${TABS.find((t) => t.key === tab)?.label} is not built yet`}
          description="The backend reads for this tab exist; the panel is a later task in this phase."
        />
      )))({ words, brandName: brandName_, unseeded, programId })}
    </div>
  );
}
