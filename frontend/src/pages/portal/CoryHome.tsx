/**
 * CoryHome — THE product home screen.
 *
 * One Brain Consolidation Sprint, 2026-05-09.
 *
 * Calm, focused, premium. Reads ONLY from useUnifiedProjectState — never
 * computes locally. Surfaces:
 *   - greeting + one-line status
 *   - Today's One Priority card (top of queue, with reason + blast + ETA)
 *   - 3-tile row: Readiness · Coverage · Health (each with a delta line)
 *   - Operational Queue (ranked, top 5)
 *   - Critical Blockers (only when present)
 *   - Active Build (only when present)
 *   - Verification Status (compact)
 *
 * Hard rule: there is no "next action" panel anywhere else on the platform
 * that disagrees with this page. This page IS the next-action authority.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  useUnifiedProjectState,
  type BlockerEntry,
} from '../../hooks/useUnifiedProjectState';
import { useOnboardingState } from '../../hooks/useOnboardingState';
import RequirementsBuilder from '../project/RequirementsBuilder';
import ProjectSwitcher from '../../components/project/ProjectSwitcher';
import { useWorkspaceMemory, type DrawerId } from '../../hooks/useWorkspaceMemory';
import { useOperationalMomentum } from '../../hooks/useOperationalMomentum';
import { useActivePath } from '../../hooks/useActivePath';
import { useOperatorFocus } from '../../hooks/useOperatorFocus';
import { dominantSignal } from '../../utils/operatorOrientationLanguage';
import ReadinessDrawer from '../../components/workspace/ReadinessDrawer';
import CoverageDrawer from '../../components/workspace/CoverageDrawer';
import WhyThisNextDrawer from '../../components/workspace/WhyThisNextDrawer';
import RecentlyMovedCard from '../../components/workspace/RecentlyMovedCard';
import OperationalHistoryStrip from '../../components/workspace/OperationalHistoryStrip';
import ContinuationCard from '../../components/workspace/ContinuationCard';
import FirstVisitFramingCard from '../../components/workspace/FirstVisitFramingCard';
import OperatorFocusCard from '../../components/workspace/OperatorFocusCard';
import { fireToast } from '../../components/workspace/MicroToast';
import portalApi from '../../utils/portalApi';
import {
  BAND_COLOR,
  NextActionCard,
  EmptyPriorityCard,
  QueueRow,
  SectionHeader,
  Tile,
  Stat,
  greetingFor,
  shortenOrgName,
  buildOneLineStatus,
  StudentQueueSection,
  RunMyDayMode,
  type StudentQueueItem,
} from './CoryHomeParts';

const SEVERITY_COLOR: Record<BlockerEntry['severity'], string> = {
  low: 'var(--color-info)',
  medium: 'var(--color-warning)',
  high: 'var(--color-danger)',
  critical: 'var(--color-danger)',
};

const CoryHome: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // 2026-05-20: first-run detection. If the user has no project or no
  // requirements yet, render the requirements builder INLINE instead of
  // the dashboard. The dashboard is meaningless without a project and
  // surfaces 0% tiles that confuse new users.
  const onboarding = useOnboardingState();
  const { state, loading, error, refresh } = useUnifiedProjectState({ pollMs: 60_000 });
  const { memory, update, recordSnapshot } = useWorkspaceMemory();

  // First-run gate signal — checked below the rest of the hooks so we
  // never violate the Rules of Hooks across renders.
  const isFirstRun = onboarding.state?.stage === 'needs_requirements';

  // If an Architect build is in flight, route Home to the live preview demo
  // instead of the first-run chooser — so revisiting Home mid-build resumes it.
  useEffect(() => {
    if (onboarding.state?.build_in_progress) {
      navigate('/portal/project/demo', { replace: true });
    }
  }, [onboarding.state?.build_in_progress, navigate]);

  // Framing card visibility is gated ONLY on seenIntros.home. Anyone
  // who hasn't dismissed sees it once; after dismiss it never shows
  // again. We don't try to detect "real" first visit — too racy with
  // the snapshot poll. The one-time courtesy explanation for existing
  // operators is acceptable; the alternative (timing-based detection)
  // is fragile across React strict-mode remounts and the snapshot
  // useEffect lifecycle.

  // Continuity inputs — sessionStorage signals the active-path hook needs.
  // Read once at mount; refreshed via state.built_at so we pick up changes
  // made in other tabs.
  const [continuityInputs, setContinuityInputs] = useState<{
    pendingPrompt: string | null;
    pendingRoute: string | null;
    lastCritiqueAt: string | null;
  }>({ pendingPrompt: null, pendingRoute: null, lastCritiqueAt: null });
  useEffect(() => {
    try {
      setContinuityInputs({
        pendingPrompt: sessionStorage.getItem('visualWorkspace:pendingBuildPrompt'),
        pendingRoute: sessionStorage.getItem('visualWorkspace:pendingBuildSourceRoute'),
        lastCritiqueAt: sessionStorage.getItem('visualWorkspace:lastSessionTouchedAt'),
      });
    } catch { /* ignore */ }
  }, [state?.built_at]);

  // Freeze the memory state as it was when this session started. Momentum
  // is computed against this frozen snapshot — not the live mutable memory.
  // Without freezing, the recordSnapshot effect below would overwrite
  // memory.lastXxx values on the first state arrival, deltas would zero
  // out within one render, and RecentlyMovedCard / tile chevrons would
  // never appear. The frozen snapshot represents "what you knew at the
  // start of this visit" — the correct comparison for "what's moved".
  const initialMemoryRef = useRef(memory);
  const momentum = useOperationalMomentum(state, initialMemoryRef.current);

  // ActivePath — single most-relevant continuation. Computed against the
  // frozen session-start memory so the operator sees what they were doing
  // BEFORE this session, not what they just clicked on.
  const activePath = useActivePath({
    state,
    memory: initialMemoryRef.current,
    pendingCritiquePrompt: continuityInputs.pendingPrompt,
    pendingCritiqueRoute: continuityInputs.pendingRoute,
    lastCritiqueAt: continuityInputs.lastCritiqueAt,
  });

  // OperatorFocus — which operational domain the operator is currently
  // shaping. Derived from the frozen session-start memory (the domain they
  // engaged BEFORE this visit), same rationale as momentum + activePath.
  const operatorFocus = useOperatorFocus(initialMemoryRef.current);

  // ── Student CB-System queue ───────────────────────────────────────────────
  const [studentQueue, setStudentQueue] = useState<StudentQueueItem[]>([]);
  const [sqLoading, setSqLoading] = useState(false);
  const [sqError, setSqError] = useState<string | null>(null);
  const [sqExpandedId, setSqExpandedId] = useState<string | null>(null);
  const [sqCopiedId, setSqCopiedId] = useState<string | null>(null);
  const [sqDecidingId, setSqDecidingId] = useState<string | null>(null);
  const [walkMode, setWalkMode] = useState(false);
  const [walkIndex, setWalkIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setSqLoading(true);
      setSqError(null);
      try {
        const r = await portalApi.get<{ items: StudentQueueItem[] }>('/api/portal/student-ops/my-queue');
        if (!cancelled) setStudentQueue(r.data.items || []);
      } catch (err: any) {
        if (!cancelled) setSqError(err?.response?.data?.error || err?.message || 'Failed to load queue');
      } finally {
        if (!cancelled) setSqLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const handleSqToggle = (id: string) => {
    setSqExpandedId((prev) => (prev === id ? null : id));
  };

  const handleSqDone = async (id: string) => {
    setSqDecidingId(id);
    try {
      await portalApi.post('/api/portal/student-ops/decide', { requirement_id: id, decision: 'done' });
      setStudentQueue((prev) => prev.filter((q) => q.id !== id));
      if (walkMode) {
        setWalkIndex((i) => Math.min(i, studentQueue.length - 2));
      }
    } catch {
      // fail silently — queue item stays; user can retry
    } finally {
      setSqDecidingId(null);
    }
  };

  const handleSqDefer = (id: string) => {
    setStudentQueue((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.push({ ...item, rank: next.length + 1 });
      return next.map((q, i) => ({ ...q, rank: i + 1 }));
    });
    if (walkMode) {
      setWalkIndex((i) => Math.min(i, studentQueue.length - 2));
    }
  };

  const handleSqFlagBlocker = async (id: string) => {
    setSqDecidingId(id);
    try {
      await portalApi.post('/api/portal/student-ops/decide', { requirement_id: id, decision: 'flag_blocker' });
      setStudentQueue((prev) =>
        prev.map((q) => q.id === id ? { ...q, status: 'unmatched' } : q),
      );
    } catch {
      // fail silently
    } finally {
      setSqDecidingId(null);
      setSqExpandedId(null);
    }
  };

  const handleSqCopyPrompt = (prompt: string, id?: string) => {
    try { navigator.clipboard.writeText(prompt); } catch { /* ignore */ }
    const targetId = id ?? sqExpandedId;
    if (targetId) {
      setSqCopiedId(targetId);
      setTimeout(() => setSqCopiedId(null), 2000);
    }
  };

  const handleWalkNav = (delta: -1 | 1) => {
    setWalkIndex((i) => Math.max(0, Math.min(studentQueue.length - 1, i + delta)));
  };

  // Keyboard nav for Run My Day modal
  useEffect(() => {
    if (!walkMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleWalkNav(1);
      else if (e.key === 'ArrowLeft') handleWalkNav(-1);
      else if (e.key === 'Escape') setWalkMode(false);
      else if (e.key === ' ') {
        e.preventDefault();
        const item = studentQueue[walkIndex];
        if (item) handleSqCopyPrompt(item.claude_code_prompt, item.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [walkMode, walkIndex, studentQueue]); // eslint-disable-line

  // ── Contextual drawers ────────────────────────────────────────────────────
  // Contextual drawers — opened by clicking tiles or the priority card.
  // The drawer key is persisted to memory so the next visit can offer
  // "you last opened the X drawer" affordances.
  const [openDrawer, setOpenDrawer] = useState<DrawerId | null>(null);
  const openDrawerWithMemory = (id: DrawerId | null) => {
    setOpenDrawer(id);
    if (id) update({ lastDrawerOpen: id });
  };

  // Restore-drawer from URL — when the ContinuationCard navigates to
  // /portal/home?drawer=coverage, automatically open that drawer + scrub
  // the param so a refresh doesn't loop. Guarded by `drawerHandled` so the
  // handler runs once per mount regardless of subsequent param changes.
  const [drawerHandled, setDrawerHandled] = useState(false);
  useEffect(() => {
    if (drawerHandled) return;
    setDrawerHandled(true);
    const drawerParam = searchParams.get('drawer') as DrawerId | null;
    if (!drawerParam) return;
    const valid: DrawerId[] = ['readiness', 'coverage', 'why-this-next', 'cory'];
    if (!valid.includes(drawerParam)) return;
    setOpenDrawer(drawerParam);
    const next = new URLSearchParams(searchParams);
    next.delete('drawer');
    setSearchParams(next, { replace: true });
  }, [drawerHandled, searchParams, setSearchParams]);

  // Detect whether the priority card content is fresh (the source_id we are
  // showing now differs from what the operator last saw). When fresh, we
  // apply the ws-fresh halo for 6s so the card visually announces itself.
  const priorityIsFresh =
    !!state?.next_action?.source_id
    && state.next_action.source_id !== memory.lastSeenNextActionId;

  // Capture this surface as the last-visited so the context bar / next
  // session can show "Last visited Home X min ago".
  useEffect(() => {
    update({ lastVisitedSurface: 'home' });
  }, [update]);

  // Cross-surface arrival acknowledgment — when the operator lands on
  // Home with meaningful forward momentum that they haven't yet
  // acknowledged for THIS exact session-start snapshot, fire a single
  // welcome-back toast. Dedup signature includes the frozen snapshot's
  // built_at so future visits with the same comparison don't re-fire.
  const arrivalToastFiredRef = useRef(false);
  useEffect(() => {
    if (arrivalToastFiredRef.current) return;
    if (!state || !momentum.hasMomentum) return;
    if (momentum.netForwardMotion < 2) return;
    arrivalToastFiredRef.current = true;
    const builtAt = initialMemoryRef.current.lastBuiltAt || 'first';
    const bits: string[] = [];
    if (momentum.readinessDelta && momentum.readinessDelta > 0) bits.push(`Readiness +${momentum.readinessDelta}`);
    if (momentum.coverageDelta && momentum.coverageDelta > 0) bits.push(`Coverage +${momentum.coverageDelta}`);
    if (momentum.queueDelta && momentum.queueDelta < 0) bits.push(`Queue ${momentum.queueDelta}`);
    if (momentum.healthDelta && momentum.healthDelta > 0) bits.push(`Health +${momentum.healthDelta}`);
    if (bits.length === 0) return;
    fireToast({
      icon: 'bi-arrow-up-right',
      tone: 'good',
      message: `Welcome back — ${bits.join(' · ')} while you were away`,
      signature: `arrival:${builtAt}`,
    });
  }, [state, momentum.hasMomentum, momentum.netForwardMotion, momentum.readinessDelta, momentum.coverageDelta, momentum.queueDelta, momentum.healthDelta]);

  // Snapshot the current readiness/coverage/queue/health so the NEXT visit
  // can compute "since you were last here" deltas. We deliberately do NOT
  // snapshot on every state poll — that would overwrite the frozen memory
  // before momentum can render. Instead, snapshot when the user *leaves*
  // (visibilitychange to hidden, or beforeunload). The latest state values
  // are held in a ref so the leave handler can read them without
  // re-binding listeners on every poll.
  const latestStateRef = useRef(state);
  useEffect(() => { latestStateRef.current = state; }, [state]);

  // Momentum + focus held in refs so the leave handler can read the values
  // as they were at leave time without re-binding listeners every render.
  const latestMomentumRef = useRef(momentum);
  useEffect(() => { latestMomentumRef.current = momentum; }, [momentum]);
  const latestFocusRef = useRef(operatorFocus);
  useEffect(() => { latestFocusRef.current = operatorFocus; }, [operatorFocus]);

  useEffect(() => {
    const snapshotNow = () => {
      const s = latestStateRef.current;
      if (!s) return;
      recordSnapshot({
        readinessScore: s.readiness.score,
        coverageScore: s.coverage.score,
        queueSize: s.queue.length,
        healthScore: s.health.score,
        builtAt: s.built_at,
      });
      // Contribution memory — if the operator made forward motion this
      // visit AND has a focus domain, record it (exactly one, overwritten)
      // so the next visit can ambiently acknowledge it. Not a feed, not a
      // score — just the most recent forward step, framed editorially.
      const m = latestMomentumRef.current;
      const f = latestFocusRef.current;
      if (m.netForwardMotion > 0 && f.domain) {
        const sig = dominantSignal(m);
        if (sig) {
          update({
            lastContribution: {
              domainLabel: f.domain.label,
              signal: sig.noun,
              at: new Date().toISOString(),
            },
          });
        }
      }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') snapshotNow(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', snapshotNow);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', snapshotNow);
      // Snapshot on unmount (navigation within SPA) as well so the
      // next surface visit has fresh comparison values.
      snapshotNow();
    };
  }, [recordSnapshot, update]);

  // 2026-05-20: first-run short-circuit. Comes AFTER every hook above so
  // we never violate the Rules of Hooks across the loading → loaded
  // transition of useOnboardingState (a prior version of this guard sat
  // before later hooks and crashed with React error #300).
  if (isFirstRun) {
    // A build is running — show a brief spinner while the effect above
    // redirects to the live demo (avoids flashing the chooser).
    if (onboarding.state?.build_in_progress) {
      return (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading</span></div>
          <p className="text-muted mt-2" style={{ fontSize: 13 }}>Resuming your build…</p>
        </div>
      );
    }
    return (
      <div>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '2.5rem 1.5rem 1rem' }}>
          <div className="d-flex justify-content-end mb-2"><ProjectSwitcher /></div>
          <div style={{
            fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--color-text-light)', fontWeight: 600,
          }}>
            Welcome
          </div>
          <h1 style={{
            fontSize: 22, fontWeight: 600, color: 'var(--color-primary)',
            margin: '4px 0 6px', letterSpacing: '-0.01em',
          }}>
            Let&rsquo;s start by capturing what you want to build.
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-light)', lineHeight: 1.55, margin: 0 }}>
            The portal needs a requirements document before it can show progress,
            queue work, or surface gaps. Describe your idea below — Cory will turn
            it into a structured requirements set with a short Q&amp;A.
          </p>
        </div>
        <RequirementsBuilder onComplete={() => {
          // Re-fetch onboarding (stage flips needs_requirements → has_requirements)
          // and project state so this same /portal/home render swaps the inline
          // builder for the live dashboard without a hard reload.
          void onboarding.refresh();
          void refresh();
        }} />
      </div>
    );
  }

  if (loading && !state) {
    return (
      <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--color-text-light)' }}>
        <div className="spinner-border spinner-border-sm me-2" role="status" />
        Loading your home…
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="container-narrow" style={{ padding: '2rem 1rem' }}>
        <div className="alert alert-warning">
          <strong>Could not load operational state.</strong>
          <div style={{ fontSize: 13, color: 'var(--color-text-light)', marginTop: 4 }}>{error}</div>
          <button className="btn btn-sm btn-outline-primary mt-2" onClick={() => void refresh()}>Try again</button>
        </div>
      </div>
    );
  }

  if (!state) return null;

  const greetingName = shortenOrgName(state.project.organization_name);
  const queueTotal = state.queue.length;
  const blockerCount = state.blockers.length;
  const oneLineStatus = buildOneLineStatus(queueTotal, blockerCount);

  const readinessC = BAND_COLOR[state.readiness.band];

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      {/* Greeting */}
      <header style={{ marginBottom: '1.5rem' }}>
        <div className="d-flex justify-content-end mb-2"><ProjectSwitcher /></div>
        <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-primary)', letterSpacing: '-0.01em' }}>
          {greetingFor(new Date())}, <span style={{ color: 'var(--color-primary-light)' }}>{greetingName}</span>.
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-light)', marginTop: 4 }}>
          {oneLineStatus}
        </div>
      </header>

      {/* First-visit ambient framing. Appears ONLY when memory is empty
          (no prior snapshot) AND the operator has not dismissed it. Once
          dismissed via the "Got it" button, it never reappears for this
          operator on this device. Operational Onboarding Sprint, 2026-05-16. */}
      <FirstVisitFramingCard
        surface="home"
        isFirstVisit={true}
        eyebrow="WHAT YOU'RE LOOKING AT"
        body="Cory reads your operational system every visit and surfaces one thing worth doing next. The tiles below show how the system is moving — readiness, coverage, health. The strip at the bottom remembers your last touch so you can pick up where you left off."
      />

      {/* Today's one priority */}
      {state.next_action ? (
        <NextActionCard
          action={state.next_action}
          fresh={priorityIsFresh}
          onGo={() => navigate(state.next_action!.target_route)}
          onWhy={() => openDrawerWithMemory('why-this-next')}
        />
      ) : (
        <EmptyPriorityCard />
      )}

      {/* Continuation affordance — "You were working on …". One row. Hidden
          when there's no meaningful continuation, dismissible per-session. */}
      <ContinuationCard path={activePath} />

      {/* Operator orientation — "where you are shaping the system". Calm,
          non-interactive. Hidden when there's no focus signal yet. The
          leverage summary is the cached observation from the operator's
          last System BPs visit, surfaced as one ambient line. */}
      <OperatorFocusCard
        focus={operatorFocus}
        momentum={momentum}
        leverageSummary={initialMemoryRef.current.lastLeverageSummary}
      />

      {/* Recently-moved — shows deltas vs last snapshot. Hidden when nothing has moved. */}
      <RecentlyMovedCard momentum={momentum} />

      {/* 3-tile row — Readiness + Coverage are click-through to drawers */}
      <div className="row g-3 mb-3">
        <div className="col-md-4">
          <Tile
            label="Readiness"
            sublabel="how prepared the project is · click for breakdown"
            value={`${state.readiness.score}%`}
            valueColor={readinessC.fg}
            footer={readinessC.label}
            footerColor={readinessC.fg}
            tooltip={state.readiness.reasons[0]}
            onClick={() => openDrawerWithMemory('readiness')}
            highlight={momentum.readinessDelta != null && momentum.readinessDelta > 0}
          />
        </div>
        <div className="col-md-4">
          <Tile
            label="Coverage"
            sublabel="requirements with implementation · click for breakdown"
            value={state.coverage.requirements_total > 0
              ? `${state.coverage.score}%`
              : '—'}
            valueColor="var(--color-primary)"
            footer={state.coverage.requirements_total > 0
              ? `${state.coverage.requirements_matched} of ${state.coverage.requirements_total} requirements matched`
              : 'No requirements extracted yet'}
            footerColor="var(--color-text-light)"
            onClick={() => openDrawerWithMemory('coverage')}
            highlight={momentum.coverageDelta != null && momentum.coverageDelta > 0}
          />
        </div>
        <div className="col-md-4">
          <Tile
            label="Health"
            sublabel="system stability today"
            value={`${state.health.score}%`}
            valueColor={state.health.score >= 80 ? 'var(--color-success)' : state.health.score >= 60 ? 'var(--color-warning)' : 'var(--color-danger)'}
            footer={state.health.regressions_24h === 0 ? 'Stable' : `${state.health.regressions_24h} regression(s) in 24h`}
            footerColor="var(--color-text-light)"
            highlight={momentum.healthDelta != null && momentum.healthDelta > 0}
          />
        </div>
      </div>

      {/* Drawers — anchored at the page level, opened by tiles + priority card */}
      <ReadinessDrawer open={openDrawer === 'readiness'} onClose={() => openDrawerWithMemory(null)} />
      <CoverageDrawer open={openDrawer === 'coverage'} onClose={() => openDrawerWithMemory(null)} />
      <WhyThisNextDrawer open={openDrawer === 'why-this-next'} onClose={() => openDrawerWithMemory(null)} />

      {/* Things to address — only when present (less alarming than "Critical blockers") */}
      {blockerCount > 0 && (
        <section className="mb-3">
          <SectionHeader title="Things to address" badge={`${blockerCount}`} aside="lifted from Cory's signals" />
          <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
            {state.blockers.map((b, i) => (
              <div
                key={`${b.source}:${b.source_id || i}`}
                style={{
                  padding: '0.75rem 0.95rem',
                  borderBottom: i < blockerCount - 1 ? '1px solid var(--color-border)' : 'none',
                  borderLeft: `3px solid ${SEVERITY_COLOR[b.severity]}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{b.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 2 }}>{b.reason}</div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontWeight: 600,
                    color: SEVERITY_COLOR[b.severity],
                  }}
                >
                  {b.severity}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Operational queue */}
      <section className="mb-3">
        <SectionHeader
          title="Operational queue"
          badge={queueTotal > 0 ? `${queueTotal}` : undefined}
          aside="Cory's authority — every surface agrees with this order."
        />
        {queueTotal === 0 ? (
          <div className="ws-breath" style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, padding: '1.25rem', textAlign: 'center', color: 'var(--color-text-light)', fontSize: 13 }}>
            <i className="bi bi-check2-circle me-1" style={{ color: 'var(--color-success)' }}></i>
            Nothing in the queue. The platform is caught up.
          </div>
        ) : (
          <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
            {state.queue.map((q, i) => (
              <QueueRow
                key={`${q.source}:${q.source_id || i}`}
                entry={q}
                first={i === 0}
                last={i === queueTotal - 1}
                onGo={() => navigate(q.target_route)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Student build queue — priority engine + approval workspace + Run My Day */}
      <StudentQueueSection
        items={studentQueue}
        loading={sqLoading}
        error={sqError}
        expandedId={sqExpandedId}
        onToggle={handleSqToggle}
        onDone={handleSqDone}
        onDefer={handleSqDefer}
        onFlagBlocker={handleSqFlagBlocker}
        onCopyPrompt={(prompt) => handleSqCopyPrompt(prompt)}
        copiedId={sqCopiedId}
        decidingId={sqDecidingId}
        onEnterWalkMode={() => { setWalkIndex(0); setWalkMode(true); }}
      />

      {/* Active build + verification */}
      <div className="row g-3 mb-3">
        <div className="col-md-7">
          <SectionHeader title="Active build" />
          {state.active_build ? (
            <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.85rem 1rem' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{state.active_build.title}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 4 }}>
                Started {new Date(state.active_build.started_at).toLocaleString()} · target <code>{state.active_build.target_ref}</code>
              </div>
              <Link to="/portal/project/blueprint" className="btn btn-sm btn-outline-primary mt-2">
                <i className="bi bi-arrow-right me-1"></i>Continue in Blueprint
              </Link>
            </div>
          ) : (
            <div className="ws-breath" style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.85rem 1rem', fontSize: 13, color: 'var(--color-text-light)' }}>
              No active build. Pick a queue item to start.
            </div>
          )}
        </div>
        <div className="col-md-5">
          <SectionHeader title="Verification" />
          <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'space-around', textAlign: 'center', fontSize: 12 }}>
              <Stat label="Pending" value={state.verification.pending} color="var(--color-warning)" />
              <Stat label="Passing" value={state.verification.passing} color="var(--color-success)" />
              <Stat label="Failing" value={state.verification.failing} color="var(--color-danger)" />
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-light)', textAlign: 'center', marginTop: 8 }}>
              24h pass rate: <strong>{Math.round(state.verification.pass_rate_24h * 100)}%</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Operational history strip — richer than the prior "Synthesized at HH:MM"
          footer. Shows synthesis age, last-touched age, last-critique age, and
          confidence — all sourced from state + memory + sessionStorage. */}
      <OperationalHistoryStrip state={state} memory={memory} />

      {/* Run My Day overlay — full-screen walk mode for the student build queue */}
      {walkMode && studentQueue.length > 0 && (
        <RunMyDayMode
          items={studentQueue}
          currentIndex={walkIndex}
          onNav={handleWalkNav}
          onExit={() => setWalkMode(false)}
          onDone={(id) => { void handleSqDone(id); if (walkIndex >= studentQueue.length - 1) setWalkMode(false); }}
          onDefer={(id) => { handleSqDefer(id); if (walkIndex >= studentQueue.length - 1) setWalkIndex(Math.max(0, studentQueue.length - 2)); }}
          onCopyPrompt={handleSqCopyPrompt}
          copiedId={sqCopiedId}
          decidingId={sqDecidingId}
        />
      )}
    </div>
  );
};
export default CoryHome;
