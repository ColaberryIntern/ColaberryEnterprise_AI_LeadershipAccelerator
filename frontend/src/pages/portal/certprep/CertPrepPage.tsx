import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PortalShell from '../today/PortalShell';
import CondensedHeaderCard from '../today/CondensedHeaderCard';
import CertReadinessHero from './CertReadinessHero';
import CertProgressRail from './CertProgressRail';
import CertDomainMap from './CertDomainMap';
import CertEvidencePanel from './CertEvidencePanel';
import CertSessionRunner from './CertSessionRunner';
import {
  CertAvailability,
  CertReadiness,
  CertTrackInfo,
  CertDomain,
  getCertPrepSummary,
  getCertDomains,
} from '../../../services/certPrepApi';
import './certPrep.css';

/**
 * CertPrepPage — /portal/cert-prep.
 *
 * THE WEEK 7 STATE IS THE INTERESTING ONE. Before the fence opens this page shows
 * no readiness score, no locked question inventory, no zeroed dial and no
 * countdown — showing a student a 0 or a wall of padlocks in Week 3 manufactures
 * pressure the programme has deliberately decided they should not feel yet. It
 * says when Cert Prep starts, tells them their current builds will become
 * evidence, and points them back at this week's work.
 *
 * The frontend does NOT decide this. The server answers `available:false` with a
 * reason, and every activity endpoint refuses independently — so a stale client,
 * a direct fetch, or someone typing the URL gets the same answer. This component
 * renders a decision made elsewhere.
 */

/**
 * There is no 'overview' tab any more. The overview was a compact domain map
 * behind a tab, which meant a student had to leave whatever they were doing to
 * check whether it had moved. It now lives in the sticky rail on the right,
 * where it stays in view while the working area scrolls — the same shape every
 * other main portal page uses.
 */
type TabKey = 'domains' | 'practice' | 'mocks' | 'evidence';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'domains', label: 'Domain Map' },
  { key: 'practice', label: 'Practice' },
  { key: 'mocks', label: 'Mock Exams' },
  { key: 'evidence', label: 'Build Evidence' },
];

type LoadState = 'loading' | 'ready' | 'locked' | 'error';

const CertPrepPage: React.FC = () => {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [availability, setAvailability] = useState<CertAvailability | null>(null);
  const [readiness, setReadiness] = useState<CertReadiness | null>(null);
  const [track, setTrack] = useState<CertTrackInfo | null>(null);
  const [domains, setDomains] = useState<CertDomain[]>([]);
  const [tab, setTab] = useState<TabKey>('domains');
  const [errorText, setErrorText] = useState<string>('');
  const [runnerMode, setRunnerMode] = useState<'diagnostic' | 'practice' | 'mock' | null>(null);
  const [runnerDomains, setRunnerDomains] = useState<string[] | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement | null>(null);

  /**
   * "See Why" answers the hero's readiness number by sending the student to the
   * Domain Map. That map is ALSO the default tab, so `setTab('domains')` on its own
   * is a no-op the first time anyone clicks it: React bails out on an identical
   * state value, nothing re-renders, and the button reads as dead. Moving the panel
   * into view is the part that actually answers the question, and it has to happen
   * whether or not the tab changed.
   */
  const showDomainMap = useCallback(() => {
    setTab('domains');
    requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      panel.focus({ preventScroll: true });
    });
  }, []);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const summary = await getCertPrepSummary();
      setAvailability(summary.data.availability);

      if (!summary.data.availability.available) {
        setLoadState('locked');
        return;
      }
      setReadiness(summary.data.readiness);

      const detail = await getCertDomains();
      setTrack(detail.data.track);
      setDomains(detail.data.domains);
      setLoadState('ready');
    } catch (err: any) {
      // A 404 here means the feature flag is off, which is not an error the
      // student caused and not something to show a stack trace for.
      const status = err?.response?.status;
      setErrorText(
        status === 404
          ? 'Cert Prep is not switched on yet.'
          : 'We could not load your certification track. Try again in a moment.',
      );
      setLoadState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** The single recommended action, derived from the weakest sampled domain. */
  const nextAction = useMemo(() => {
    if (!readiness || readiness.overall_state === 'not_measured') {
      return { label: 'Take the baseline diagnostic', mode: 'diagnostic' as const, domainIds: undefined };
    }
    const sampled = readiness.domain_breakdown.filter((d) => d.answered > 0 && d.knowledge_pct !== null);
    const unsampled = readiness.domain_breakdown.find((d) => d.answered === 0);
    // An untouched domain outranks a merely weak one: breadth is what moves
    // confidence, and confidence is what gates the badge.
    if (unsampled) {
      const label = domains.find((d) => d.domain_id === unsampled.domain_id)?.label ?? unsampled.domain_id;
      return { label: `Practise ${label}`, mode: 'practice' as const, domainIds: [unsampled.domain_id] };
    }
    if (sampled.length > 0) {
      const weakest = sampled.reduce((a, b) => ((a.knowledge_pct ?? 1) <= (b.knowledge_pct ?? 1) ? a : b));
      const label = domains.find((d) => d.domain_id === weakest.domain_id)?.label ?? weakest.domain_id;
      return { label: `Drill ${label}`, mode: 'practice' as const, domainIds: [weakest.domain_id] };
    }
    return { label: 'Start a practice set', mode: 'practice' as const, domainIds: undefined };
  }, [readiness, domains]);

  const startRun = (mode: 'diagnostic' | 'practice' | 'mock', domainIds?: string[]) => {
    setRunnerDomains(domainIds);
    setRunnerMode(mode);
  };

  const onRunFinished = (updated: CertReadiness | null) => {
    if (updated) setReadiness(updated);
    setRunnerMode(null);
    void load();
  };

  // ── locked: before the fence opens ─────────────────────────────────────────
  if (loadState === 'locked') {
    const startWeek = availability?.startWeek ?? 7;
    const week = availability?.programWeek;
    return (
      <PortalShell>
        <div className="te-page-h">
          <div className="crumb">Your career</div>
          <h1>Cert Prep</h1>
          <div className="sub">Preparation for the Claude Certified Architect certification.</div>
        </div>
        <div className="cp-root">
          <section className="cp-locked" role="status">
            <h2>Cert Prep begins in Week {startWeek}</h2>
            <p>
              {week && week > 0
                ? `You are in Week ${week}. `
                : 'Your cohort has not started yet. '}
              There is nothing to do here yet, and that is deliberate.
            </p>
            <p className="cp-locked-why">
              Everything you build between now and then becomes the evidence half of
              your certification readiness. The exam assumes months of hands-on work,
              so the build weeks are the preparation — they just are not labelled
              that way yet.
            </p>
            <a className="cp-btn cp-btn--primary" href="/portal/classroom">
              Back to this week's work
            </a>
          </section>
        </div>
      </PortalShell>
    );
  }

  // ── error ──────────────────────────────────────────────────────────────────
  if (loadState === 'error') {
    return (
      <PortalShell>
        <div className="te-page-h">
          <div className="crumb">Your career</div>
          <h1>Cert Prep</h1>
        </div>
        <div className="cp-root">
          <section className="cp-empty" role="alert">
            <p>{errorText}</p>
            <button type="button" className="cp-btn cp-btn--ghost" onClick={() => void load()}>
              Try again
            </button>
          </section>
        </div>
      </PortalShell>
    );
  }

  // ── loading ────────────────────────────────────────────────────────────────
  if (loadState === 'loading') {
    return (
      <PortalShell>
        <div className="te-page-h">
          <div className="crumb">Your career</div>
          <h1>Cert Prep</h1>
        </div>
        <div className="cp-root">
          <div className="cp-skeleton" aria-busy="true" aria-label="Loading your certification track">
            <span /><span /><span />
          </div>
        </div>
      </PortalShell>
    );
  }

  // ── ready ──────────────────────────────────────────────────────────────────
  const railState = readiness?.overall_state ?? 'not_measured';
  /**
   * The condensed bar obeys the SAME honesty rule as the hero and the rail: a
   * readiness the server calls `not_measured` reads "Not measured", never the
   * number underneath it. The server does compute a scaled value before it is
   * meaningful, and printing it here would have contradicted the two other
   * places on the same screen that correctly refuse to.
   */
  const condensedSub = railState !== 'not_measured' && readiness?.overall_scaled != null
    ? `Readiness ${readiness.overall_scaled} · ${readiness.answered_total} answered`
    : `Not measured · ${readiness?.answered_total ?? 0} answered`;

  return (
    <PortalShell
      /* The same header slot every other main page fills: once you scroll past
         the hero, the next action condenses into the top bar so it is reachable
         without scrolling back. `CondensedHeaderCard` is the shared shape, so
         this reads identically to Projects, Classroom and Today. */
      condensedSlot={(
        <CondensedHeaderCard
          label="Cert Prep"
          title={nextAction.label}
          sub={condensedSub}
          tone={railState === 'sustained' ? 'leaf' : railState === 'approaching' ? 'berry' : 'amber'}
          action={(
            <button
              type="button"
              className="cp-btn cp-btn--primary"
              onClick={() => startRun(nextAction.mode, nextAction.domainIds)}
            >
              Start
            </button>
          )}
        />
      )}
    >
      {/* The h1 is the PAGE ("Cert Prep"), not the track — the destination is Cert
          Prep and the certification is what it prepares for, so the track name
          reads better in the subtitle.

          Measured note, so nobody re-derives it: this is NOT what fixes mobile
          overflow. The portal overflows horizontally at 390px on every page
          because the mobile bottom nav renders ~13 items that do not fit
          (/portal/points is worse than this page). Adding Cert Prep to the nav
          makes that bar one item wider; the bar was already overflowing without
          it. That is shell chrome shared by every surface and is deliberately
          left alone here rather than fixed from inside one feature. */}
      <div className="te-page-h">
        <div className="crumb">Your career</div>
        <h1>Cert Prep</h1>
        <div className="sub">
          {track?.display_name ? `${track.display_name}. ` : ''}
          Turn what you built in Classroom and Projects into a measured readiness plan.
          {availability?.programWeek ? ` You are in Week ${availability.programWeek}.` : ''}
        </div>
      </div>

      <div className="cp-root">
        {runnerMode ? (
          /* A sitting takes the full width on purpose: the rail is a tracker for
             between runs, and a countdown next to a question is a distraction. */
          <CertSessionRunner
            mode={runnerMode}
            domainIds={runnerDomains}
            onExit={() => setRunnerMode(null)}
            onFinished={onRunFinished}
          />
        ) : (
          <div className="te-grid">
            <div className="cp-col">
            <CertReadinessHero
              readiness={readiness}
              track={track}
              nextActionLabel={nextAction.label}
              onNextAction={() => startRun(nextAction.mode, nextAction.domainIds)}
              onSeeWhy={showDomainMap}
            />

            <div className="cp-tabs" role="tablist" aria-label="Cert Prep sections">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  id={`cp-tab-${t.key}`}
                  aria-selected={tab === t.key}
                  aria-controls={`cp-panel-${t.key}`}
                  className={`cp-tab${tab === t.key ? ' is-active' : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div
              ref={panelRef}
              className="cp-panel"
              role="tabpanel"
              id={`cp-panel-${tab}`}
              aria-labelledby={`cp-tab-${tab}`}
              tabIndex={0}
            >
              {tab === 'domains' && (
                <CertDomainMap
                  domains={domains}
                  readiness={readiness}
                  onDrill={(domainId) => startRun('practice', [domainId])}
                />
              )}

              {tab === 'practice' && (
                <div className="cp-actions-grid">
                  <button type="button" className="cp-action" onClick={() => startRun('practice', nextAction.domainIds)}>
                    <b>Weak-domain drill</b>
                    <small>Ten questions, weighted toward what you are missing.</small>
                  </button>
                  <button type="button" className="cp-action" onClick={() => startRun('practice')}>
                    <b>Mixed practice</b>
                    <small>Ten questions across every domain.</small>
                  </button>
                  <button type="button" className="cp-action" onClick={() => startRun('diagnostic')}>
                    <b>Retake the baseline</b>
                    <small>Fifteen questions, twenty-five minutes. Free to repeat.</small>
                  </button>
                </div>
              )}

              {tab === 'mocks' && (
                <div className="cp-actions-grid">
                  <button type="button" className="cp-action" onClick={() => startRun('mock')}>
                    <b>Full sitting</b>
                    <small>
                      {track?.exam_item_count ?? 60} questions in{' '}
                      {track?.exam_duration_minutes ?? 120} minutes — the real exam shape.
                    </small>
                  </button>
                  <p className="cp-note">
                    Readiness only reaches <b>Sustained</b> after you hold the target
                    across more than one full sitting.
                  </p>
                </div>
              )}

              {tab === 'evidence' && <CertEvidencePanel />}
            </div>
            </div>

            {/* The shell's shared sticky rail — right of the working column,
                left of the contacts list, the same slot Projects and Today use.
                It carries what a student watches while they work, so the numbers
                stay on screen instead of living behind a tab. */}
            <aside className="te-side">
              <CertProgressRail
                readiness={readiness}
                domains={domains}
                track={track}
                nextActionLabel={nextAction.label}
                onNextAction={() => startRun(nextAction.mode, nextAction.domainIds)}
              />
            </aside>
          </div>
        )}
      </div>
    </PortalShell>
  );
};

export default CertPrepPage;
