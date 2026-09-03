import React from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/admin/shell/PageHeader';
import StatCard from '../../components/admin/shell/StatCard';
import type { TrustSignal } from '../../components/admin/shell/trust';
import AsyncPanel from '../../components/explorerGrowth/AsyncPanel';
import { useExplorerData } from '../../components/explorerGrowth/useExplorerData';
import OverviewTab from '../../components/explorerGrowth/OverviewTab';
import JourneyTab from '../../components/explorerGrowth/JourneyTab';
import DecisionsTab from '../../components/explorerGrowth/DecisionsTab';
import ShadowTab from '../../components/explorerGrowth/ShadowTab';
import ContentTab from '../../components/explorerGrowth/ContentTab';
import SettingsTab from '../../components/explorerGrowth/SettingsTab';
import { getSummary } from '../../services/explorerGrowthApi';

/**
 * Explorer Growth OS — Command Center (spec §26).
 *
 * Seven epics have scored, classified and decided on every Explorer nightly
 * since EPIC 4. Until this page, reading any of it meant a bearer token and a
 * terminal.
 *
 * ── READ-ONLY, DELIBERATELY ─────────────────────────────────────────────────
 *
 * §26's mockup puts `[ SHADOW ▾ ] [ Recalculate ] [ ⛔ PAUSE ]` in this header.
 * They are not here, and their absence is a decision rather than an omission:
 * all seven of §27's write routes are unbuilt, so the buttons would 404 — and a
 * kill switch that looks clickable but does nothing is worse than no kill
 * switch. The mode control in particular is a governance boundary, not a
 * widget: its upper values are what would let this system begin sending to 153
 * real learners.
 *
 * The Settings tab says all of this on the page, so nobody waits for a panel
 * that is not coming.
 */

type TabKey = 'overview' | 'journey' | 'decisions' | 'shadow' | 'content' | 'settings';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'dashboard-line' },
  { key: 'journey', label: 'Journey', icon: 'route-line' },
  { key: 'decisions', label: 'Decisions', icon: 'git-branch-line' },
  { key: 'shadow', label: 'Shadow', icon: 'eye-line' },
  { key: 'content', label: 'Content', icon: 'book-open-line' },
  { key: 'settings', label: 'Settings', icon: 'settings-3-line' },
];

const isTabKey = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

export default function ExplorerGrowthPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const tab: TabKey = isTabKey(raw) ? raw : 'overview';

  // The summary drives the header, the stat row AND the trust badge, so it is
  // fetched once here rather than three times by three children.
  const summary = useExplorerData(getSummary, 'summary');

  const selectTab = (key: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    // `replace` so tab switching does not fill the back button with six entries
    // of the same page.
    setSearchParams(next, { replace: true });
  };

  /**
   * The trust signal, derived from what the API actually returned.
   *
   * Never a hardcoded 'verified'. This is the one component whose job is
   * trustworthiness, the Trust Center aggregates it across every admin page,
   * and a literal here would be a lie told by the badge that exists to prevent
   * lies. `error` when the request failed; `unverified` while it is unknown.
   */
  const trust: TrustSignal = summary.error
    ? {
        level: 'error',
        source: 'explorer_journey_profiles',
        updatedAt: null,
        summary: `The Command Center could not read its own state: ${summary.error.message}`,
      }
    : summary.data
      ? {
          level: 'live',
          source: 'explorer_journey_profiles',
          updatedAt: summary.data.decision_date,
          summary:
            `${summary.data.total} decisions on ${summary.data.decision_date ?? 'no run yet'} ` +
            `in ${summary.data.modes.join(', ') || 'unknown'} mode. ` +
            `${summary.data.executed} executed.`,
          pillars: [
            {
              name: 'Freshness',
              status: 'live',
              evidence: [
                { label: 'Latest run', value: summary.data.decision_date ?? 'none' },
                { label: 'Learners with a profile', value: String(summary.data.learners_with_profile) },
              ],
            },
            {
              name: 'Coverage',
              status: summary.data.gaps > 0 ? 'stale' : 'verified',
              evidence: [
                { label: 'Actionable decisions', value: String(summary.data.actionable) },
                { label: 'Carrying content', value: String(summary.data.with_content) },
                { label: 'Reporting a content gap', value: String(summary.data.gaps) },
              ],
            },
          ],
        }
      : { level: 'unverified', source: 'explorer_journey_profiles', updatedAt: null };

  return (
    <div className="container-fluid py-3">
      <PageHeader
        title="Explorer Growth OS"
        icon="radar-line"
        subtitle="What the system decided about every Explorer last night, and why."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Explorer Growth' }]}
        trust={trust}
        actions={
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={summary.reload}
            disabled={summary.loading}
          >
            <i className="ri-refresh-line me-1" aria-hidden="true" />
            Refresh
          </button>
        }
      >
        <AsyncPanel state={summary}>
          {(s) => (
            <div className="row g-3">
              <div className="col-6 col-lg">
                <StatCard label="Learners" value={s.learners_with_profile.toLocaleString()} icon="group-line" tone="primary" hint="with a journey profile" />
              </div>
              <div className="col-6 col-lg">
                <StatCard label="Decisions" value={s.total.toLocaleString()} icon="git-branch-line" tone="info" hint={s.decision_date ?? 'no run yet'} />
              </div>
              <div className="col-6 col-lg">
                <StatCard label="Actionable" value={s.actionable.toLocaleString()} icon="play-circle-line" tone="info" hint={`${s.waited} waited`} />
              </div>
              <div className="col-6 col-lg">
                <StatCard label="With content" value={s.with_content.toLocaleString()} icon="mail-send-line" tone="success" />
              </div>
              <div className="col-6 col-lg">
                <StatCard
                  label="Content gaps"
                  value={s.gaps.toLocaleString()}
                  icon="error-warning-line"
                  tone={s.gaps > 0 ? 'warning' : 'neutral'}
                  hint={s.gaps > 0 ? 'see Content tab' : 'none'}
                />
              </div>
              <div className="col-6 col-lg">
                {/* 0 executed is the POINT, not a gap in the data: every flag is
                    off and the system is in shadow. Shown in a calm tone so it
                    does not read as a fault. */}
                <StatCard
                  label="Executed"
                  value={s.executed.toLocaleString()}
                  icon="shield-check-line"
                  tone={s.executed === 0 ? 'neutral' : 'danger'}
                  hint={s.executed === 0 ? 'nothing sent' : 'ACTIONS WERE EXECUTED'}
                />
              </div>
            </div>
          )}
        </AsyncPanel>
      </PageHeader>

      <ul className="nav nav-tabs mt-4 mb-3">
        {TABS.map((t) => (
          <li className="nav-item" key={t.key}>
            <button
              type="button"
              className={`nav-link${tab === t.key ? ' active' : ''}`}
              onClick={() => selectTab(t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
            >
              <i className={`ri-${t.icon} me-1`} aria-hidden="true" />
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'journey' && <JourneyTab />}
      {tab === 'decisions' && <DecisionsTab />}
      {tab === 'shadow' && <ShadowTab />}
      {tab === 'content' && <ContentTab />}
      {/* The whole state, not `summary.data` — the tab must be able to tell
          loading from empty from failed, like every other tab here. */}
      {tab === 'settings' && <SettingsTab state={summary} />}
    </div>
  );
}
